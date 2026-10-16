import type { NextRequest } from "next/server";

import { z } from "zod";

import {
  badRequest,
  internalError,
  notFound,
  preconditionFailed,
  preconditionRequired,
  validationError,
} from "@/lib/api/errors";
import { parseRequiredIfMatch } from "@/lib/api/etag";
import { etagResponse, noContentResponse } from "@/lib/api/response";
import { requireAuth, requirePublishAuth } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/permissions";
import { buildProviderAuditMetadata, writeAuditLog } from "@/lib/data/audit";
import { deleteProviderAliasesByTarget } from "@/lib/data/aliases";
import {
  RevisionConflictError,
  conditionalProviderUpdate,
} from "@/lib/data/concurrency";
import {
  conditionalDeleteProvider,
  findAnyProvider,
  findProvider,
  getProviderGpgKeys,
  getProviderPlatforms,
} from "@/lib/data/providers";
import { deleteByPrefix } from "@/lib/storage";
import { adminProviderUpdateBody } from "@/lib/validation/admin";
import {
  namespaceSchema,
  typeSchema,
  versionSchema,
} from "@/lib/validation/registry";

const routeParamsSchema = z.object({
  namespace: namespaceSchema,
  type: typeSchema,
  version: versionSchema,
});

type RouteParams = {
  params: Promise<{ namespace: string; type: string; version: string }>;
};

async function buildProviderVersionResponse(
  namespace: string,
  type: string,
  version: string,
) {
  const provider = await findProvider(namespace, type, version);
  if (!provider) return null;

  const [platforms, gpgKeys] = await Promise.all([
    getProviderPlatforms(provider.id),
    getProviderGpgKeys(provider.id),
  ]);

  return {
    provider,
    body: {
      id: `${provider.namespace}/${provider.type}/${provider.version}`,
      namespace: provider.namespace,
      type: provider.type,
      version: provider.version,
      protocols: provider.protocols,
      platforms: platforms.map((platform) => ({
        os: platform.os,
        arch: platform.arch,
        filename: platform.filename,
        shasum: platform.shasum,
        location: platform.location,
        shasum_url: platform.shasumUrl,
        shasum_signature_url: platform.shasumSignatureUrl,
      })),
      gpg_public_keys: gpgKeys.map((key) => ({
        key_id: key.keyId,
        ascii_armor: key.asciiArmor,
        source: key.source,
        source_url: key.sourceUrl,
      })),
      published_at: provider.publishedAt.toISOString(),
      updated_at: provider.updatedAt.toISOString(),
      revision: provider.revision,
    },
  };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireAuth(request, PERMISSIONS.PROVIDERS_WRITE);
    if (auth instanceof Response) return auth;

    const parsedParams = routeParamsSchema.safeParse(await params);
    if (!parsedParams.success)
      return validationError(parsedParams.error.issues);

    const { namespace, type, version } = parsedParams.data;
    const responseData = await buildProviderVersionResponse(
      namespace,
      type,
      version,
    );

    if (!responseData) {
      return notFound(
        `Provider ${namespace}/${type} version ${version} not found`,
      );
    }

    return etagResponse(responseData.body, responseData.provider.revision, 200);
  } catch (error) {
    console.error("Error getting admin provider version:", error);
    return internalError();
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
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

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return badRequest("Invalid JSON body");
    }

    const parsedBody = adminProviderUpdateBody.safeParse(rawBody);
    if (!parsedBody.success) return validationError(parsedBody.error.issues);

    const { namespace, type, version } = parsedParams.data;
    const existing = await findProvider(namespace, type, version);
    if (!existing) {
      return notFound(
        `Provider ${namespace}/${type} version ${version} not found`,
      );
    }

    const updated = await conditionalProviderUpdate(
      namespace,
      type,
      version,
      ifMatch.revision,
      { protocols: parsedBody.data.protocols },
    );

    try {
      await writeAuditLog({
        action: "provider.update",
        resourceType: "provider",
        resourceId: `${namespace}/${type}/${version}`,
        actorId: String(auth.id),
        actorType: "api_key",
        metadata: buildProviderAuditMetadata({
          namespace,
          type,
          version,
          changedFields: Object.keys(parsedBody.data),
          revision: {
            expectedRevision: ifMatch.revision,
            nextRevision: updated.revision,
          },
        }),
      });
    } catch (auditError) {
      console.error("Provider admin patch audit write failed:", auditError);
    }

    const responseData = await buildProviderVersionResponse(
      namespace,
      type,
      version,
    );
    if (!responseData) {
      return notFound(
        `Provider ${namespace}/${type} version ${version} not found`,
      );
    }

    return etagResponse(responseData.body, responseData.provider.revision, 200);
  } catch (error) {
    if (error instanceof RevisionConflictError) {
      return preconditionFailed();
    }
    console.error("Error patching admin provider version:", error);
    return internalError();
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
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

    const { namespace, type, version } = parsedParams.data;

    const existing = await findProvider(namespace, type, version);
    if (!existing) {
      return notFound(
        `Provider ${namespace}/${type} version ${version} not found`,
      );
    }

    if (existing.revision !== ifMatch.revision) {
      return preconditionFailed();
    }

    // Fail-closed cleanup ordering: remove artifacts first, then delete metadata.
    // This prevents metadata deletion when artifact cleanup fails.
    try {
      await deleteByPrefix(`providers/${namespace}/${type}/${version}/`);
    } catch (cleanupError) {
      console.error(
        "Provider admin delete artifact cleanup failed:",
        cleanupError,
      );
      return internalError("Failed to cleanup provider artifacts");
    }

    const deleted = await conditionalDeleteProvider(
      namespace,
      type,
      version,
      ifMatch.revision,
    );

    if (!deleted) {
      return notFound(
        `Provider ${namespace}/${type} version ${version} not found`,
      );
    }

    const stillExists = await findAnyProvider(namespace, type);
    if (!stillExists) {
      await deleteProviderAliasesByTarget(namespace, type);
    }

    try {
      await writeAuditLog({
        action: "provider.delete",
        resourceType: "provider",
        resourceId: `${namespace}/${type}/${version}`,
        actorId: String(auth.id),
        actorType: "api_key",
        metadata: buildProviderAuditMetadata({
          namespace,
          type,
          version,
          revision: {
            expectedRevision: ifMatch.revision,
            currentRevision: deleted.provider.revision,
          },
        }),
      });
    } catch (auditError) {
      console.error("Provider admin delete audit write failed:", auditError);
    }

    return noContentResponse({});
  } catch (error) {
    if (error instanceof RevisionConflictError) {
      return preconditionFailed();
    }
    console.error("Error deleting admin provider version:", error);
    return internalError();
  }
}
