import type { NextRequest } from "next/server";

import { z } from "zod";

import {
  badRequest,
  conflict,
  internalError,
  validationError,
} from "@/lib/api/errors";
import { etagResponse } from "@/lib/api/response";
import { requireAdminWriteAuth } from "@/lib/auth/middleware";
import { buildProviderAuditMetadata, writeAuditLog } from "@/lib/data/audit";
import { isUniqueConstraintError } from "@/lib/data/errors";
import { findProvider, saveProvider } from "@/lib/data/providers";
import {
  deleteObject,
  uploadShasums,
  uploadShasumsSignature,
} from "@/lib/storage";
import {
  adminProviderCreateBody,
  adminProviderCreateMultipartBody,
  type AdminProviderCreateBody,
  type AdminProviderCreateMultipartBody,
} from "@/lib/validation/admin";
import { namespaceSchema, typeSchema } from "@/lib/validation/registry";

const routeParamsSchema = z.object({
  namespace: namespaceSchema,
  type: typeSchema,
});

type RouteParams = {
  params: Promise<{ namespace: string; type: string }>;
};

function toProviderResponse(
  namespace: string,
  type: string,
  body: AdminProviderCreateBody | AdminProviderCreateMultipartBody,
  revision: number,
) {
  return {
    id: `${namespace}/${type}/${body.version}`,
    namespace,
    type,
    version: body.version,
    protocols: body.protocols,
    platforms: body.platforms,
    gpg_public_keys: body.gpg_public_keys,
    revision,
  };
}

/**
 * Parse a JSON string form field. Returns `undefined` when the field is
 * absent/empty and throws on malformed JSON (caller maps to 400).
 */
function parseJsonField(value: FormDataEntryValue | null): unknown {
  if (typeof value !== "string" || value.length === 0) return undefined;
  return JSON.parse(value);
}

/**
 * Multipart create-version mode (byte ingestion).
 *
 * Accepts version-level `SHA256SUMS` (text) + `SHA256SUMS.sig` (binary) once
 * per version, plus metadata fields (`version`, `protocols`, optional
 * `platforms`, `gpg_public_keys` as JSON string fields). Uploads the shasums +
 * sig to R2; does NOT require platform zips (size). Platform bytes are filled
 * in by per-platform PUTs.
 */
async function createVersionMultipart(
  request: NextRequest,
  namespace: string,
  type: string,
  auth: { id: number },
) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return badRequest("Invalid multipart/form-data body");
  }

  let protocols: unknown;
  let platforms: unknown;
  let gpgPublicKeys: unknown;
  try {
    protocols = parseJsonField(formData.get("protocols"));
    platforms = parseJsonField(formData.get("platforms"));
    gpgPublicKeys = parseJsonField(formData.get("gpg_public_keys"));
  } catch {
    return badRequest(
      "Invalid JSON in 'protocols', 'platforms', or 'gpg_public_keys' field",
    );
  }

  const parsedBody = adminProviderCreateMultipartBody.safeParse({
    version: formData.get("version") ?? undefined,
    protocols,
    ...(platforms !== undefined ? { platforms } : {}),
    gpg_public_keys: gpgPublicKeys,
  });
  if (!parsedBody.success) return validationError(parsedBody.error.issues);
  const body = parsedBody.data;

  const shasumsFile = formData.get("SHA256SUMS");
  const shasumsSigFile = formData.get("SHA256SUMS.sig");
  if (shasumsFile !== null && !(shasumsFile instanceof File)) {
    return badRequest("'SHA256SUMS' must be a file");
  }
  if (shasumsSigFile !== null && !(shasumsSigFile instanceof File)) {
    return badRequest("'SHA256SUMS.sig' must be a file");
  }

  const existing = await findProvider(namespace, type, body.version);
  if (existing) {
    return conflict(
      `Provider ${namespace}/${type} version ${body.version} already exists`,
    );
  }

  // Upload version-level shasums + signature to R2 (best-effort cleanup on
  // DB failure below).
  const uploadedKeys: string[] = [];
  let shasumUrl: string | undefined;
  let shasumSignatureUrl: string | undefined;
  if (shasumsFile instanceof File) {
    shasumUrl = await uploadShasums(
      namespace,
      type,
      body.version,
      await shasumsFile.text(),
    );
    uploadedKeys.push(shasumUrl);
  }
  if (shasumsSigFile instanceof File) {
    shasumSignatureUrl = await uploadShasumsSignature(
      namespace,
      type,
      body.version,
      await shasumsSigFile.arrayBuffer(),
    );
    uploadedKeys.push(shasumSignatureUrl);
  }

  try {
    const provider = await saveProvider({
      namespace,
      type,
      version: body.version,
      protocols: body.protocols,
      platforms: body.platforms.map((platform) => ({
        os: platform.os,
        arch: platform.arch,
        filename: platform.filename,
        shasum: platform.shasum,
        location: platform.location,
        shasumUrl: platform.shasum_url ?? shasumUrl,
        shasumSignatureUrl: platform.shasum_signature_url ?? shasumSignatureUrl,
      })),
      gpgPublicKeys: body.gpg_public_keys.map((key) => ({
        keyId: key.key_id,
        asciiArmor: key.ascii_armor,
        source: key.source,
        sourceUrl: key.source_url ?? undefined,
      })),
    });

    try {
      await writeAuditLog({
        action: "provider.create",
        resourceType: "provider",
        resourceId: `${namespace}/${type}/${body.version}`,
        actorId: String(auth.id),
        actorType: "api_key",
        metadata: buildProviderAuditMetadata({
          namespace,
          type,
          version: body.version,
          revision: { nextRevision: provider.revision },
        }),
      });
    } catch (auditError) {
      console.error("Provider admin create audit write failed:", auditError);
    }

    return etagResponse(
      toProviderResponse(namespace, type, body, provider.revision),
      provider.revision,
      201,
    );
  } catch (dbError) {
    for (const key of uploadedKeys) {
      try {
        await deleteObject(key);
      } catch (cleanupError) {
        console.error(
          "R2 cleanup failed after admin provider create error:",
          cleanupError,
        );
      }
    }
    if (isUniqueConstraintError(dbError)) {
      return conflict(
        `Provider ${namespace}/${type} version ${body.version} already exists`,
      );
    }
    throw dbError;
  }
}

