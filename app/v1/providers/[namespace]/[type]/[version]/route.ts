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
  deleteObject,
} from "@/lib/storage/r2";
import { isUniqueConstraintError } from "@/lib/data/errors";
import { requireAuth } from "@/lib/auth/middleware";
import { MAX_PROVIDER_ZIP_SIZE } from "@/lib/validation/limits";

type RouteParams = {
  params: Promise<{ namespace: string; type: string; version: string }>;
};

/**
 * GET /v1/providers/:namespace/:type/:version
 *
 * Return full metadata for a specific provider version with platforms.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireAuth(request, "providers:read");
    if (auth instanceof Response) return auth;

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
 *
 * Consistency guarantee: R2 uploads + DB insert are made atomic via
 * "upload-then-insert-with-rollback". If the DB insert fails, all
 * R2 objects are deleted to prevent orphaned artifacts.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireAuth(request, "providers:write");
    if (auth instanceof Response) return auth;

    const rawParams = await params;
    const parsed = providerPublishParams.safeParse(rawParams);
    if (!parsed.success) return validationError(parsed.error.issues);

    const { namespace, type, version } = parsed.data;

    // Fast-path duplicate check
    const existing = await findProvider(namespace, type, version);
    if (existing) {
      return conflict(
        `Provider ${namespace}/${type} version ${version} already exists`,
      );
    }

    // Pre-check Content-Length for obviously oversized requests.
    // A provider publish includes zip files for each platform plus SHA256SUMS and signature.
    // The generous upper bound allows for multiple platform zips.
    const contentLength = request.headers.get("Content-Length");
    if (contentLength) {
      const size = Number(contentLength);
      // Allow up to 10 platforms * MAX_PROVIDER_ZIP_SIZE + overhead for shasums/sig/JSON
      const maxProviderPublishSize = 10 * MAX_PROVIDER_ZIP_SIZE + 1024 * 1024;
      if (!Number.isNaN(size) && size > maxProviderPublishSize) {
        return badRequest(
          "Request body exceeds maximum allowed size for provider publish",
        );
      }
    }

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

    // 3b. Pre-flight size validation — reject before any uploads start
    for (const [filename, file] of zipFiles) {
      if (file.size > MAX_PROVIDER_ZIP_SIZE) {
        return badRequest(
          `Zip file '${filename}' exceeds maximum size of ${MAX_PROVIDER_ZIP_SIZE / (1024 * 1024)} MB`,
        );
      }
    }

    // 4. Upload all artifacts to R2
    // Track uploaded R2 keys for cleanup on failure (Consistency guarantee)
    const uploadedKeys: string[] = [];
    const baseUrl = `/v1/providers/${namespace}/${type}/${version}`;

    /** Clean up all R2 artifacts uploaded so far. Best-effort. */
    async function cleanupUploadedKeys() {
      await Promise.allSettled(
        uploadedKeys.map(async (key) => {
          try {
            await deleteObject(key);
          } catch (r2Err) {
            console.error(`R2 cleanup failed for key ${key}:`, r2Err);
          }
        }),
      );
    }

    const sha256sumsText = await sha256sumsFile.text();
    const shasumKey = await uploadShasums(
      namespace,
      type,
      version,
      sha256sumsText,
    );
    uploadedKeys.push(shasumKey);

    const sha256sumsSigBuffer = await sha256sumsSigFile.arrayBuffer();
    const sigKey = await uploadShasumsSignature(
      namespace,
      type,
      version,
      sha256sumsSigBuffer,
    );
    uploadedKeys.push(sigKey);

    // Upload zip files sequentially to limit peak memory (one zip at a time)
    // and enable per-file checksum verification + clean rollback on failure.
    const platformRecords: {
      os: string;
      arch: string;
      filename: string;
      shasum: string;
      location: string;
      shasumUrl: string;
      shasumSignatureUrl: string;
    }[] = [];

    for (const p of platforms) {
      const zipFile = zipFiles.get(p.filename)!;
      const zipBuffer = await zipFile.arrayBuffer();

      // Verify SHA-256 checksum matches declared value
      const digest = await crypto.subtle.digest("SHA-256", zipBuffer);
      const computedSha = Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      if (computedSha.toLowerCase() !== p.shasum.toLowerCase()) {
        console.error(
          `SHA-256 mismatch for ${p.filename}: expected ${p.shasum}, got ${computedSha}`,
        );
        await cleanupUploadedKeys();
        return badRequest(
          `SHA-256 checksum mismatch for '${p.filename}': expected ${p.shasum}, got ${computedSha}`,
        );
      }

      let location: string;
      try {
        location = await uploadProviderZip(
          namespace,
          type,
          version,
          p.os,
          p.arch,
          zipBuffer,
        );
      } catch (uploadError) {
        console.error(`R2 upload failed for ${p.filename}:`, uploadError);
        await cleanupUploadedKeys();
        return internalError();
      }

      uploadedKeys.push(location);
      platformRecords.push({
        os: p.os,
        arch: p.arch,
        filename: p.filename,
        shasum: p.shasum,
        location,
        shasumUrl: `${baseUrl}/sha256sums`,
        shasumSignatureUrl: `${baseUrl}/sha256sums.sig`,
      });
    }

    // 5. Save to D1 (transaction: provider + platforms + GPG keys)
    // On failure: delete ALL uploaded R2 artifacts to prevent orphaned objects
    let provider;
    try {
      provider = await saveProvider({
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
    } catch (dbError) {
      // Consistency guarantee: clean up ALL R2 artifacts
      await cleanupUploadedKeys();

      if (isUniqueConstraintError(dbError)) {
        return conflict(
          `Provider ${namespace}/${type} version ${version} already exists`,
        );
      }

      console.error("DB error publishing provider:", dbError);
      return internalError();
    }

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
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    // Authenticate — write operations require a valid API key
    const auth = await requireAuth(request, "providers:write");
    if (auth instanceof Response) return auth;

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
