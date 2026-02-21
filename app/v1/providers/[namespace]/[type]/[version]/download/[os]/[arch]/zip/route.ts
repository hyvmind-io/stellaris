import type { NextRequest } from "next/server";

import { providerDownloadParams } from "@/lib/validation/registry";
import { notFound, validationError, internalError } from "@/lib/api/errors";
import { binaryResponse } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/middleware";
import { isStrictMode } from "@/lib/auth/registry-mode";
import { resolveProviderCoordinates } from "@/lib/data/aliases";
import { getObject } from "@/lib/storage";
import { generateProviderKey } from "@/lib/storage/keys";
/**
 * GET /v1/providers/:namespace/:type/:version/download/:os/:arch/zip
 *
 * Download the actual provider binary zip from R2.
 *
 * Authentication: Conditional on PRIVATE_REGISTRY_MODE.
 * - relaxed (default): No auth required. Access control is enforced at the
 *   provider package endpoint (/v1/providers/:ns/:type/:version/download/:os/:arch)
 *   which returns this URL. Terraform/OpenTofu does not forward Bearer tokens
 *   when following download URLs.
 * - strict: Requires Bearer auth with "providers:read" permission.
 */
export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      namespace: string;
      type: string;
      version: string;
      os: string;
      arch: string;
    }>;
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
    const parsed = providerDownloadParams.safeParse(rawParams);

    if (!parsed.success) {
      return validationError(parsed.error.issues);
    }

    const { namespace, type, version, os, arch } = parsed.data;
    const canonical = await resolveProviderCoordinates(namespace, type);
    const key = generateProviderKey(
      canonical.namespace,
      canonical.type,
      version,
      os,
      arch,
    );

    const object = await getObject(key);
    if (!object) {
      return notFound("Provider binary not found");
    }

    const filename = `terraform-provider-${type}_${version}_${os}_${arch}.zip`;

    return binaryResponse(object.body, "application/zip", filename);
  } catch (error) {
    console.error("Error serving provider zip:", error);
    return internalError();
  }
}
