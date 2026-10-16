import type { NextRequest } from "next/server";

import { z } from "zod";

import {
  badRequest,
  conflict,
  internalError,
  notFound,
  preconditionFailed,
  preconditionRequired,
  validationError,
} from "@/lib/api/errors";
import { parseRequiredIfMatch } from "@/lib/api/etag";
import { etagResponse } from "@/lib/api/response";
import { requirePublishAuth } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/permissions";
import { buildProviderAuditMetadata, writeAuditLog } from "@/lib/data/audit";
import { RevisionConflictError } from "@/lib/data/concurrency";
import {
  findProvider,
  findProviderPackage,
  replaceProviderPlatform,
} from "@/lib/data/providers";
import { isImmutableUploadsEnabled } from "@/lib/data/settings";
import {
  deleteObject,
  uploadProviderZip,
  uploadShasums,
  uploadShasumsSignature,
} from "@/lib/storage";
import { extractShasumForFile, sha256Hex } from "@/lib/storage/shasum";
import { adminProviderPlatformReplaceBody } from "@/lib/validation/admin";
import { MAX_PROVIDER_ZIP_SIZE } from "@/lib/validation/limits";
import {
  archSchema,
  namespaceSchema,
  osSchema,
  typeSchema,
  versionSchema,
} from "@/lib/validation/registry";

const routeParamsSchema = z.object({
  namespace: namespaceSchema,
  type: typeSchema,
  version: versionSchema,
  os: osSchema,
  arch: archSchema,
});

type RouteParams = {
  params: Promise<{
    namespace: string;
    type: string;
    version: string;
    os: string;
    arch: string;
  }>;
};

type Coords = {
  namespace: string;
  type: string;
  version: string;
  os: string;
  arch: string;
};

const MAX_PROVIDER_ZIP_MB = MAX_PROVIDER_ZIP_SIZE / (1024 * 1024);

function platformResponse(
  coords: Coords,
  replaced: Awaited<ReturnType<typeof replaceProviderPlatform>>,
) {
  return {
    id: `${coords.namespace}/${coords.type}/${coords.version}/${coords.os}/${coords.arch}`,
    namespace: coords.namespace,
    type: coords.type,
    version: coords.version,
    revision: replaced.provider.revision,
    platform: {
      os: replaced.platform.os,
      arch: replaced.platform.arch,
      filename: replaced.platform.filename,
      shasum: replaced.platform.shasum,
      location: replaced.platform.location,
      shasum_url: replaced.platform.shasumUrl,
      shasum_signature_url: replaced.platform.shasumSignatureUrl,
    },
  };
}

async function writePlatformAudit(
  coords: Coords,
  auth: { id: number },
  expectedRevision: number,
  nextRevision: number,
) {
  try {
    await writeAuditLog({
      action: "provider.update",
      resourceType: "provider",
      resourceId: `${coords.namespace}/${coords.type}/${coords.version}`,
      actorId: String(auth.id),
      actorType: "api_key",
      metadata: buildProviderAuditMetadata({
        namespace: coords.namespace,
        type: coords.type,
        version: coords.version,
        os: coords.os,
        arch: coords.arch,
        changedFields: [
          "filename",
          "shasum",
          "location",
          "shasum_url",
          "shasum_signature_url",
        ],
        revision: { expectedRevision, nextRevision },
      }),
    });
  } catch (auditError) {
    console.error("Provider platform replace audit write failed:", auditError);
  }
}

/**
 * Multipart platform replace mode — the PRIMARY byte path.
 *
 * Accepts `file=<zip>` (required), optional `sha256sums=<file>` +
 * `sha256sums_sig=<file>`. Uploads the zip (and optional shasums/sig) to R2,
 * computes the zip's SHA-256 (overridable by a matching SHA256SUMS line), then
 * upserts the platform row with the new `location`, `shasum`, `filename`,
 * `shasum_url`, `shasum_signature_url`. Cleans up uploaded R2 objects on DB
 * failure.
 */
