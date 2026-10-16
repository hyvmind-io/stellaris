/** Shared between next.config.ts (dev bindings), the seed script, and Playwright. */
export const E2E_PORT = 3100;
export const E2E_WRANGLER_CONFIG = "e2e/wrangler.e2e.jsonc";
/** wrangler CLI `--persist-to` root; getPlatformProxy reads `${dir}/v3`. */
export const E2E_PERSIST_DIR = ".wrangler/e2e";
export const E2E_AUTH_STATE = ".wrangler/e2e/auth-state.json";

export const E2E_USER = {
  email: "e2e-admin@example.com",
  username: "e2e-admin",
  password: "e2e-password-not-secret",
} as const;

/** Plaintext keys seeded into `api_keys`; local test DB only. */
export const E2E_API_KEYS = {
  admin: { key: `stlr_${"a0".repeat(20)}`, permissions: ["admin"] },
  modulesWrite: { key: `stlr_${"b1".repeat(20)}`, permissions: ["modules:read", "modules:write"] },
  providersWrite: { key: `stlr_${"c2".repeat(20)}`, permissions: ["providers:read", "providers:write"] },
  readOnly: { key: `stlr_${"d3".repeat(20)}`, permissions: ["modules:read", "providers:read"] },
} as const;