/**
 * JSON create-version mode (metadata only — for externally-hosted artifacts
 * where each platform `location` points elsewhere).
 */
async function createVersionJson(
  request: NextRequest,
  namespace: string,
  type: string,
  auth: { id: number },
) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const parsedBody = adminProviderCreateBody.safeParse(rawBody);
  if (!parsedBody.success) return validationError(parsedBody.error.issues);

  const body = parsedBody.data;

  const existing = await findProvider(namespace, type, body.version);
  if (existing) {
    return conflict(
      `Provider ${namespace}/${type} version ${body.version} already exists`,
    );
  }

  const provider = await saveProvider({
    namespace,
    type,
    version: body.version,
    protocols: body.protocols,
    platforms: body.platforms.map((platform) => ({
      os: platform.os,
      arch: platform.arch,
      filename: platform.filename,
      shasum: platform.shasum,
      location: platform.location,
      shasumUrl: platform.shasum_url,
      shasumSignatureUrl: platform.shasum_signature_url,
    })),
    gpgPublicKeys: body.gpg_public_keys.map((key) => ({
      keyId: key.key_id,
      asciiArmor: key.ascii_armor,
      source: key.source,
      sourceUrl: key.source_url ?? undefined,
    })),
  });

  try {
    await writeAuditLog({
      action: "provider.create",
      resourceType: "provider",
      resourceId: `${namespace}/${type}/${body.version}`,
      actorId: String(auth.id),
      actorType: "api_key",
      metadata: buildProviderAuditMetadata({
        namespace,
        type,
        version: body.version,
        revision: { nextRevision: provider.revision },
      }),
    });
  } catch (auditError) {
    console.error("Provider admin create audit write failed:", auditError);
  }

  return etagResponse(
    toProviderResponse(namespace, type, body, provider.revision),
    provider.revision,
    201,
  );
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireAdminWriteAuth(request);
    if (auth instanceof Response) return auth;

    const parsedParams = routeParamsSchema.safeParse(await params);
    if (!parsedParams.success)
      return validationError(parsedParams.error.issues);

    const { namespace, type } = parsedParams.data;

    const contentType = request.headers.get("Content-Type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      return await createVersionMultipart(request, namespace, type, auth);
    }

    return await createVersionJson(request, namespace, type, auth);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return conflict("Provider version already exists");
    }
    console.error("Error creating provider version via admin API:", error);
    return internalError();
  }
}
