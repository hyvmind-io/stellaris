import { parseEnv } from "@/lib/env";

/**
 * Registry host for Terraform `source` addresses — hostname (with port if
 * present), no scheme, no trailing slash. Terraform/OpenTofu addresses are of
 * the form `<host>/<namespace>/<name>[/<system>]`, so the scheme must be
 * stripped.
 *
 * Derived from NEXT_PUBLIC_APP_URL at call time (not the memoized `env`):
 * `wrangler.jsonc` `vars` are injected into `process.env` only at server
 * runtime, mirroring how lib/branding.ts re-reads the environment.
 *
 * Falls back to a best-effort string strip when the value is not a valid URL.
 */
export function getRegistryHost(): string {
  const value = parseEnv().NEXT_PUBLIC_APP_URL;
  try {
    return new URL(value).host;
  } catch {
    return value.replace(/^[a-z]+:\/\//i, "").replace(/\/+$/, "");
  }
}
