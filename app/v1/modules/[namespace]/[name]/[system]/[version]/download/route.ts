import type { NextRequest } from "next/server";
import { moduleDownloadParams } from "@/lib/validation/registry";
import { notFound, validationError, internalError } from "@/lib/api/errors";
import { moduleDownloadResponse } from "@/lib/api/response";
import { resolveModule } from "@/lib/data/modules";
import { resolveCanonicalModuleCoordinates } from "@/lib/data/aliases";
import { requireAuth } from "@/lib/auth/middleware";
import { proxyModuleJson } from "@/lib/upstream/proxy";

/**
 * GET /v1/modules/:namespace/:name/:system/:version/download
 *
 * Download source code for a specific module version.
 * Returns 200 OK with:
 *   - X-Terraform-Get header (Terraform CLI compatibility)
 *   - JSON body { location } (OpenTofu CLI compatibility)
 *
 * Resolution: local (exact match + multi-system fallback) -> upstream proxy.
 *
 * ref: https://developer.hashicorp.com/terraform/registry/api-docs#download-source-code-for-a-specific-module-version
 * ref: https://opentofu.org/docs/internals/module-registry-protocol/
 */
export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      namespace: string;
      name: string;
      system: string;
      version: string;
    }>;
  },
) {
  try {
    const auth = await requireAuth(request, "modules:read");
    if (auth instanceof Response) return auth;

    const rawParams = await params;
    const parsed = moduleDownloadParams.safeParse(rawParams);

    if (!parsed.success) {
      return validationError(parsed.error.issues);
    }

    const { namespace, name, system, version } = parsed.data;
    const canonical = await resolveCanonicalModuleCoordinates(
      namespace,
      name,
      system,
    );
    const moduleRecord = await resolveModule(
      canonical.namespace,
      canonical.name,
      canonical.provider,
      version,
    );

    if (moduleRecord) {
      const location = `/v1/modules/tarball/${moduleRecord.location}`;
      return moduleDownloadResponse(location);
    }

    // Upstream fallback — proxy the download response
    const upstream = await proxyModuleJson<{ location?: string }>(
      `/v1/modules/${namespace}/${name}/${system}/${version}/download`,
    );
    if (upstream && upstream.data.location) {
      // Return the upstream's download location directly (absolute URL)
      return moduleDownloadResponse(upstream.data.location);
    }

    return notFound(
      `Module ${namespace}/${name}/${system} version ${version} not found`,
    );
  } catch (error) {
    console.error("Error downloading module:", error);
    return internalError();
  }
}
