import type { NextRequest } from "next/server";
import { moduleVersionsParams } from "@/lib/validation/registry";
import { adminModuleCreateBody } from "@/lib/validation/admin";
import type { Module } from "@/db/schema";
import {
  badRequest,
  conflict,
  internalError,
  validationError,
} from "@/lib/api/errors";
import { etagResponse } from "@/lib/api/response";
import { requireAdminWriteAuth } from "@/lib/auth/middleware";
import { findModule, resolveModuleTags, saveModule } from "@/lib/data/modules";
import { writeAuditLog, buildModuleAuditMetadata } from "@/lib/data/audit";
import { isUniqueConstraintError } from "@/lib/data/errors";
import { uploadModuleTarball, deleteObject } from "@/lib/storage";
import { MAX_MODULE_SIZE } from "@/lib/validation/limits";

type RouteParams = {
  params: Promise<{ namespace: string; name: string; system: string }>;
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
 * POST /v1/admin/modules/:namespace/:name/:system/versions
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireAdminWriteAuth(request);
    if (auth instanceof Response) return auth;

    const parsedParams = moduleVersionsParams.safeParse(await params);
    if (!parsedParams.success)
      return validationError(parsedParams.error.issues);

    const { namespace, name, system } = parsedParams.data;

    const contentLength = request.headers.get("Content-Length");
    if (contentLength) {
      const size = Number(contentLength);
      if (!Number.isNaN(size) && size > MAX_MODULE_SIZE) {
        return badRequest(
          `Request body exceeds maximum module size of ${MAX_MODULE_SIZE / (1024 * 1024)} MB`,
        );
      }
    }

    const formData = await request.formData();
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
        const parsed = JSON.parse(tagsField);
        if (!Array.isArray(parsed)) {
          return badRequest("Invalid JSON in 'tags' field");
        }
        tags = parsed as string[];
      } catch {
        return badRequest("Invalid JSON in 'tags' field");
      }
    }

    const parsedBody = adminModuleCreateBody.safeParse({
      version: formData.get("version"),
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

    const { version, owner, description, source } = parsedBody.data;
    const existing = await findModule(namespace, name, system, version);
    if (existing) {
      return conflict(
        `Module ${namespace}/${name}/${system} version ${version} already exists`,
      );
    }

    const r2Key = await uploadModuleTarball(
      namespace,
      name,
      system,
      version,
      moduleFile.stream(),
    );

    try {
      const module = await saveModule({
        namespace,
        name,
        provider: system,
        version,
        owner,
        description: description ?? undefined,
        source: source ?? undefined,
        location: r2Key,
        tags,
      });

      try {
        await writeAuditLog({
          action: "module.create",
          resourceType: "module",
          resourceId: `${namespace}/${name}/${system}/${version}`,
          actorId: auth.name,
          actorType: "api_key",
          metadata: buildModuleAuditMetadata({
            namespace,
            name,
            provider: system,
            version,
            revision: { nextRevision: module.revision },
            changedFields: [
              "version",
              "owner",
              "description",
              "source",
              "tags",
            ],
          }),
        });
      } catch (auditError) {
        console.error("Failed to write module.create audit log:", auditError);
      }

      return etagResponse(serializeModule(module), module.revision, 201);
    } catch (dbError) {
      try {
        await deleteObject(r2Key);
      } catch (cleanupError) {
        console.error(
          "R2 cleanup failed after admin module create error:",
          cleanupError,
        );
      }

      if (isUniqueConstraintError(dbError)) {
        return conflict(
          `Module ${namespace}/${name}/${system} version ${version} already exists`,
        );
      }

      throw dbError;
    }
  } catch (error) {
    console.error("Error creating admin module version:", error);
    return internalError();
  }
}
