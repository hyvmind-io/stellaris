import type { NextRequest } from "next/server";
import { providerVersionsParams } from "@/lib/validation/registry";
import { notFound, validationError, internalError } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { getProviderVersions } from "@/lib/data/providers";

/**
 * GET /v1/providers/:namespace/:type/versions
 *
 * List available versions for a specific provider.
 * ref: https://developer.hashicorp.com/terraform/internals/provider-registry-protocol#list-available-versions
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ namespace: string; type: string }> },
) {
  try {
    const rawParams = await params;
    const parsed = providerVersionsParams.safeParse(rawParams);

    if (!parsed.success) {
      return validationError(parsed.error.issues);
    }

    const { namespace, type } = parsed.data;
    const versions = await getProviderVersions(namespace, type);

    if (versions.length === 0) {
      return notFound(`Provider ${namespace}/${type} not found`);
    }

    // Terraform CLI expects this exact format with versions + platforms
    return jsonResponse({
      versions: versions.map((v) => ({
        version: v.version,
        protocols: v.protocols,
        platforms: v.platforms,
      })),
    });
  } catch (error) {
    console.error("Error listing provider versions:", error);
    return internalError();
  }
}