async function replacePlatformMultipart(
  request: NextRequest,
  coords: Coords,
  auth: { id: number },
  expectedRevision: number,
) {
  const contentLength = request.headers.get("Content-Length");
  if (contentLength) {
    const size = Number(contentLength);
    if (!Number.isNaN(size) && size > MAX_PROVIDER_ZIP_SIZE) {
      return badRequest(
        `Request body exceeds maximum provider zip size of ${MAX_PROVIDER_ZIP_MB} MB`,
      );
    }
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return badRequest("Invalid multipart/form-data body");
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return badRequest("Missing 'file' (provider zip) in form data");
  }
  if (file.size > MAX_PROVIDER_ZIP_SIZE) {
    return badRequest(
      `Provider zip exceeds maximum size of ${MAX_PROVIDER_ZIP_MB} MB`,
    );
  }

  const shasumsFile = formData.get("sha256sums");
  const shasumsSigFile = formData.get("sha256sums_sig");
  if (shasumsFile !== null && !(shasumsFile instanceof File)) {
    return badRequest("'sha256sums' must be a file");
  }
  if (shasumsSigFile !== null && !(shasumsSigFile instanceof File)) {
    return badRequest("'sha256sums_sig' must be a file");
  }

  const { namespace, type, version, os, arch } = coords;

  const provider = await findProvider(namespace, type, version);
  if (!provider) {
    return notFound(
      `Provider ${namespace}/${type} version ${version} not found`,
    );
  }

  // Detect whether this platform slot already holds stored bytes. Initial
  // publish (no existing artifact) is always allowed; overwriting existing
  // bytes is gated by the Immutable Uploads setting.
  const existing = await findProviderPackage(
    namespace,
    type,
    version,
    os,
    arch,
  );
  const existingLocation = existing?.platform.location ?? null;
  const hasExistingBytes = !!existingLocation;

  if (hasExistingBytes && (await isImmutableUploadsEnabled())) {
    return conflict(
      "Immutable uploads enabled; artifact bytes already exist for this platform",
    );
  }

  // Upload bytes to R2 first; track keys for cleanup-on-DB-failure.
  const uploadedKeys: string[] = [];

  const location = await uploadProviderZip(
    namespace,
    type,
    version,
    os,
    arch,
    file.stream(),
  );
  uploadedKeys.push(location);

  let shasum = await sha256Hex(file);

  // Preserve the existing version-level shasum pointers by default. A
  // per-platform byte replace that omits the shasums files must NOT null out
  // the SHA256SUMS / SHA256SUMS.sig URLs that were stored at create-version
  // time — those underpin Terraform's GPG verification chain. Only overwrite
  // them when fresh files are supplied in this request.
  let shasumUrl: string | undefined = existing?.platform.shasumUrl ?? undefined;
  if (shasumsFile instanceof File) {
    const shasumsText = await shasumsFile.text();
    const fromFile = extractShasumForFile(shasumsText, file.name);
    if (fromFile) shasum = fromFile;
    shasumUrl = await uploadShasums(namespace, type, version, shasumsText);
    uploadedKeys.push(shasumUrl);
  }

  let shasumSignatureUrl: string | undefined =
    existing?.platform.shasumSignatureUrl ?? undefined;
  if (shasumsSigFile instanceof File) {
    shasumSignatureUrl = await uploadShasumsSignature(
      namespace,
      type,
      version,
      await shasumsSigFile.arrayBuffer(),
    );
    uploadedKeys.push(shasumSignatureUrl);
  }

  try {
    const replaced = await replaceProviderPlatform(
      namespace,
      type,
      version,
      expectedRevision,
      {
        os,
        arch,
        filename: file.name,
        shasum,
        location,
        shasumUrl,
        shasumSignatureUrl,
      },
    );

    // Overwrite cleanup: if the new artifact landed under a different R2 key
    // than the old one, delete the now-orphaned old object. When the key is
    // identical, the R2 put already overwrote it in place.
    if (existingLocation && existingLocation !== location) {
      try {
        await deleteObject(existingLocation);
      } catch (cleanupError) {
        console.error(
          "R2 cleanup of old provider platform object failed after overwrite:",
          cleanupError,
        );
      }
    }

    await writePlatformAudit(
      coords,
      auth,
      expectedRevision,
      replaced.provider.revision,
    );

    return etagResponse(
      platformResponse(coords, replaced),
      replaced.provider.revision,
      200,
    );
  } catch (dbError) {
    for (const key of uploadedKeys) {
      try {
        await deleteObject(key);
      } catch (cleanupError) {
        console.error(
          "R2 cleanup failed after admin provider platform replace error:",
          cleanupError,
        );
      }
    }
    throw dbError;
  }
}

/**
 * JSON platform replace mode — metadata-only replace for externally-hosted
 * artifacts where `location` points elsewhere.
 */
async function replacePlatformJson(
  request: NextRequest,
  coords: Coords,
  auth: { id: number },
  expectedRevision: number,
) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const parsedBody = adminProviderPlatformReplaceBody.safeParse(rawBody);
  if (!parsedBody.success) return validationError(parsedBody.error.issues);

  const { namespace, type, version, os, arch } = coords;

  const provider = await findProvider(namespace, type, version);
  if (!provider) {
    return notFound(
      `Provider ${namespace}/${type} version ${version} not found`,
    );
  }

  const replaced = await replaceProviderPlatform(
    namespace,
    type,
    version,
    expectedRevision,
    {
      os,
      arch,
      filename: parsedBody.data.filename,
      shasum: parsedBody.data.shasum,
      location: parsedBody.data.location,
      shasumUrl: parsedBody.data.shasum_url,
      shasumSignatureUrl: parsedBody.data.shasum_signature_url,
    },
  );

  await writePlatformAudit(
    coords,
    auth,
    expectedRevision,
    replaced.provider.revision,
  );

  return etagResponse(
    platformResponse(coords, replaced),
    replaced.provider.revision,
    200,
  );
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requirePublishAuth(request, PERMISSIONS.PROVIDERS_WRITE);
    if (auth instanceof Response) return auth;

    const parsedParams = routeParamsSchema.safeParse(await params);
    if (!parsedParams.success)
      return validationError(parsedParams.error.issues);

    const ifMatch = parseRequiredIfMatch(request);
    if (!ifMatch.ok) {
      return ifMatch.reason === "missing"
        ? preconditionRequired()
        : badRequest(
            'Invalid If-Match header. Expected revision ETag (e.g. W/"3")',
          );
    }

    const coords = parsedParams.data;
    const contentType = request.headers.get("Content-Type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      return await replacePlatformMultipart(
        request,
        coords,
        auth,
        ifMatch.revision,
      );
    }

    return await replacePlatformJson(request, coords, auth, ifMatch.revision);
  } catch (error) {
    if (error instanceof RevisionConflictError) {
      return preconditionFailed();
    }
    console.error("Error replacing provider platform via admin API:", error);
    return internalError();
  }
}
