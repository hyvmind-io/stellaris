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
import { uploadModuleTarball, deleteObject } from "@/lib/storage/r2";
import { generateModuleKey } from "@/lib/storage/keys";

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
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
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
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const rawParams = await params;
    const parsed = modulePublishParams.safeParse(rawParams);
    if (!parsed.success) return validationError(parsed.error.issues);

    const { namespace, name, system, version } = parsed.data;

    // Check for duplicate
    const existing = await findModule(namespace, name, system, version);
    if (existing) {
      return conflict(
        `Module ${namespace}/${name}/${system} version ${version} already exists`,
      );
    }

    // Parse multipart form (Web API — native in Cloudflare Workers)
    const formData = await request.formData();
    const moduleFile = formData.get("module");
    if (!moduleFile || !(moduleFile instanceof File)) {
      return badRequest("Missing 'module' file in form data");
    }

    const owner = (formData.get("owner") as string) ?? "";

    // Upload tarball to R2
    const tarball = await moduleFile.arrayBuffer();
    const location = await uploadModuleTarball(
      namespace,
      name,
      system,
      version,
      tarball,
    );

    // Save metadata to D1
    const mod = await saveModule({
      namespace,
      name,
      provider: system, // "system" in URL -> "provider" in DB
      version,
      owner,
      location,
    });

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
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
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

    // Clean up R2 tarball (best-effort)
    try {
      const key = generateModuleKey(namespace, name, system, version);
      await deleteObject(key);
    } catch {
      // Best-effort R2 cleanup
    }

    return noContentResponse({});
  } catch (error) {
    console.error("Error deleting module:", error);
    return internalError();
  }
}
