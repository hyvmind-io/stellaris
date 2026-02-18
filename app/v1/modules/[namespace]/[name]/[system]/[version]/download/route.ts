import type { NextRequest } from "next/server";
import { moduleDownloadParams } from "@/lib/validation/registry";
import { notFound, validationError, internalError } from "@/lib/api/errors";
import { moduleDownloadResponse } from "@/lib/api/response";
import { findModule } from "@/lib/data/modules";
import { requireAuth } from "@/lib/auth/middleware";

/**
 * GET /v1/modules/:namespace/:name/:system/:version/download
 *
 * Download source code for a specific module version.
 * Returns 200 OK with:
 *   - X-Terraform-Get header (Terraform CLI compatibility)
 *   - JSON body { location } (OpenTofu CLI compatibility)
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
    const module = await findModule(namespace, name, system, version);

    if (!module) {
      return notFound(
        `Module ${namespace}/${name}/${system} version ${version} not found`,
      );
    }

    const location = `/v1/modules/tarball/${module.location}`;
    return moduleDownloadResponse(location);
  } catch (error) {
    console.error("Error downloading module:", error);
    return internalError();
  }
}
