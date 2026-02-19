import type { NextRequest } from "next/server";
import { providerArtifactParams } from "@/lib/validation/registry";
import { notFound, validationError, internalError } from "@/lib/api/errors";
import { textResponse } from "@/lib/api/response";
import { getObject } from "@/lib/storage";
import { requireAuth } from "@/lib/auth/middleware";

/**
 * GET /v1/providers/:namespace/:type/:version/sha256sums
 *
 * Serve the SHA256SUMS file for a provider version.
 * ref: https://developer.hashicorp.com/terraform/internals/provider-registry-protocol
 */
export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ namespace: string; type: string; version: string }>;
  },
) {
  try {
    const auth = await requireAuth(request, "providers:read");
    if (auth instanceof Response) return auth;

    const rawParams = await params;
    const parsed = providerArtifactParams.safeParse(rawParams);

    if (!parsed.success) {
      return validationError(parsed.error.issues);
    }

    const { namespace, type, version } = parsed.data;
    const key = `providers/${namespace}/${type}/${version}/SHA256SUMS`;

    const object = await getObject(key);
    if (!object) {
      return notFound("SHA256SUMS file not found");
    }

    const text = await object.text();
    return textResponse(text, "text/plain");
  } catch (error) {
    console.error("Error serving SHA256SUMS:", error);
    return internalError();
  }
}
