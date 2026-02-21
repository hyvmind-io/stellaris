import type { NextRequest } from "next/server";
import { validateApiKey } from "./api-keys";
import { unauthorized, forbidden } from "@/lib/api/errors";
import { PERMISSIONS } from "@/lib/permissions";
import type { ApiKey } from "@/db/schema";

const MUTABLE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Validate the API key from the Authorization header.
 * Returns the ApiKey record if valid, or an error Response (401/403) if not.
 *
 * Supports both `Bearer <key>` and raw `<key>` in the Authorization header.
 *
 * @param request — The incoming request with an Authorization header.
 * @param permission — Optional permission to enforce (e.g. `"modules:write"`).
 *   If provided, the key must have this permission or `"admin"` (wildcard).
 *   If omitted, no permission check is performed (backward compatible).
 *
 * Usage in route handlers:
 * ```ts
 *   const auth = await requireAuth(request, "modules:write");
 *   if (auth instanceof Response) return auth;
 *   // auth is now ApiKey — use auth.name, auth.permissions, etc.
 * ```
 */
export async function requireAuth(
  request: NextRequest,
  permission?: string,
): Promise<ApiKey | Response> {
  const authHeader = request.headers.get("Authorization");

  if (!authHeader) {
    return unauthorized("Missing Authorization header");
  }

  // Support both "Bearer <key>" and raw "<key>"
  const key = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : authHeader.trim();

  if (!key) {
    return unauthorized("Invalid Authorization header");
  }

  const apiKey = await validateApiKey(key);

  if (!apiKey) {
    return unauthorized("Invalid or expired API key");
  }

  // Permission enforcement (skip if no permission required — backward compat)
  if (permission) {
    const permissions = apiKey.permissions;

    if (!permissions) {
      return forbidden(`Missing required permission: ${permission}`);
    }

    if (!permissions.includes("admin") && !permissions.includes(permission)) {
      return forbidden(`Missing required permission: ${permission}`);
    }
  }

  return apiKey;
}

/**
 * Require admin permission for `/v1/admin` write contracts.
 */
export async function requireAdminWriteAuth(
  request: NextRequest,
): Promise<ApiKey | Response> {
  if (!MUTABLE_METHODS.has(request.method)) {
    return forbidden("Admin write contract requires a mutable HTTP method");
  }

  if (!request.nextUrl.pathname.startsWith("/v1/admin/")) {
    return forbidden("Admin write contract is only valid for /v1/admin routes");
  }

  return requireAuth(request, PERMISSIONS.ADMIN);
}
