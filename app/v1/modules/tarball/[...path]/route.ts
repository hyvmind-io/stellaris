import type { NextRequest } from "next/server";
import { notFound, internalError } from "@/lib/api/errors";
import { binaryResponse } from "@/lib/api/response";
import { getModuleTarball } from "@/lib/storage/r2";
import { parseModuleKey } from "@/lib/storage/keys";
import { incrementModuleDownloads } from "@/lib/data/modules";
import { requireAuth } from "@/lib/auth/middleware";

/**
 * GET /v1/modules/tarball/[...path]
 *
 * Serve a module tarball from R2.
 * The path segments reconstruct the R2 key.
 * Example: /v1/modules/tarball/modules/hashicorp/consul/aws/0.1.0.tar.gz
 *   → R2 key: modules/hashicorp/consul/aws/0.1.0.tar.gz
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const auth = await requireAuth(request, "modules:read");
    if (auth instanceof Response) return auth;

    const { path } = await params;

    if (!path || path.length === 0) {
      return notFound("Invalid tarball path");
    }

    // Reconstruct the R2 key from path segments
    const key = path.join("/");

    // Security: Validate the R2 key conforms to the expected module tarball format.
    // Without this check, a crafted URL could serve arbitrary R2 objects
    // (e.g., provider zips, SHA256SUMS files, or future internal objects).
    if (!key.startsWith("modules/") || !key.endsWith(".tar.gz")) {
      return notFound("Invalid tarball path");
    }

    const object = await getModuleTarball(key);
    if (!object) {
      return notFound("Module tarball not found");
    }

    // Try to increment downloads (best-effort, don't fail the request)
    // Path format: modules/{namespace}/{name}/{provider}/{version}.tar.gz
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
