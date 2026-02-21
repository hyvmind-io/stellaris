import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks — hoisted before any import of the module under test
// ============================================================================

vi.mock("@/lib/env", () => ({
  env: {
    MODULE_UPSTREAM_PROXY_ENABLED: "false",
    PROVIDER_UPSTREAM_PROXY_ENABLED: "false",
    MODULE_UPSTREAM_REGISTRIES: undefined,
    PROVIDER_UPSTREAM_REGISTRIES: undefined,
  },
}));

const mockGetSystemSetting = vi.fn();
vi.mock("@/lib/data/settings", () => ({
  getSystemSetting: (...args: unknown[]) => mockGetSystemSetting(...args),
}));

import {
  parseUpstreamRegistries,
  normaliseRegistryUrl,
  DEFAULT_UPSTREAM_REGISTRIES,
  resolveModuleRegistries,
  resolveProviderRegistries,
  isModuleProxyEnabled,
  isProviderProxyEnabled,
  SETTINGS_KEY,
} from "@/lib/upstream/config";
import { env } from "@/lib/env";

// ============================================================================
// parseUpstreamRegistries
// ============================================================================

describe("parseUpstreamRegistries", () => {
  it("parses comma-separated URLs", () => {
    const result = parseUpstreamRegistries(
      "https://registry.opentofu.org, https://registry.terraform.io",
    );
    expect(result).toEqual([
      "https://registry.opentofu.org",
      "https://registry.terraform.io",
    ]);
  });

  it("parses newline-separated URLs", () => {
    const result = parseUpstreamRegistries(
      "https://registry.opentofu.org\nhttps://registry.terraform.io",
    );
    expect(result).toEqual([
      "https://registry.opentofu.org",
      "https://registry.terraform.io",
    ]);
  });

  it("parses mixed comma and newline separated URLs", () => {
    const result = parseUpstreamRegistries(
      "https://a.example.com,\nhttps://b.example.com\nhttps://c.example.com",
    );
    expect(result).toEqual([
      "https://a.example.com",
      "https://b.example.com",
      "https://c.example.com",
    ]);
  });

  it("strips trailing slashes", () => {
    const result = parseUpstreamRegistries("https://example.com///");
    expect(result).toEqual(["https://example.com"]);
  });

  it("returns empty array for blank input", () => {
    expect(parseUpstreamRegistries("")).toEqual([]);
    expect(parseUpstreamRegistries("   ")).toEqual([]);
  });

  it("deduplicates URLs (preserving order)", () => {
    const result = parseUpstreamRegistries(
      "https://a.example.com, https://b.example.com, https://a.example.com",
    );
    expect(result).toEqual(["https://a.example.com", "https://b.example.com"]);
  });

  it("skips invalid URLs", () => {
    const result = parseUpstreamRegistries(
      "https://valid.example.com, not-a-url, ftp://invalid.protocol.com",
    );
    expect(result).toEqual(["https://valid.example.com"]);
  });

  it("handles URLs with paths", () => {
    const result = parseUpstreamRegistries("https://example.com/registry/v1/");
    expect(result).toEqual(["https://example.com/registry/v1"]);
  });
});

// ============================================================================
// normaliseRegistryUrl
// ============================================================================

describe("normaliseRegistryUrl", () => {
  it("accepts valid HTTPS URL", () => {
    expect(normaliseRegistryUrl("https://registry.opentofu.org")).toBe(
      "https://registry.opentofu.org",
    );
  });

  it("accepts valid HTTP URL (dev)", () => {
    expect(normaliseRegistryUrl("http://localhost:3000")).toBe(
      "http://localhost:3000",
    );
  });

  it("strips trailing slashes", () => {
    expect(normaliseRegistryUrl("https://example.com/")).toBe(
      "https://example.com",
    );
  });

  it("returns null for empty string", () => {
    expect(normaliseRegistryUrl("")).toBeNull();
  });

  it("returns null for whitespace", () => {
    expect(normaliseRegistryUrl("   ")).toBeNull();
  });

  it("returns null for invalid URL", () => {
    expect(normaliseRegistryUrl("not-a-url")).toBeNull();
  });

  it("returns null for non-HTTP(S) protocol", () => {
    expect(normaliseRegistryUrl("ftp://files.example.com")).toBeNull();
  });

  it("trims whitespace", () => {
    expect(normaliseRegistryUrl("  https://example.com  ")).toBe(
      "https://example.com",
    );
  });
});

// ============================================================================
// DEFAULT_UPSTREAM_REGISTRIES
// ============================================================================

describe("DEFAULT_UPSTREAM_REGISTRIES", () => {
  it("contains OpenTofu registry first", () => {
    expect(DEFAULT_UPSTREAM_REGISTRIES[0]).toBe(
      "https://registry.opentofu.org",
    );
  });

  it("contains HashiCorp registry second", () => {
    expect(DEFAULT_UPSTREAM_REGISTRIES[1]).toBe(
      "https://registry.terraform.io",
    );
  });

  it("has exactly 2 entries", () => {
    expect(DEFAULT_UPSTREAM_REGISTRIES).toHaveLength(2);
  });
});

