import type { NextRequest } from "next/server";
import { moduleDownloadParams } from "@/lib/validation/registry";
import { notFound, validationError, internalError } from "@/lib/api/errors";
import { noContentResponse } from "@/lib/api/response";
import { findModule } from "@/lib/data/modules";

/**
 * GET /v1/modules/:namespace/:name/:system/:version/download
 *
 * Download source code for a specific module version.
 * Returns 204 with X-Terraform-Get header pointing to the tarball location.
 * ref: https://developer.hashicorp.com/terraform/registry/api-docs#download-source-code-for-a-specific-module-version
 */
export async function GET(
  _request: NextRequest,
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

    // Terraform CLI reads this header to know where to download the tarball
    return noContentResponse({
      "X-Terraform-Get": `/v1/modules/tarball/${module.location}`,
    });
  } catch (error) {
    console.error("Error downloading module:", error);
    return internalError();
  }
}
