import type { NextRequest } from "next/server";
import { moduleGetParams } from "@/lib/validation/registry";
import {
  methodNotAllowed,
  notFound,
  validationError,
  internalError,
} from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { resolveModule, resolveModuleTags } from "@/lib/data/modules";
import { resolveCanonicalModuleCoordinates } from "@/lib/data/aliases";
import { requireAuth } from "@/lib/auth/middleware";
import { proxyModuleJson } from "@/lib/upstream/proxy";

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
 * Resolution: local (exact match + multi-system fallback) -> upstream proxy.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireAuth(request, "modules:read");
    if (auth instanceof Response) return auth;

    const rawParams = await params;
    const parsed = moduleGetParams.safeParse(rawParams);
    if (!parsed.success) return validationError(parsed.error.issues);

    const { namespace, name, system, version } = parsed.data;
    const canonical = await resolveCanonicalModuleCoordinates(
      namespace,
      name,
      system,
    );
    const mod = await resolveModule(
      canonical.namespace,
      canonical.name,
      canonical.provider,
      version,
    );

    if (mod) {
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
        tags: resolveModuleTags(mod),
      });
    }

    // Upstream fallback
    const upstream = await proxyModuleJson(
      `/v1/modules/${namespace}/${name}/${system}/${version}`,
    );
    if (upstream) {
      return jsonResponse(upstream.data);
    }

    return notFound(
      `Module ${namespace}/${name}/${system} version ${version} not found`,
    );
  } catch (error) {
    console.error("Error getting module:", error);
    return internalError();
  }
}

/**
 * POST /v1/modules/:namespace/:name/:system/:version
 *
 * Publish a new module version.
 * Body: multipart form data with:
 *   - `module` (tarball file, required)
 *   - `owner` (text, optional)
 *   - `tags` (JSON array of provider/system strings, optional)
 *
 * Tags allow a module published under system="multi" to be resolved when
 * Terraform requests a specific system like "aws". Example: tags=["aws","gcp"]
 *
 * Consistency guarantee: R2 upload + DB insert are made atomic via
 * "upload-then-insert-with-rollback". If the DB insert fails, the
 * R2 object is deleted to prevent orphaned artifacts.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  void request;
  void params;
  return methodNotAllowed(
    "Module publish is only available under /v1/admin/modules",
  );
}

/**
 * DELETE /v1/modules/:namespace/:name/:system/:version
 *
 * Delete a specific module version and its tarball from R2.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  void request;
  void params;
  return methodNotAllowed(
    "Module deletes are only available under /v1/admin/modules",
  );
}
