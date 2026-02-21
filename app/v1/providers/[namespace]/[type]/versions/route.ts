import type { NextRequest } from "next/server";
import { providerVersionsParams } from "@/lib/validation/registry";
import { notFound, validationError, internalError } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { resolveProviderCoordinates } from "@/lib/data/aliases";
import { getProviderVersions } from "@/lib/data/providers";
import { requireAuth } from "@/lib/auth/middleware";
import { proxyProviderJson } from "@/lib/upstream/proxy";

/**
 * GET /v1/providers/:namespace/:type/versions
 *
 * List available versions for a specific provider.
 * Resolution: local -> upstream proxy fallback.
 *
 * ref: https://developer.hashicorp.com/terraform/internals/provider-registry-protocol#list-available-versions
 * ref: https://opentofu.org/docs/internals/provider-registry-protocol/#list-available-versions
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ namespace: string; type: string }> },
) {
  try {
    const auth = await requireAuth(request, "providers:read");
    if (auth instanceof Response) return auth;

    const rawParams = await params;
    const parsed = providerVersionsParams.safeParse(rawParams);

    if (!parsed.success) {
      return validationError(parsed.error.issues);
    }

    const { namespace, type } = parsed.data;
    const canonical = await resolveProviderCoordinates(namespace, type);

    const versions = await getProviderVersions(
      canonical.namespace,
      canonical.type,
    );

    if (versions.length > 0) {
      return jsonResponse({
        // OpenTofu supports an optional `warnings` field per version for
        // deprecation notices. We include an empty array for forward
        // compatibility — populate from DB when the feature is needed.
        versions: versions.map((v) => ({
          version: v.version,
          protocols: v.protocols,
          platforms: v.platforms,
          warnings: [] as string[],
        })),
      });
    }

    // Upstream fallback
    const upstream = await proxyProviderJson(
      `/v1/providers/${canonical.namespace}/${canonical.type}/versions`,
    );
    if (upstream) {
      return jsonResponse(upstream.data);
    }

    return notFound(`Provider ${namespace}/${type} not found`);
  } catch (error) {
    console.error("Error listing provider versions:", error);
    return internalError();
  }
}
