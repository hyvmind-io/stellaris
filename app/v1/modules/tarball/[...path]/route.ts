import type { NextRequest } from "next/server";
import { notFound, internalError } from "@/lib/api/errors";
import { binaryResponse } from "@/lib/api/response";
import { getModuleTarball } from "@/lib/storage/r2";
import { incrementModuleDownloads } from "@/lib/data/modules";

/**
 * GET /v1/modules/tarball/[...path]
 *
 * Serve a module tarball from R2.
 * The path segments reconstruct the R2 key.
 * Example: /v1/modules/tarball/modules/hashicorp/consul/aws/0.1.0.tar.gz
 *   → R2 key: modules/hashicorp/consul/aws/0.1.0.tar.gz
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path } = await params;

    if (!path || path.length === 0) {
      return notFound("Invalid tarball path");
    }

    // Reconstruct the R2 key from path segments
    const key = path.join("/");

    const object = await getModuleTarball(key);
    if (!object) {
      return notFound("Module tarball not found");
    }

    // Try to increment downloads (best-effort, don't fail the request)
    // Path format: modules/{namespace}/{name}/{provider}/{version}.tar.gz
    try {
      const parts = key.split("/");
      if (parts.length >= 5 && parts[0] === "modules") {
        const namespace = parts[1];
        const name = parts[2];
        const provider = parts[3];
        const version = parts[4].replace(".tar.gz", "");
        await incrementModuleDownloads(namespace, name, provider, version);
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
