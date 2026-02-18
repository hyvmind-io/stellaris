import type { NextRequest } from "next/server";
import { moduleVersionsParams } from "@/lib/validation/registry";
import { notFound, validationError, internalError } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { getModuleVersions } from "@/lib/data/modules";

/**
 * GET /v1/modules/:namespace/:name/:system/versions
 *
 * List available versions for a specific module.
 * ref: https://developer.hashicorp.com/terraform/registry/api-docs#list-available-versions-for-a-specific-module
 */
export async function GET(
  _request: NextRequest,
  {
    params,
  }: { params: Promise<{ namespace: string; name: string; system: string }> },
) {
  try {
    const rawParams = await params;
    const parsed = moduleVersionsParams.safeParse(rawParams);

    if (!parsed.success) {
      return validationError(parsed.error.issues);
    }

    const { namespace, name, system } = parsed.data;
    const versions = await getModuleVersions(namespace, name, system);

    if (versions.length === 0) {
      return notFound(`Module ${namespace}/${name}/${system} not found`);
    }

    // Terraform CLI expects this exact format
    return jsonResponse({
      modules: [
        {
          source: `${namespace}/${name}/${system}`,
          versions: versions.map((v) => ({ version: v.version })),
        },
      ],
    });
  } catch (error) {
    console.error("Error listing module versions:", error);
    return internalError();
  }
}
