import type { NextRequest } from "next/server";
import { modulePublishParams } from "@/lib/validation/registry";
import { adminModuleUpdateBody } from "@/lib/validation/admin";
import {
  badRequest,
  internalError,
  notFound,
  preconditionFailed,
  preconditionRequired,
  validationError,
} from "@/lib/api/errors";
import { etagResponse, noContentResponse } from "@/lib/api/response";
import { parseRequiredIfMatch } from "@/lib/api/etag";
import { findModule, resolveModuleTags } from "@/lib/data/modules";
import {
  conditionalModuleDelete,
  conditionalModuleUpdate,
  RevisionConflictError,
} from "@/lib/data/concurrency";
import { requireAuth, requireAdminWriteAuth } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/permissions";
import { writeAuditLog, buildModuleAuditMetadata } from "@/lib/data/audit";
import { deleteModuleAliasesByTarget } from "@/lib/data/aliases";
import { deleteObject } from "@/lib/storage";
import type { Module } from "@/db/schema";

type RouteParams = {
  params: Promise<{
    namespace: string;
    name: string;
    system: string;
    version: string;
  }>;
};

function serializeModule(module: Module) {
  return {
    id: `${module.namespace}/${module.name}/${module.provider}/${module.version}`,
    namespace: module.namespace,
    name: module.name,
    provider: module.provider,
    version: module.version,
    owner: module.owner,
    description: module.description,
    source: module.source,
    location: module.location,
    tags: resolveModuleTags(module),
    downloads: module.downloads,
    revision: module.revision,
    published_at: module.publishedAt.toISOString(),
    updated_at: module.updatedAt.toISOString(),
  };
}

/**
 * GET /v1/admin/modules/:namespace/:name/:system/versions/:version
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireAuth(request, PERMISSIONS.ADMIN);
    if (auth instanceof Response) return auth;

    const parsed = modulePublishParams.safeParse(await params);
    if (!parsed.success) return validationError(parsed.error.issues);

    const { namespace, name, system, version } = parsed.data;
    const moduleRecord = await findModule(namespace, name, system, version);
    if (!moduleRecord) {
      return notFound(
        `Module ${namespace}/${name}/${system} version ${version} not found`,
      );
    }

    return etagResponse(serializeModule(moduleRecord), moduleRecord.revision);
  } catch (error) {
    console.error("Error getting admin module version:", error);
    return internalError();
  }
}

/**
 * PATCH /v1/admin/modules/:namespace/:name/:system/versions/:version
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireAdminWriteAuth(request);
    if (auth instanceof Response) return auth;

    const parsed = modulePublishParams.safeParse(await params);
    if (!parsed.success) return validationError(parsed.error.issues);

    const ifMatch = parseRequiredIfMatch(request);
    if (!ifMatch.ok) {
      return ifMatch.reason === "missing"
        ? preconditionRequired()
        : badRequest("Invalid If-Match header");
    }

    const body = await request.json();
    const parsedBody = adminModuleUpdateBody.safeParse(body);
    if (!parsedBody.success) return validationError(parsedBody.error.issues);

    const { namespace, name, system, version } = parsed.data;
    const updated = await conditionalModuleUpdate(
      namespace,
      name,
      system,
      version,
      ifMatch.revision,
      parsedBody.data,
    );

    try {
      await writeAuditLog({
        action: "module.update",
        resourceType: "module",
        resourceId: `${namespace}/${name}/${system}/${version}`,
        actorId: auth.name,
        actorType: "api_key",
        metadata: buildModuleAuditMetadata({
          namespace,
          name,
          provider: system,
          version,
          revision: {
            expectedRevision: ifMatch.revision,
            nextRevision: updated.revision,
          },
          changedFields: Object.keys(parsedBody.data),
        }),
      });
    } catch (auditError) {
      console.error("Failed to write module.update audit log:", auditError);
    }

    return etagResponse(serializeModule(updated), updated.revision);
  } catch (error) {
    if (error instanceof RevisionConflictError) {
      if (error.currentRevision === null) {
        return notFound("Module version not found");
      }
      return preconditionFailed();
    }

    console.error("Error patching admin module version:", error);
    return internalError();
  }
}

/**
 * DELETE /v1/admin/modules/:namespace/:name/:system/versions/:version
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireAdminWriteAuth(request);
    if (auth instanceof Response) return auth;

    const parsed = modulePublishParams.safeParse(await params);
    if (!parsed.success) return validationError(parsed.error.issues);

    const ifMatch = parseRequiredIfMatch(request);
    if (!ifMatch.ok) {
      return ifMatch.reason === "missing"
        ? preconditionRequired()
        : badRequest("Invalid If-Match header");
    }

    const { namespace, name, system, version } = parsed.data;
    const moduleRecord = await findModule(namespace, name, system, version);
    if (!moduleRecord) {
      return notFound(
        `Module ${namespace}/${name}/${system} version ${version} not found`,
      );
    }

    if (moduleRecord.revision !== ifMatch.revision) {
      return preconditionFailed();
    }

    if (moduleRecord.location) {
      try {
        await deleteObject(moduleRecord.location);
      } catch (cleanupError) {
        console.error("Error cleaning up module artifact:", cleanupError);
        return internalError("Failed to cleanup module artifact");
      }
    }

    await conditionalModuleDelete(
      namespace,
      name,
      system,
      version,
      ifMatch.revision,
    );

    const stillExists = await findModule(namespace, name, system, version);
    if (!stillExists) {
      await deleteModuleAliasesByTarget(namespace, name, system);
    }

    try {
      await writeAuditLog({
        action: "module.delete",
        resourceType: "module",
        resourceId: `${namespace}/${name}/${system}/${version}`,
        actorId: auth.name,
        actorType: "api_key",
        metadata: buildModuleAuditMetadata({
          namespace,
          name,
          provider: system,
          version,
          revision: {
            expectedRevision: ifMatch.revision,
            currentRevision: ifMatch.revision,
          },
        }),
      });
    } catch (auditError) {
      console.error("Failed to write module.delete audit log:", auditError);
    }

    return noContentResponse({});
  } catch (error) {
    if (error instanceof RevisionConflictError) {
      if (error.currentRevision === null) {
        return notFound("Module version not found");
      }
      return preconditionFailed();
    }

    console.error("Error deleting admin module version:", error);
    return internalError();
  }
}
