import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { systemSettings } from "@/db/schema";
import { isCfAccessEnabled } from "@/lib/auth/cf-access-config";

// ============================================================================
// Constants
// ============================================================================

export const SIGNUP_ENABLED_KEY = "signup_enabled";

// Immutable uploads — controls whether published artifact bytes can be
// overwritten. When ON, replacing existing bytes returns 409; initial publish
// to an empty slot is always allowed. Default ON (fail-closed: immutability is
// the safe default for a registry serving signed artifacts).
export const IMMUTABLE_UPLOADS_KEY = "immutable_uploads";

// Custom theming (PRD-02). `default_theme` is the deployment-wide default theme
// name (a manifest theme; "default" is the built-in Dracula/Alucard fallback).
// `allow_user_theme_override` gates per-user theme selection (default "true").
export const DEFAULT_THEME_KEY = "default_theme";
export const ALLOW_USER_THEME_OVERRIDE_KEY = "allow_user_theme_override";

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
// Immutable Uploads Settings
// ============================================================================

/**
 * Check if immutable uploads are enabled.
 *
 * When enabled, overwriting bytes for an already-published artifact slot
 * (provider platform / module version) is rejected with 409. Initial publish
 * to an empty slot is always allowed regardless of this setting.
 *
 * Defaults to true when the key is not set (fail-closed: immutability is the
 * safe default). Also fails closed (true) on DB/read errors.
 */
export async function isImmutableUploadsEnabled(): Promise<boolean> {
  try {
    const db = getDb();
    const setting = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, IMMUTABLE_UPLOADS_KEY))
      .get();

    if (!setting) return true; // default immutable
    return setting.value === "true";
  } catch (error) {
    console.error(
      "[Settings] Failed to read immutable uploads status; defaulting to immutable",
      {
        key: IMMUTABLE_UPLOADS_KEY,
        failMode: "immutable",
        error,
      },
    );
    return true; // fail-closed on DB/read errors
  }
}

/**
 * Enable or disable immutable uploads.
 */
export async function setImmutableUploads(enabled: boolean): Promise<void> {
  const db = getDb();
  await db
    .insert(systemSettings)
    .values({ key: IMMUTABLE_UPLOADS_KEY, value: enabled.toString() })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value: enabled.toString(), updatedAt: new Date() },
    });
}

// ============================================================================
// Theming Settings (PRD-02)
// ============================================================================

/**
 * Get the deployment-wide default theme name.
 *
 * Returns "default" (the built-in Dracula/Alucard scheme) when the key is unset
 * or on DB/read error — a safe fallback that always exists in the manifest.
 */
export async function getDefaultTheme(): Promise<string> {
  try {
    const db = getDb();
    const setting = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, DEFAULT_THEME_KEY))
      .get();

    return setting?.value ?? "default";
  } catch (error) {
    console.error(
      "[Settings] Failed to read default theme; falling back to built-in default",
      {
        key: DEFAULT_THEME_KEY,
        failMode: "default",
        error,
      },
    );
    return "default";
  }
}

/**
 * Set the deployment-wide default theme name. Callers should validate the value
 * against the compiled manifest before persisting (the server action does so).
 */
export async function setDefaultTheme(theme: string): Promise<void> {
  const db = getDb();
  await db
    .insert(systemSettings)
    .values({ key: DEFAULT_THEME_KEY, value: theme })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value: theme, updatedAt: new Date() },
    });
}

/**
 * Check whether per-user theme override is allowed.
 *
 * Defaults to true when the key is unset (open: users may pick a theme). Fails
 * OPEN (true) on read error to match the documented default; the resolver still
 * validates any chosen theme against the manifest before applying it.
 */
export async function isThemeOverrideAllowed(): Promise<boolean> {
  try {
    const db = getDb();
    const setting = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, ALLOW_USER_THEME_OVERRIDE_KEY))
      .get();

    if (!setting) return true; // default: override allowed
    return setting.value === "true";
  } catch (error) {
    console.error(
      "[Settings] Failed to read theme override setting; defaulting to allowed",
      {
        key: ALLOW_USER_THEME_OVERRIDE_KEY,
        failMode: "allowed",
        error,
      },
    );
    return true;
  }
}

/**
 * Enable or disable per-user theme override.
 */
export async function setThemeOverrideAllowed(allowed: boolean): Promise<void> {
  const db = getDb();
  await db
    .insert(systemSettings)
    .values({
      key: ALLOW_USER_THEME_OVERRIDE_KEY,
      value: allowed.toString(),
    })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value: allowed.toString(), updatedAt: new Date() },
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
