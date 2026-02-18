import type { NextRequest } from "next/server";
import {
  providerGetParams,
  providerPublishParams,
  providerPublishData,
} from "@/lib/validation/registry";
import {
  notFound,
  validationError,
  badRequest,
  conflict,
  internalError,
} from "@/lib/api/errors";
import { jsonResponse, noContentResponse } from "@/lib/api/response";
import {
  findProvider,
  saveProvider,
  deleteProvider,
  getProviderPlatforms,
} from "@/lib/data/providers";
import {
  uploadProviderZip,
  uploadShasums,
  uploadShasumsSignature,
  deleteByPrefix,
} from "@/lib/storage/r2";

type RouteParams = {
  params: Promise<{ namespace: string; type: string; version: string }>;
};

/**
 * GET /v1/providers/:namespace/:type/:version
 *
 * Return full metadata for a specific provider version with platforms.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const rawParams = await params;
    const parsed = providerGetParams.safeParse(rawParams);
    if (!parsed.success) return validationError(parsed.error.issues);

    const { namespace, type, version } = parsed.data;
    const provider = await findProvider(namespace, type, version);

    if (!provider) {
      return notFound(
        `Provider ${namespace}/${type} version ${version} not found`,
      );
    }

    const platforms = await getProviderPlatforms(provider.id);

    return jsonResponse({
      id: `${provider.namespace}/${provider.type}/${provider.version}`,
      namespace: provider.namespace,
      type: provider.type,
      version: provider.version,
      protocols: provider.protocols,
      platforms: platforms.map((p) => ({ os: p.os, arch: p.arch })),
      published_at: provider.publishedAt.toISOString(),
    });
  } catch (error) {
    console.error("Error getting provider:", error);
    return internalError();
  }
}

/**
 * POST /v1/providers/:namespace/:type/:version
 *
 * Publish a new provider version.
 * Body: multipart form with:
 *   - `data`: JSON string with protocols, platforms, gpg_public_keys
 *   - One .zip file per platform (field name = filename)
 *   - `SHA256SUMS`: text file
 *   - `SHA256SUMS.sig`: binary signature file
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const rawParams = await params;
    const parsed = providerPublishParams.safeParse(rawParams);
    if (!parsed.success) return validationError(parsed.error.issues);

    const { namespace, type, version } = parsed.data;

    // Check for duplicate
    const existing = await findProvider(namespace, type, version);
    if (existing) {
      return conflict(
        `Provider ${namespace}/${type} version ${version} already exists`,
      );
    }

    // Parse multipart form (Web API — native in Cloudflare Workers)
    const formData = await request.formData();

    // 1. Parse and validate the JSON data field
    const dataField = formData.get("data");
    if (!dataField || typeof dataField !== "string") {
      return badRequest("Missing 'data' JSON field in form data");
    }

    let dataJson: unknown;
    try {
      dataJson = JSON.parse(dataField);
    } catch {
      return badRequest("Invalid JSON in 'data' field");
    }

    const dataParsed = providerPublishData.safeParse(dataJson);
    if (!dataParsed.success) {
      return validationError(dataParsed.error.issues);
    }

    const { protocols, platforms, gpg_public_keys } = dataParsed.data;

    // 2. Validate required files exist
    const sha256sumsFile = formData.get("SHA256SUMS");
    const sha256sumsSigFile = formData.get("SHA256SUMS.sig");

    if (!sha256sumsFile || !(sha256sumsFile instanceof File)) {
      return badRequest("Missing 'SHA256SUMS' file");
    }
    if (!sha256sumsSigFile || !(sha256sumsSigFile instanceof File)) {
      return badRequest("Missing 'SHA256SUMS.sig' file");
    }

    // 3. Validate each platform has a corresponding .zip file
    const zipFiles = new Map<string, File>();
    for (const platform of platforms) {
      const file = formData.get(platform.filename);
      if (!file || !(file instanceof File)) {
        return badRequest(
          `Missing zip file for platform: ${platform.filename}`,
        );
      }
      zipFiles.set(platform.filename, file);
    }

    // 4. Upload all artifacts to R2
    const baseUrl = `/v1/providers/${namespace}/${type}/${version}`;

    // Upload SHA256SUMS
    const sha256sumsText = await sha256sumsFile.text();
    await uploadShasums(namespace, type, version, sha256sumsText);

    // Upload SHA256SUMS.sig
    const sha256sumsSigBuffer = await sha256sumsSigFile.arrayBuffer();
    await uploadShasumsSignature(namespace, type, version, sha256sumsSigBuffer);

    // Upload zip files and build platform records
    const platformRecords = await Promise.all(
      platforms.map(async (p) => {
        const zipFile = zipFiles.get(p.filename)!;
        const zipBuffer = await zipFile.arrayBuffer();
        const location = await uploadProviderZip(
          namespace,
          type,
          version,
          p.os,
          p.arch,
          zipBuffer,
        );
        return {
          os: p.os,
          arch: p.arch,
          filename: p.filename,
          shasum: p.shasum,
          location,
          shasumUrl: `${baseUrl}/sha256sums`,
          shasumSignatureUrl: `${baseUrl}/sha256sums.sig`,
        };
      }),
    );

    // 5. Save to D1 (transaction: provider + platforms + GPG keys)
    const provider = await saveProvider({
      namespace,
      type,
      version,
      protocols,
      platforms: platformRecords,
      gpgPublicKeys: gpg_public_keys.map((k) => ({
        keyId: k.key_id,
        asciiArmor: k.ascii_armor,
        source: k.source,
        sourceUrl: k.source_url ?? undefined,
      })),
    });

    return jsonResponse(
      {
        id: `${provider.namespace}/${provider.type}/${provider.version}`,
        namespace: provider.namespace,
        type: provider.type,
        version: provider.version,
        protocols: provider.protocols,
        platforms: platforms.map((p) => ({ os: p.os, arch: p.arch })),
        published_at: provider.publishedAt.toISOString(),
      },
      201,
    );
  } catch (error) {
    console.error("Error publishing provider:", error);
    return internalError();
  }
}

/**
 * DELETE /v1/providers/:namespace/:type/:version
 *
 * Delete a provider version with all platforms, GPG keys, and R2 artifacts.
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const rawParams = await params;
    const parsed = providerPublishParams.safeParse(rawParams);
    if (!parsed.success) return validationError(parsed.error.issues);

    const { namespace, type, version } = parsed.data;

    // Delete from D1 (cascade deletes platforms + GPG keys)
    const deleted = await deleteProvider(namespace, type, version);
    if (!deleted) {
      return notFound(
        `Provider ${namespace}/${type} version ${version} not found`,
      );
    }

    // Clean up R2 artifacts (best-effort)
    try {
      const prefix = `providers/${namespace}/${type}/${version}/`;
      await deleteByPrefix(prefix);
    } catch {
      // Best-effort R2 cleanup
    }

    return noContentResponse({});
  } catch (error) {
    console.error("Error deleting provider:", error);
    return internalError();
  }
}
