import type { NextRequest } from "next/server";
import { modulePublishParams } from "@/lib/validation/registry";
import {
  adminModuleReplaceBody,
  adminModuleUpdateBody,
} from "@/lib/validation/admin";
import {
  badRequest,
  conflict,
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
  conditionalModuleReplaceBytes,
  conditionalModuleUpdate,
  RevisionConflictError,
} from "@/lib/data/concurrency";
import { isImmutableUploadsEnabled } from "@/lib/data/settings";
import { requireAuth, requireAdminWriteAuth } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/permissions";
import { writeAuditLog, buildModuleAuditMetadata } from "@/lib/data/audit";
import { deleteModuleAliasesByTarget } from "@/lib/data/aliases";
import { deleteObject, uploadModuleTarball } from "@/lib/storage";
import { MAX_MODULE_SIZE } from "@/lib/validation/limits";
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
 * PUT /v1/admin/modules/:namespace/:name/:system/versions/:version
 *
 * Replace an EXISTING module version's tarball bytes (and optional metadata).
 * This is the byte-overwrite path used by CI to re-push a version.
 *
 * - 404 if the version does not exist (use POST .../versions to create).
 * - 409 if the version exists and immutable uploads are enabled.
 * - On overwrite (immutable off): uploads the new tarball to R2, updates
 *   metadata + `location`, bumps revision. Cleans up the old R2 object if its
 *   key changed.
 *
 * Body: multipart/form-data with `module=<tarball>` (matching the create POST's
 * field name) plus optional `owner`/`description`/`source`/`tags` fields.
 * `If-Match` (revision ETag) is required.
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
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

    const contentLength = request.headers.get("Content-Length");
    if (contentLength) {
      const size = Number(contentLength);
      if (!Number.isNaN(size) && size > MAX_MODULE_SIZE) {
        return badRequest(
          `Request body exceeds maximum module size of ${MAX_MODULE_SIZE / (1024 * 1024)} MB`,
        );
      }
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return badRequest("Invalid multipart/form-data body");
    }

    const moduleFile = formData.get("module");
    if (!moduleFile || !(moduleFile instanceof File)) {
      return badRequest("Missing 'module' file in form data");
    }
    if (moduleFile.size > MAX_MODULE_SIZE) {
      return badRequest(
        `Module tarball exceeds maximum size of ${MAX_MODULE_SIZE / (1024 * 1024)} MB`,
      );
    }

    let tags: string[] | undefined;
    const tagsField = formData.get("tags");
    if (typeof tagsField === "string" && tagsField.length > 0) {
      try {
        const parsedTags = JSON.parse(tagsField);
        if (!Array.isArray(parsedTags)) {
          return badRequest("Invalid JSON in 'tags' field");
        }
        tags = parsedTags as string[];
      } catch {
        return badRequest("Invalid JSON in 'tags' field");
      }
    }

    const parsedBody = adminModuleReplaceBody.safeParse({
      owner:
        typeof formData.get("owner") === "string"
          ? (formData.get("owner") as string)
          : undefined,
      description:
        typeof formData.get("description") === "string"
          ? (formData.get("description") as string)
          : undefined,
      source:
        typeof formData.get("source") === "string"
          ? (formData.get("source") as string)
          : undefined,
      tags,
    });
    if (!parsedBody.success) return validationError(parsedBody.error.issues);

    // The version must already exist — this is a replace, not a create.
    const existing = await findModule(namespace, name, system, version);
    if (!existing) {
      return notFound(
        `Module ${namespace}/${name}/${system} version ${version} not found`,
      );
    }

    // Optimistic concurrency: surface 412 before doing any R2 work.
    if (existing.revision !== ifMatch.revision) {
      return preconditionFailed();
    }

    // Immutable uploads gate: overwriting an existing version is rejected.
    if (await isImmutableUploadsEnabled()) {
      return conflict(
        "Immutable uploads enabled; module version already published",
      );
    }

    const oldLocation = existing.location;

    const r2Key = await uploadModuleTarball(
      namespace,
      name,
      system,
      version,
      moduleFile.stream(),
    );

    let updated: Module;
    try {
      updated = await conditionalModuleReplaceBytes(
        namespace,
        name,
        system,
        version,
        ifMatch.revision,
        {
          location: r2Key,
          owner: parsedBody.data.owner,
          description: parsedBody.data.description ?? undefined,
          source: parsedBody.data.source ?? undefined,
          tags,
        },
      );
    } catch (dbError) {
      // DB update failed (e.g. revision race) — drop the just-uploaded object
      // unless it overwrote the previous one in place (same key).
      if (r2Key !== oldLocation) {
        try {
          await deleteObject(r2Key);
        } catch (cleanupError) {
          console.error(
            "R2 cleanup failed after admin module replace error:",
            cleanupError,
          );
        }
      }
      throw dbError;
    }

    // Overwrite cleanup: if the new tarball landed under a different R2 key
    // than the old one, delete the orphaned old object.
    if (oldLocation && oldLocation !== r2Key) {
      try {
        await deleteObject(oldLocation);
      } catch (cleanupError) {
        console.error(
          "R2 cleanup of old module tarball failed after overwrite:",
          cleanupError,
        );
      }
    }

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
          changedFields: ["location", ...Object.keys(parsedBody.data)],
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

    console.error("Error replacing admin module version:", error);
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
