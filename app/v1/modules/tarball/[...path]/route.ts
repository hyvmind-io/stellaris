import type { NextRequest } from "next/server";

import { notFound, internalError } from "@/lib/api/errors";
import { binaryResponse } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/middleware";
import { isStrictMode } from "@/lib/auth/registry-mode";
import { getModuleTarball } from "@/lib/storage";
import { parseModuleKey } from "@/lib/storage/keys";
import { incrementModuleDownloads } from "@/lib/data/modules";
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

    if (!path || path.length === 0) {
      return notFound("Invalid tarball path");
    }

    // Reconstruct the R2 key from path segments
    const key = path.join("/");

    // Security: Validate the R2 key conforms to the expected module tarball format.
    // Without this check, a crafted URL could serve arbitrary R2 objects
    // (e.g., provider zips, SHA256SUMS files, or future internal objects).
    // Format: {namespace}/{name}/{provider}/{version}.tar.gz (4 segments)
    if (!key.endsWith(".tar.gz") || key.split("/").length !== 4) {
      return notFound("Invalid tarball path");
    }

    const object = await getModuleTarball(key);
    if (!object) {
      return notFound("Module tarball not found");
    }

    // Try to increment downloads (best-effort, don't fail the request)
    // Path format: {namespace}/{name}/{provider}/{version}.tar.gz
    try {
      const parsed = parseModuleKey(key);
      if (parsed) {
        await incrementModuleDownloads(
          parsed.namespace,
          parsed.name,
          parsed.provider,
          parsed.version,
        );
      }
    } catch {
      // Best-effort — don't fail the download if counter update fails
    }

    return binaryResponse(
      object.body,
      "application/gzip",
      path[path.length - 1],
    );
  } catch (error) {
    console.error("Error serving module tarball:", error);
    return internalError();
  }
}
