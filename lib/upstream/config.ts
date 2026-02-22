/**
 * Upstream registry configuration — resolves the ordered list of upstream
 * base URLs for module and provider fallback proxying.
 *
 * Precedence (highest → lowest):
 *   1. DB system_settings override (explicit empty list = no upstream)
 *   2. Environment variable override
 *   3. Built-in defaults (OpenTofu then HashiCorp)
 *
 * All URLs are normalised (trailing slashes stripped, validated as HTTPS URLs).
 */

import { env } from "@/lib/env";
import { getSystemSetting } from "@/lib/data/settings";

// ============================================================================
// Constants
// ============================================================================

/** Built-in defaults — tried in order when no override is configured. */
export const DEFAULT_UPSTREAM_REGISTRIES = [
  "https://registry.opentofu.org",
  "https://registry.terraform.io",
] as const;

/** System-settings keys for DB overrides. */
export const SETTINGS_KEY = {
  moduleProxyEnabled: "module_upstream_proxy_enabled",
  providerProxyEnabled: "provider_upstream_proxy_enabled",
  moduleRegistries: "module_upstream_registries",
  providerRegistries: "provider_upstream_registries",
} as const;

// ============================================================================
// URL Parsing / Validation
// ============================================================================

/**
 * Parse a raw string that may contain multiple upstream URLs separated by
 * commas, newlines, or both. Each URL is trimmed and normalised:
 *  - Trailing slashes stripped
 *  - Must be a valid URL with https: protocol
 *  - Duplicates removed (preserving first occurrence)
 *
 * Returns an array of normalised base URLs, or an empty array when the input
 * is blank / contains no valid entries.
 */
export function parseUpstreamRegistries(raw: string): string[] {
  if (!raw.trim()) return [];

  const seen = new Set<string>();
  const result: string[] = [];

  const tokens = raw
    .split(/[,\n]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  for (const token of tokens) {
    const normalised = normaliseRegistryUrl(token);
    if (normalised && !seen.has(normalised)) {
      seen.add(normalised);
      result.push(normalised);
    }
  }

  return result;
}

/**
 * Normalise and validate a single registry base URL.
 * Returns the normalised URL or `null` if invalid.
 */
export function normaliseRegistryUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:") return null;
    // Strip trailing slash(es) from origin+pathname
    return (url.origin + url.pathname).replace(/\/+$/, "");
  } catch {
    return null;
  }
}

// ============================================================================
// Resolution — Determine Final Upstream Registries
// ============================================================================

/**
 * Resolve the upstream registries list for modules.
 *
 * Precedence:
 *   1. DB setting `module_upstream_registries` (JSON array of strings)
 *      - `null`/missing override: fall through to env/defaults
 *      - explicit `"[]"`: no upstream, deliberately empty
 *      - non-empty array: explicit ordered list
 *   2. Env var `MODULE_UPSTREAM_REGISTRIES`
 *   3. Built-in defaults
 */
export async function resolveModuleRegistries(): Promise<string[]> {
  return resolveRegistries(
    SETTINGS_KEY.moduleRegistries,
    env.MODULE_UPSTREAM_REGISTRIES,
  );
}

/**
 * Resolve the upstream registries list for providers.
 */
export async function resolveProviderRegistries(): Promise<string[]> {
  return resolveRegistries(
    SETTINGS_KEY.providerRegistries,
    env.PROVIDER_UPSTREAM_REGISTRIES,
  );
}

/**
 * Check whether module upstream proxy is enabled.
 * DB setting overrides env.
 */
export async function isModuleProxyEnabled(): Promise<boolean> {
  const dbValue = await getSystemSetting(SETTINGS_KEY.moduleProxyEnabled);
  if (dbValue !== undefined) return dbValue === "true";
  return env.MODULE_UPSTREAM_PROXY_ENABLED === "true";
}

/**
 * Check whether provider upstream proxy is enabled.
 * DB setting overrides env.
 */
export async function isProviderProxyEnabled(): Promise<boolean> {
  const dbValue = await getSystemSetting(SETTINGS_KEY.providerProxyEnabled);
  if (dbValue !== undefined) return dbValue === "true";
  return env.PROVIDER_UPSTREAM_PROXY_ENABLED === "true";
}

// ============================================================================
// Internal
// ============================================================================

async function resolveRegistries(
  dbKey: string,
  envValue: string | undefined,
): Promise<string[]> {
  // 1. DB override
  const dbValue = await getSystemSetting(dbKey);
  if (dbValue !== undefined) {
    // DB value is stored as a JSON array
    try {
      const parsed = JSON.parse(dbValue);
      if (Array.isArray(parsed)) {
        // Explicit empty array = deliberately no upstream
        if (parsed.length === 0) return [];
        return parsed
          .map((u: unknown) =>
            typeof u === "string" ? normaliseRegistryUrl(u) : null,
          )
          .filter((u): u is string => u !== null);
      }
    } catch {
      // Malformed JSON — fall through to env/defaults
    }
  }

  // 2. Env override
  if (envValue !== undefined) {
    // Explicit empty string = deliberately no upstream
    if (envValue.trim() === "") return [];
    return parseUpstreamRegistries(envValue);
  }

  // 3. Built-in defaults
  return [...DEFAULT_UPSTREAM_REGISTRIES];
}
