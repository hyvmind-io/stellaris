import type { NextRequest } from "next/server";

import { providerArtifactParams } from "@/lib/validation/registry";
import { notFound, validationError, internalError } from "@/lib/api/errors";
import { binaryResponse } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/middleware";
import { isStrictMode } from "@/lib/auth/registry-mode";
import { getObject } from "@/lib/storage";
/**
 * GET /v1/providers/:namespace/:type/:version/sha256sums.sig
 *
 * Serve the SHA256SUMS.sig signature file for a provider version.
 * ref: https://developer.hashicorp.com/terraform/internals/provider-registry-protocol
 *
 * Authentication: Conditional on PRIVATE_REGISTRY_MODE.
 * - relaxed (default): No auth required. Access control is enforced at the
 *   provider package endpoint. Terraform/OpenTofu does not forward Bearer tokens
 *   when following download URLs.
 * - strict: Requires Bearer auth with "providers:read" permission.
 */
export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ namespace: string; type: string; version: string }>;
  },
) {
  try {
    // Strict mode: require Bearer authentication for artifact downloads.
    // In relaxed mode (default), artifacts are served without auth for
    // compatibility with vanilla Terraform/OpenTofu, whose go-getter
    // subsystem does not forward Bearer tokens to artifact URLs.
    if (isStrictMode()) {
      const auth = await requireAuth(request as NextRequest, "providers:read");
      if (auth instanceof Response) return auth;
    }

    const rawParams = await params;
    const parsed = providerArtifactParams.safeParse(rawParams);

    if (!parsed.success) {
      return validationError(parsed.error.issues);
    }

    const { namespace, type, version } = parsed.data;
    const key = `providers/${namespace}/${type}/${version}/SHA256SUMS.sig`;

    const object = await getObject(key);
    if (!object) {
      return notFound("SHA256SUMS.sig file not found");
    }

    const filename = `${namespace}-${type}_${version}_SHA256SUMS.sig`;
    const arrayBuffer = await object.arrayBuffer();
    return binaryResponse(arrayBuffer, "application/octet-stream", filename);
  } catch (error) {
    console.error("Error serving SHA256SUMS.sig:", error);
    return internalError();
  }
}
