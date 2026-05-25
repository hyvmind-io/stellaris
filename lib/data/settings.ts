import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { systemSettings } from "@/db/schema";
import { isCfAccessEnabled } from "@/lib/auth/cf-access-config";

// ============================================================================
// Constants
// ============================================================================

export const SIGNUP_ENABLED_KEY = "signup_enabled";

// Upstream proxy — controls whether the registry proxies requests to upstream
// registries when a module/provider is not found locally.
/** @deprecated Prefer SETTINGS_KEY.moduleProxyEnabled in lib/upstream/config.ts. */
export const MODULE_UPSTREAM_PROXY_ENABLED_KEY =
  "module_upstream_proxy_enabled";
/** @deprecated Prefer SETTINGS_KEY.providerProxyEnabled in lib/upstream/config.ts. */
export const PROVIDER_UPSTREAM_PROXY_ENABLED_KEY =
  "provider_upstream_proxy_enabled";

// Upstream registry lists — JSON arrays of registry base URLs.
// Stored as JSON strings internally; the data layer exposes typed accessors.
/** @deprecated Prefer SETTINGS_KEY.moduleRegistries in lib/upstream/config.ts. */
export const MODULE_UPSTREAM_REGISTRIES_KEY = "module_upstream_registries";
/** @deprecated Prefer SETTINGS_KEY.providerRegistries in lib/upstream/config.ts. */
export const PROVIDER_UPSTREAM_REGISTRIES_KEY = "provider_upstream_registries";

// ============================================================================
// Signup Settings
// ============================================================================

/**
 * Check if public signup is enabled.
 * Defaults to true if the key is not set in the DB (safe default: open registry).
 */
export async function isSignupEnabled(): Promise<boolean> {
  // CF Access deployments force-disable local signup regardless of DB state:
  // identities are provisioned via verified Access JWTs only.
  if (isCfAccessEnabled()) return false;

  try {
    const db = getDb();
    const setting = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, SIGNUP_ENABLED_KEY))
      .get();

    if (!setting) return true; // default open
    return setting.value === "true";
  } catch (error) {
    console.error(
      "[Settings] Failed to read signup status; defaulting to closed",
      {
        key: SIGNUP_ENABLED_KEY,
        failMode: "closed",
        error,
      },
    );
    return false; // fail-closed on DB/read errors
  }
}

/**
 * Enable or disable public signup.
 */
export async function setSignupEnabled(enabled: boolean): Promise<void> {
  const db = getDb();
  await db
    .insert(systemSettings)
    .values({ key: SIGNUP_ENABLED_KEY, value: enabled.toString() })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value: enabled.toString(), updatedAt: new Date() },
    });
}

// ============================================================================
// Generic Settings
// ============================================================================

/**
 * Get a single setting by key. Returns defaultValue if not found.
 */
export async function getSystemSetting(
  key: string,
  defaultValue?: string,
): Promise<string | undefined> {
  const db = getDb();
  const setting = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, key))
    .get();

  return setting?.value ?? defaultValue;
}

/**
 * Set (upsert) a setting.
 */
export async function setSystemSetting(
  key: string,
  value: string,
): Promise<void> {
  const db = getDb();
  await db
    .insert(systemSettings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value, updatedAt: new Date() },
    });
}

/**
 * Delete a setting by key. No-op if the key doesn't exist.
 */
export async function deleteSystemSetting(key: string): Promise<void> {
  const db = getDb();
  await db.delete(systemSettings).where(eq(systemSettings.key, key));
}

// ============================================================================
// Upstream Proxy Settings
// ============================================================================

/**
 * Check if upstream proxying is enabled for modules.
 * Defaults to false (local-only) if the key is not set.
 * @deprecated Prefer isModuleProxyEnabled() from lib/upstream/config.ts.
 */
export async function isModuleUpstreamProxyEnabled(): Promise<boolean> {
  const value = await getSystemSetting(
    MODULE_UPSTREAM_PROXY_ENABLED_KEY,
    "false",
  );
  return value === "true";
}

/**
 * Enable or disable upstream proxying for modules.
 * @deprecated Prefer updateProxySettings() from lib/upstream/config-service.ts.
 */
export async function setModuleUpstreamProxyEnabled(
  enabled: boolean,
): Promise<void> {
  await setSystemSetting(MODULE_UPSTREAM_PROXY_ENABLED_KEY, String(enabled));
}

/**
 * Check if upstream proxying is enabled for providers.
 * Defaults to false (local-only) if the key is not set.
 * @deprecated Prefer isProviderProxyEnabled() from lib/upstream/config.ts.
 */
export async function isProviderUpstreamProxyEnabled(): Promise<boolean> {
  const value = await getSystemSetting(
    PROVIDER_UPSTREAM_PROXY_ENABLED_KEY,
    "false",
  );
  return value === "true";
}

/**
 * Enable or disable upstream proxying for providers.
 * @deprecated Prefer updateProxySettings() from lib/upstream/config-service.ts.
 */
export async function setProviderUpstreamProxyEnabled(
  enabled: boolean,
): Promise<void> {
  await setSystemSetting(PROVIDER_UPSTREAM_PROXY_ENABLED_KEY, String(enabled));
}

// ============================================================================
// Upstream Registry List Settings
// ============================================================================

/**
 * Get the list of upstream module registry URLs.
 * Returns an empty array if not configured.
 *
 * Internally stored as a JSON string (e.g. `["https://registry.terraform.io"]`).
 * The admin UI should convert between multiline text (one URL per line) and
 * this array format when saving/loading.
 * @deprecated Prefer resolveModuleRegistries() from lib/upstream/config.ts.
 */
export async function getModuleUpstreamRegistries(): Promise<string[]> {
  const raw = await getSystemSetting(MODULE_UPSTREAM_REGISTRIES_KEY);
  return parseRegistryList(raw);
}

/**
 * Save the list of upstream module registry URLs.
 * Accepts an array of URL strings; empty array clears the list.
 * @deprecated Prefer updateProxySettings() from lib/upstream/config-service.ts.
 */
export async function setModuleUpstreamRegistries(
  urls: string[],
): Promise<void> {
  await setSystemSetting(MODULE_UPSTREAM_REGISTRIES_KEY, JSON.stringify(urls));
}

/**
 * Get the list of upstream provider registry URLs.
 * Returns an empty array if not configured.
 * @deprecated Prefer resolveProviderRegistries() from lib/upstream/config.ts.
 */
export async function getProviderUpstreamRegistries(): Promise<string[]> {
  const raw = await getSystemSetting(PROVIDER_UPSTREAM_REGISTRIES_KEY);
  return parseRegistryList(raw);
}

/**
 * Save the list of upstream provider registry URLs.
 * Accepts an array of URL strings; empty array clears the list.
 * @deprecated Prefer updateProxySettings() from lib/upstream/config-service.ts.
 */
export async function setProviderUpstreamRegistries(
  urls: string[],
): Promise<void> {
  await setSystemSetting(
    PROVIDER_UPSTREAM_REGISTRIES_KEY,
    JSON.stringify(urls),
  );
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Parse a raw JSON string into a string array.
 * Returns an empty array on missing/invalid data for resilience.
 */
function parseRegistryList(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === "string")) {
      return parsed as string[];
    }
    return [];
  } catch {
    return [];
  }
}
