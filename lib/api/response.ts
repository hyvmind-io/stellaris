import { NextResponse } from "next/server";
import { makeEtag } from "./etag";

/**
 * Create a JSON response with standard registry headers. Registry metadata is
 * per-caller (auth-gated, may carry presigned URLs), so it is never cached.
 */
export function jsonResponse<T>(
  data: T,
  status = 200,
  cacheControl = "no-store",
): NextResponse {
  return NextResponse.json(data, {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": cacheControl,
    },
  });
}

/**
 * Create a JSON response with an ETag header derived from a revision number.
 *
 * Used by admin CRUD endpoints that support optimistic concurrency.
 * The client can cache the ETag and send it back in `If-Match` on updates.
 */
export function etagResponse<T>(
  data: T,
  revision: number,
  status = 200,
): NextResponse {
  const response = jsonResponse(data, status);
  response.headers.set("ETag", makeEtag(revision));
  return response;
}

/**
 * Create a 204 No Content response (used for module download redirects).
 */
export function noContentResponse(headers: Record<string, string>): Response {
  return new Response(null, {
    status: 204,
    headers,
  });
}

/**
 * Create a 200 OK response for module download redirects.
 *
 * Dual compatibility:
 * - X-Terraform-Get header → consumed by Terraform CLI
 * - JSON body { location } → consumed by OpenTofu CLI
 *
 * ref: https://opentofu.org/docs/internals/module-registry-protocol/
 */
export function moduleDownloadResponse(location: string): Response {
  return new Response(JSON.stringify({ location }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "X-Terraform-Get": location,
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Create a binary streaming response for serving artifacts from R2.
 */
export function binaryResponse(
  body: ReadableStream | ArrayBuffer | null,
  contentType: string,
  filename?: string,
): Response {
  const headers: Record<string, string> = {
    "Content-Type": contentType,
  };
  if (filename) {
    // Sanitize: allow only safe characters (word chars, dots, hyphens).
    // Anything else is replaced with underscore to prevent header injection.
    const safeFilename = filename.replace(/[^\w.\-]/g, "_");
    headers["Content-Disposition"] = `attachment; filename="${safeFilename}"`;
  }
  return new Response(body, {
    status: 200,
    headers,
  });
}

/**
 * Create a text response.
 */
export function textResponse(
  body: string,
  contentType = "text/plain",
): Response {
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": contentType },
  });
}
