import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { systemSettings } from "@/db/schema";

// ============================================================================
// Constants
// ============================================================================

export const SIGNUP_ENABLED_KEY = "signup_enabled";

// Upstream proxy — controls whether the registry proxies requests to upstream
// registries when a module/provider is not found locally.
export const MODULE_UPSTREAM_PROXY_ENABLED_KEY =
  "module_upstream_proxy_enabled";
export const PROVIDER_UPSTREAM_PROXY_ENABLED_KEY =
  "provider_upstream_proxy_enabled";

// Upstream registry lists — JSON arrays of registry base URLs.
// Stored as JSON strings internally; the data layer exposes typed accessors.
export const MODULE_UPSTREAM_REGISTRIES_KEY = "module_upstream_registries";
export const PROVIDER_UPSTREAM_REGISTRIES_KEY = "provider_upstream_registries";

// ============================================================================
// Signup Settings
// ============================================================================

/**
 * Check if public signup is enabled.
 * Defaults to true if the key is not set in the DB (safe default: open registry).
 */
export async function isSignupEnabled(): Promise<boolean> {
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
    console.error("[Settings] Error reading signup status:", error);
    return true; // fail-open: don't block signups on DB error
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

/**
 * Get all settings as a key→value map.
 */
export async function getSystemSettings(): Promise<Record<string, string>> {
  const db = getDb();
  const rows = await db.select().from(systemSettings);

  return rows.reduce<Record<string, string>>((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});
}

// ============================================================================
// Upstream Proxy Settings
// ============================================================================

/**
 * Check if upstream proxying is enabled for modules.
 * Defaults to false (local-only) if the key is not set.
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
 */
export async function setModuleUpstreamProxyEnabled(
  enabled: boolean,
): Promise<void> {
  await setSystemSetting(MODULE_UPSTREAM_PROXY_ENABLED_KEY, String(enabled));
}

/**
 * Check if upstream proxying is enabled for providers.
 * Defaults to false (local-only) if the key is not set.
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
 */
export async function getModuleUpstreamRegistries(): Promise<string[]> {
  const raw = await getSystemSetting(MODULE_UPSTREAM_REGISTRIES_KEY);
  return parseRegistryList(raw);
}

/**
 * Save the list of upstream module registry URLs.
 * Accepts an array of URL strings; empty array clears the list.
 */
export async function setModuleUpstreamRegistries(
  urls: string[],
): Promise<void> {
  await setSystemSetting(MODULE_UPSTREAM_REGISTRIES_KEY, JSON.stringify(urls));
}

/**
 * Get the list of upstream provider registry URLs.
 * Returns an empty array if not configured.
 */
export async function getProviderUpstreamRegistries(): Promise<string[]> {
  const raw = await getSystemSetting(PROVIDER_UPSTREAM_REGISTRIES_KEY);
  return parseRegistryList(raw);
}

/**
 * Save the list of upstream provider registry URLs.
 * Accepts an array of URL strings; empty array clears the list.
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
