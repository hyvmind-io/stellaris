import type { NextRequest } from "next/server";
import { moduleVersionsParams } from "@/lib/validation/registry";
import { notFound, validationError, internalError } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { resolveModuleVersions } from "@/lib/data/modules";
import { resolveCanonicalModuleCoordinates } from "@/lib/data/aliases";
import { requireAuth } from "@/lib/auth/middleware";
import { proxyModuleJson } from "@/lib/upstream/proxy";

/**
 * GET /v1/modules/:namespace/:name/:system/versions
 *
 * List available versions for a specific module.
 * Resolution: local (exact match + multi-system fallback) -> upstream proxy.
 *
 * ref: https://developer.hashicorp.com/terraform/registry/api-docs#list-available-versions-for-a-specific-module
 */
export async function GET(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ namespace: string; name: string; system: string }> },
) {
  try {
    const auth = await requireAuth(request, "modules:read");
    if (auth instanceof Response) return auth;

    const rawParams = await params;
    const parsed = moduleVersionsParams.safeParse(rawParams);

    if (!parsed.success) {
      return validationError(parsed.error.issues);
    }

    const { namespace, name, system } = parsed.data;
    const canonical = await resolveCanonicalModuleCoordinates(
      namespace,
      name,
      system,
    );
    const versions = await resolveModuleVersions(
      canonical.namespace,
      canonical.name,
      canonical.provider,
    );

    if (versions.length > 0) {
      // Terraform CLI expects this exact format
      return jsonResponse({
        modules: [
          {
            source: `${namespace}/${name}/${system}`,
            versions: versions.map((v) => ({ version: v.version })),
          },
        ],
      });
    }

    // Upstream fallback — proxy to upstream registries
    const upstream = await proxyModuleJson(
      `/v1/modules/${namespace}/${name}/${system}/versions`,
    );
    if (upstream) {
      return jsonResponse(upstream.data);
    }

    return notFound(`Module ${namespace}/${name}/${system} not found`);
  } catch (error) {
    console.error("Error listing module versions:", error);
    return internalError();
  }
}
