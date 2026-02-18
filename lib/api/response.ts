import { NextResponse } from "next/server";

/**
 * Create a JSON response with standard registry headers.
 */
export function jsonResponse<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
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
    headers["Content-Disposition"] = `attachment; filename="${filename}"`;
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
