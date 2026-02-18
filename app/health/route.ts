import { jsonResponse } from "@/lib/api/response";

/**
 * GET /health
 *
 * Simple health check endpoint.
 * Returns 200 with { status: "ok" }.
 */
export async function GET() {
  return jsonResponse({ status: "ok" });
}
