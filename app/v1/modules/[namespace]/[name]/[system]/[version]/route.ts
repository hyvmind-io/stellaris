import type { NextRequest } from "next/server";
import {
  moduleGetParams,
  modulePublishParams,
} from "@/lib/validation/registry";
import {
  notFound,
  validationError,
  badRequest,
  conflict,
  internalError,
} from "@/lib/api/errors";
import { jsonResponse, noContentResponse } from "@/lib/api/response";
import { findModule, saveModule, deleteModule } from "@/lib/data/modules";
import { isUniqueConstraintError } from "@/lib/data/errors";
import { uploadModuleTarball, deleteObject } from "@/lib/storage";
import { requireAuth } from "@/lib/auth/middleware";
import { MAX_MODULE_SIZE } from "@/lib/validation/limits";

type RouteParams = {
  params: Promise<{
    namespace: string;
    name: string;
    system: string;
    version: string;
  }>;
};

/**
 * GET /v1/modules/:namespace/:name/:system/:version
 *
 * Return full metadata for a specific module version.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireAuth(request, "modules:read");
    if (auth instanceof Response) return auth;

    const rawParams = await params;
    const parsed = moduleGetParams.safeParse(rawParams);
    if (!parsed.success) return validationError(parsed.error.issues);

    const { namespace, name, system, version } = parsed.data;
    const mod = await findModule(namespace, name, system, version);

    if (!mod) {
      return notFound(
        `Module ${namespace}/${name}/${system} version ${version} not found`,
      );
    }

    return jsonResponse({
      id: `${mod.namespace}/${mod.name}/${mod.provider}/${mod.version}`,
      namespace: mod.namespace,
      name: mod.name,
      provider: mod.provider,
      version: mod.version,
      owner: mod.owner,
      description: mod.description,
      source: mod.source,
      published_at: mod.publishedAt.toISOString(),
      downloads: mod.downloads,
    });
  } catch (error) {
    console.error("Error getting module:", error);
    return internalError();
  }
}

/**
 * POST /v1/modules/:namespace/:name/:system/:version
 *
 * Publish a new module version.
 * Body: multipart form data with `module` (tarball file) + optional `owner` text field.
 *
 * Consistency guarantee: R2 upload + DB insert are made atomic via
 * "upload-then-insert-with-rollback". If the DB insert fails, the
 * R2 object is deleted to prevent orphaned artifacts.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireAuth(request, "modules:write");
    if (auth instanceof Response) return auth;

    const rawParams = await params;
    const parsed = modulePublishParams.safeParse(rawParams);
    if (!parsed.success) return validationError(parsed.error.issues);

    const { namespace, name, system, version } = parsed.data;

    // Fast-path duplicate check — avoids R2 upload for known conflicts.
    // NOT the only protection: the DB unique constraint is the authoritative guard.
    const existing = await findModule(namespace, name, system, version);
    if (existing) {
      return conflict(
        `Module ${namespace}/${name}/${system} version ${version} already exists`,
      );
    }

    // Pre-check Content-Length to reject oversized requests before parsing formData
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

    const owner = (formData.get("owner") as string) ?? "";

    // Step 1: Upload tarball to R2 (streamed to avoid buffering entire file)
    const r2Key = await uploadModuleTarball(
      namespace,
      name,
      system,
      version,
      moduleFile.stream(),
    );

    // Step 2: Save metadata to D1
    // On failure: delete the R2 object to prevent orphaned artifacts
    let mod;
    try {
      mod = await saveModule({
        namespace,
        name,
        provider: system,
        version,
        owner,
        location: r2Key,
      });
    } catch (dbError) {
      // Consistency guarantee: R2 upload succeeded but DB failed → clean up R2
      try {
        await deleteObject(r2Key);
      } catch (r2CleanupError) {
        console.error("R2 cleanup failed after DB error:", r2CleanupError);
      }

      if (isUniqueConstraintError(dbError)) {
        return conflict(
          `Module ${namespace}/${name}/${system} version ${version} already exists`,
        );
      }

      console.error("DB error publishing module:", dbError);
      return internalError();
    }

    return jsonResponse(
      {
        id: `${mod.namespace}/${mod.name}/${mod.provider}/${mod.version}`,
        namespace: mod.namespace,
        name: mod.name,
        provider: mod.provider,
        version: mod.version,
        owner: mod.owner,
        published_at: mod.publishedAt.toISOString(),
        downloads: mod.downloads,
      },
      201,
    );
  } catch (error) {
    console.error("Error publishing module:", error);
    return internalError();
  }
}

/**
 * DELETE /v1/modules/:namespace/:name/:system/:version
 *
 * Delete a specific module version and its tarball from R2.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    // Authenticate — write operations require a valid API key
    const auth = await requireAuth(request, "modules:write");
    if (auth instanceof Response) return auth;

    const rawParams = await params;
    const parsed = modulePublishParams.safeParse(rawParams);
    if (!parsed.success) return validationError(parsed.error.issues);

    const { namespace, name, system, version } = parsed.data;

    // Delete from D1 (returns deleted record for R2 cleanup)
    const deleted = await deleteModule(namespace, name, system, version);
    if (!deleted) {
      return notFound(
        `Module ${namespace}/${name}/${system} version ${version} not found`,
      );
    }

    // Clean up R2 tarball (best-effort).
    // Use the stored R2 key from the database record rather than regenerating it.
    // This is more resilient to future key format changes.
    if (deleted.location) {
      try {
        await deleteObject(deleted.location);
      } catch {
        // Best-effort R2 cleanup
      }
    }

    return noContentResponse({});
  } catch (error) {
    console.error("Error deleting module:", error);
    return internalError();
  }
}
