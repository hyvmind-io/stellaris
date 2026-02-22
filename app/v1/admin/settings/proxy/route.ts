import type { NextRequest } from "next/server";
import { proxySettingsPatch } from "@/lib/validation/registry";
import { validationError, internalError } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/middleware";
import {
  getProxySettingsSnapshot,
  updateProxySettings,
} from "@/lib/upstream/config-service";

/**
 * GET /v1/admin/settings/proxy
 *
 * Return current upstream proxy configuration.
 * Includes both the effective (resolved) values and the raw DB overrides.
 *
 * Auth: requires "admin" permission.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, "admin");
    if (auth instanceof Response) return auth;

    const settings = await getProxySettingsSnapshot({ includeOverrides: true });
    return jsonResponse(settings);
  } catch (error) {
    console.error("Error getting proxy settings:", error);
    return internalError();
  }
}

/**
 * PATCH /v1/admin/settings/proxy
 *
 * Update upstream proxy configuration.
 * Only provided fields are updated; omitted fields are left unchanged.
 * Set a field to `null` to clear the DB override (revert to env/defaults).
 *
 * Auth: requires "admin" permission.
 */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAuth(request, "admin");
    if (auth instanceof Response) return auth;

    const body = await request.json();
    const parsed = proxySettingsPatch.safeParse(body);
    if (!parsed.success) return validationError(parsed.error.issues);

    const settings = await updateProxySettings(parsed.data);
    return jsonResponse(settings);
  } catch (error) {
    console.error("Error updating proxy settings:", error);
    return internalError();
  }
}