// ============================================================================
// resolveModuleRegistries
// ============================================================================

describe("resolveModuleRegistries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset env to defaults
    (env as Record<string, unknown>).MODULE_UPSTREAM_REGISTRIES = undefined;
  });

  it("returns built-in defaults when no DB or env override", async () => {
    mockGetSystemSetting.mockResolvedValue(undefined);

    const result = await resolveModuleRegistries();
    expect(result).toEqual([...DEFAULT_UPSTREAM_REGISTRIES]);
  });

  it("uses env override over built-in defaults", async () => {
    mockGetSystemSetting.mockResolvedValue(undefined);
    (env as Record<string, unknown>).MODULE_UPSTREAM_REGISTRIES =
      "https://custom.example.com";

    const result = await resolveModuleRegistries();
    expect(result).toEqual(["https://custom.example.com"]);
  });

  it("uses DB override over env", async () => {
    (env as Record<string, unknown>).MODULE_UPSTREAM_REGISTRIES =
      "https://env.example.com";
    mockGetSystemSetting.mockResolvedValue(
      JSON.stringify(["https://db.example.com"]),
    );

    const result = await resolveModuleRegistries();
    expect(result).toEqual(["https://db.example.com"]);
  });

  it("returns empty array when DB override is explicit empty array", async () => {
    mockGetSystemSetting.mockResolvedValue("[]");

    const result = await resolveModuleRegistries();
    expect(result).toEqual([]);
  });

  it("returns empty array when env override is explicit empty string", async () => {
    mockGetSystemSetting.mockResolvedValue(undefined);
    (env as Record<string, unknown>).MODULE_UPSTREAM_REGISTRIES = "";

    const result = await resolveModuleRegistries();
    expect(result).toEqual([]);
  });

  it("falls through to env when DB value is malformed JSON", async () => {
    mockGetSystemSetting.mockResolvedValue("not-json");
    (env as Record<string, unknown>).MODULE_UPSTREAM_REGISTRIES =
      "https://fallback.example.com";

    const result = await resolveModuleRegistries();
    expect(result).toEqual(["https://fallback.example.com"]);
  });
});

// ============================================================================
// resolveProviderRegistries
// ============================================================================

describe("resolveProviderRegistries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (env as Record<string, unknown>).PROVIDER_UPSTREAM_REGISTRIES = undefined;
  });

  it("returns built-in defaults when no override", async () => {
    mockGetSystemSetting.mockResolvedValue(undefined);

    const result = await resolveProviderRegistries();
    expect(result).toEqual([...DEFAULT_UPSTREAM_REGISTRIES]);
  });
});

// ============================================================================
// isModuleProxyEnabled
// ============================================================================

describe("isModuleProxyEnabled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (env as Record<string, unknown>).MODULE_UPSTREAM_PROXY_ENABLED = "false";
  });

  it("returns false by default", async () => {
    mockGetSystemSetting.mockResolvedValue(undefined);

    const result = await isModuleProxyEnabled();
    expect(result).toBe(false);
  });

  it("returns true when env is 'true'", async () => {
    mockGetSystemSetting.mockResolvedValue(undefined);
    (env as Record<string, unknown>).MODULE_UPSTREAM_PROXY_ENABLED = "true";

    const result = await isModuleProxyEnabled();
    expect(result).toBe(true);
  });

  it("DB override takes precedence over env", async () => {
    (env as Record<string, unknown>).MODULE_UPSTREAM_PROXY_ENABLED = "false";
    mockGetSystemSetting.mockResolvedValue("true");

    const result = await isModuleProxyEnabled();
    expect(result).toBe(true);
  });
});

// ============================================================================
// isProviderProxyEnabled
// ============================================================================

describe("isProviderProxyEnabled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (env as Record<string, unknown>).PROVIDER_UPSTREAM_PROXY_ENABLED = "false";
  });

  it("returns false by default", async () => {
    mockGetSystemSetting.mockResolvedValue(undefined);

    const result = await isProviderProxyEnabled();
    expect(result).toBe(false);
  });

  it("returns true when DB override is 'true'", async () => {
    mockGetSystemSetting.mockResolvedValue("true");

    const result = await isProviderProxyEnabled();
    expect(result).toBe(true);
  });
});

// ============================================================================
// SETTINGS_KEY constants
// ============================================================================

describe("SETTINGS_KEY", () => {
  it("has expected keys", () => {
    expect(SETTINGS_KEY.moduleProxyEnabled).toBe(
      "module_upstream_proxy_enabled",
    );
    expect(SETTINGS_KEY.providerProxyEnabled).toBe(
      "provider_upstream_proxy_enabled",
    );
    expect(SETTINGS_KEY.moduleRegistries).toBe("module_upstream_registries");
    expect(SETTINGS_KEY.providerRegistries).toBe(
      "provider_upstream_registries",
    );
  });
});
