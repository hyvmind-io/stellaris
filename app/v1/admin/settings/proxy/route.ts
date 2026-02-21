import type { NextRequest } from "next/server";
import { proxySettingsPatch } from "@/lib/validation/registry";
import { validationError, internalError } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/middleware";
import {
  getSystemSetting,
  setSystemSetting,
  deleteSystemSetting,
} from "@/lib/data/settings";
import { SETTINGS_KEY } from "@/lib/upstream/config";
import {
  resolveModuleRegistries,
  resolveProviderRegistries,
  isModuleProxyEnabled,
  isProviderProxyEnabled,
  normaliseRegistryUrl,
} from "@/lib/upstream/config";

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

    const [
      moduleEnabled,
      providerEnabled,
      moduleRegistries,
      providerRegistries,
      dbModuleEnabled,
      dbProviderEnabled,
      dbModuleRegistries,
      dbProviderRegistries,
    ] = await Promise.all([
      isModuleProxyEnabled(),
      isProviderProxyEnabled(),
      resolveModuleRegistries(),
      resolveProviderRegistries(),
      getSystemSetting(SETTINGS_KEY.moduleProxyEnabled),
      getSystemSetting(SETTINGS_KEY.providerProxyEnabled),
      getSystemSetting(SETTINGS_KEY.moduleRegistries),
      getSystemSetting(SETTINGS_KEY.providerRegistries),
    ]);

    return jsonResponse({
      // Effective (resolved) values — what the proxy will actually use
      module_proxy_enabled: moduleEnabled,
      provider_proxy_enabled: providerEnabled,
      module_upstream_registries: moduleRegistries,
      provider_upstream_registries: providerRegistries,
      // Raw DB overrides — null means "no DB override, using env/defaults"
      overrides: {
        module_proxy_enabled: dbModuleEnabled ?? null,
        provider_proxy_enabled: dbProviderEnabled ?? null,
        module_upstream_registries: dbModuleRegistries
          ? safeParseJson(dbModuleRegistries)
          : null,
        provider_upstream_registries: dbProviderRegistries
          ? safeParseJson(dbProviderRegistries)
          : null,
      },
    });
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

    const data = parsed.data;

    // Apply updates in parallel
    const updates: Promise<void>[] = [];

    if (data.module_proxy_enabled !== undefined) {
      updates.push(
        setSystemSetting(
          SETTINGS_KEY.moduleProxyEnabled,
          String(data.module_proxy_enabled),
        ),
      );
    }

    if (data.provider_proxy_enabled !== undefined) {
      updates.push(
        setSystemSetting(
          SETTINGS_KEY.providerProxyEnabled,
          String(data.provider_proxy_enabled),
        ),
      );
    }

    if (data.module_upstream_registries !== undefined) {
      if (data.module_upstream_registries === null) {
        // Clear DB override — revert to env/defaults
        updates.push(deleteSystemSetting(SETTINGS_KEY.moduleRegistries));
      } else {
        // Normalise URLs and store as JSON array
        const normalised = data.module_upstream_registries
          .map(normaliseRegistryUrl)
          .filter((u): u is string => u !== null);
        updates.push(
          setSystemSetting(
            SETTINGS_KEY.moduleRegistries,
            JSON.stringify(normalised),
          ),
        );
      }
    }

    if (data.provider_upstream_registries !== undefined) {
      if (data.provider_upstream_registries === null) {
        // Clear DB override
        updates.push(deleteSystemSetting(SETTINGS_KEY.providerRegistries));
      } else {
        const normalised = data.provider_upstream_registries
          .map(normaliseRegistryUrl)
          .filter((u): u is string => u !== null);
        updates.push(
          setSystemSetting(
            SETTINGS_KEY.providerRegistries,
            JSON.stringify(normalised),
          ),
        );
      }
    }

    await Promise.all(updates);

    // Return the updated effective configuration
    const [moduleEnabled, providerEnabled, moduleRegs, providerRegs] =
      await Promise.all([
        isModuleProxyEnabled(),
        isProviderProxyEnabled(),
        resolveModuleRegistries(),
        resolveProviderRegistries(),
      ]);

    return jsonResponse({
      module_proxy_enabled: moduleEnabled,
      provider_proxy_enabled: providerEnabled,
      module_upstream_registries: moduleRegs,
      provider_upstream_registries: providerRegs,
    });
  } catch (error) {
    console.error("Error updating proxy settings:", error);
    return internalError();
  }
}

// ============================================================================
// Helpers
// ============================================================================

function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
