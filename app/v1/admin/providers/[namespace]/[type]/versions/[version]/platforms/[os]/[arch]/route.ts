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
import { etagResponse } from "@/lib/api/response";
import { requireAdminWriteAuth } from "@/lib/auth/middleware";
import { buildProviderAuditMetadata, writeAuditLog } from "@/lib/data/audit";
import { RevisionConflictError } from "@/lib/data/concurrency";
import { findProvider, replaceProviderPlatform } from "@/lib/data/providers";
import { adminProviderPlatformReplaceBody } from "@/lib/validation/admin";
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

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireAdminWriteAuth(request);
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

    const parsedBody = adminProviderPlatformReplaceBody.safeParse(rawBody);
    if (!parsedBody.success) return validationError(parsedBody.error.issues);

    const { namespace, type, version, os, arch } = parsedParams.data;

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
      ifMatch.revision,
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
          os,
          arch,
          changedFields: [
            "filename",
            "shasum",
            "location",
            "shasum_url",
            "shasum_signature_url",
          ],
          revision: {
            expectedRevision: ifMatch.revision,
            nextRevision: replaced.provider.revision,
          },
        }),
      });
    } catch (auditError) {
      console.error(
        "Provider platform replace audit write failed:",
        auditError,
      );
    }

    return etagResponse(
      {
        id: `${namespace}/${type}/${version}/${os}/${arch}`,
        namespace,
        type,
        version,
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
      },
      replaced.provider.revision,
      200,
    );
  } catch (error) {
    if (error instanceof RevisionConflictError) {
      return preconditionFailed();
    }
    console.error("Error replacing provider platform via admin API:", error);
    return internalError();
  }
}
