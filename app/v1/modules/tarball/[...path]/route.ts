import type { NextRequest } from "next/server";

import { notFound, internalError } from "@/lib/api/errors";
import { binaryResponse } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/middleware";
import { isStrictMode } from "@/lib/auth/registry-mode";
import { getModuleTarball } from "@/lib/storage";
import { offloadedArtifact } from "@/lib/storage/artifact-url";
import { generateModuleKey, parseModuleKey } from "@/lib/storage/keys";
import { moduleTarballCoordinates } from "@/lib/validation/registry";
/**
 * GET /v1/modules/tarball/[...path]
 *
 * Serve a module tarball from R2.
 * The path segments reconstruct the R2 key.
 * Example: /v1/modules/tarball/hashicorp/consul/aws/0.1.0.tar.gz
 *   → R2 key: hashicorp/consul/aws/0.1.0.tar.gz
 *
 * Authentication: Conditional on PRIVATE_REGISTRY_MODE.
 * - relaxed (default): No auth required. Access control is enforced at the
 *   module download endpoint (/v1/modules/:ns/:name/:system/:version/download)
 *   which returns this URL. Terraform/OpenTofu does not forward Bearer tokens
 *   when following X-Terraform-Get URLs.
 * - strict: Requires Bearer auth with "modules:read" permission.
 *
 * Downloads are counted at the authenticated download endpoint, not here.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    // Strict mode: require Bearer authentication for artifact downloads.
    // In relaxed mode (default), artifacts are served without auth for
    // compatibility with vanilla Terraform/OpenTofu, whose go-getter
    // subsystem does not forward Bearer tokens to artifact URLs.
    if (isStrictMode()) {
      const auth = await requireAuth(request as NextRequest, "modules:read");
      if (auth instanceof Response) return auth;
    }

    const { path } = await params;

    // Only well-formed module coordinates map to an R2 key; this keeps crafted
    // paths ("..", provider objects, raw keys) away from storage and D1.
    const parsedKey = parseModuleKey((path ?? []).join("/"));
    const coordinates = parsedKey && moduleTarballCoordinates.safeParse(parsedKey);
    if (!coordinates || !coordinates.success) {
      return notFound("Invalid tarball path");
    }
    const { namespace, name, provider, version } = coordinates.data;
    const key = generateModuleKey(namespace, name, provider, version);

    // Free tier redirects to R2, which answers 404 itself for a missing object.
    const offloaded = await offloadedArtifact(key);
    if (offloaded) return offloaded;

    const object = await getModuleTarball(key);
    if (!object) {
      return notFound("Module tarball not found");
    }
    return binaryResponse(object.body, "application/gzip", `${version}.tar.gz`);
  } catch (error) {
    console.error("Error serving module tarball:", error);
    return internalError();
  }
}
