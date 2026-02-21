import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks — hoisted before any import of the module under test
// ============================================================================

// Core mock primitives — declared up-front so beforeEach can reset them
const mockGet = vi.fn();
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockOnConflictDoUpdate = vi.fn();

vi.mock("@/db/client", () => ({
  getDb: () => ({
    select: mockSelect,
    insert: mockInsert,
  }),
}));

vi.mock("@/db/schema", () => ({
  systemSettings: {
    key: "key",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a, b) => ({ column: a, value: b })),
}));

import {
  isSignupEnabled,
  isModuleUpstreamProxyEnabled,
  isProviderUpstreamProxyEnabled,
  getModuleUpstreamRegistries,
  getProviderUpstreamRegistries,
  setModuleUpstreamProxyEnabled,
  setProviderUpstreamProxyEnabled,
  setModuleUpstreamRegistries,
  setProviderUpstreamRegistries,
  SIGNUP_ENABLED_KEY,
  MODULE_UPSTREAM_PROXY_ENABLED_KEY,
  PROVIDER_UPSTREAM_PROXY_ENABLED_KEY,
  MODULE_UPSTREAM_REGISTRIES_KEY,
  PROVIDER_UPSTREAM_REGISTRIES_KEY,
} from "@/lib/data/settings";

// ============================================================================
// Helpers — rebuild the Drizzle fluent-query chains
// ============================================================================

/**
 * Rebuilds the select().from().where().get() chain for each test so that
 * individual `mockGet` implementations don't bleed across tests.
 */
function setupSelectChain() {
  const mockWhere = vi.fn(() => ({ get: mockGet }));
  const mockFrom = vi.fn(() => ({ where: mockWhere }));
  mockSelect.mockReturnValue({ from: mockFrom });
}

/**
 * Rebuilds the insert().values().onConflictDoUpdate() chain for write tests.
 */
function setupInsertChain() {
  mockOnConflictDoUpdate.mockResolvedValue(undefined);
  const mockValues = vi.fn(() => ({
    onConflictDoUpdate: mockOnConflictDoUpdate,
  }));
  mockInsert.mockReturnValue({ values: mockValues });
}

// ============================================================================
// isSignupEnabled
// ============================================================================

describe("isSignupEnabled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockReset();
    setupSelectChain();
  });

  it("returns true when no DB record exists (default)", async () => {
    mockGet.mockResolvedValue(undefined);

    const result = await isSignupEnabled();

    expect(result).toBe(true);
  });

  it("returns true when value is 'true'", async () => {
    mockGet.mockResolvedValue({ key: SIGNUP_ENABLED_KEY, value: "true" });

    const result = await isSignupEnabled();

    expect(result).toBe(true);
  });

  it("returns false when value is 'false'", async () => {
    mockGet.mockResolvedValue({ key: SIGNUP_ENABLED_KEY, value: "false" });

    const result = await isSignupEnabled();

    expect(result).toBe(false);
  });

  it("fails open (returns true) on DB error", async () => {
    mockGet.mockRejectedValue(new Error("D1_ERROR: connection timeout"));

    const result = await isSignupEnabled();

    expect(result).toBe(true);
  });
});

// ============================================================================
// Setting Key Constants
// ============================================================================

describe("Setting key constants", () => {
  it("SIGNUP_ENABLED_KEY is 'signup_enabled'", () => {
    expect(SIGNUP_ENABLED_KEY).toBe("signup_enabled");
  });

  it("MODULE_UPSTREAM_PROXY_ENABLED_KEY is correct", () => {
    expect(MODULE_UPSTREAM_PROXY_ENABLED_KEY).toBe(
      "module_upstream_proxy_enabled",
    );
  });

  it("PROVIDER_UPSTREAM_PROXY_ENABLED_KEY is correct", () => {
    expect(PROVIDER_UPSTREAM_PROXY_ENABLED_KEY).toBe(
      "provider_upstream_proxy_enabled",
    );
  });

  it("MODULE_UPSTREAM_REGISTRIES_KEY is correct", () => {
    expect(MODULE_UPSTREAM_REGISTRIES_KEY).toBe("module_upstream_registries");
  });

  it("PROVIDER_UPSTREAM_REGISTRIES_KEY is correct", () => {
    expect(PROVIDER_UPSTREAM_REGISTRIES_KEY).toBe(
      "provider_upstream_registries",
    );
  });
});

// ============================================================================
// isModuleUpstreamProxyEnabled
// ============================================================================

describe("isModuleUpstreamProxyEnabled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockReset();
    setupSelectChain();
  });

  it("returns false when no DB record exists (default closed)", async () => {
    mockGet.mockResolvedValue(undefined);

    const result = await isModuleUpstreamProxyEnabled();

    expect(result).toBe(false);
  });

  it("returns true when value is 'true'", async () => {
    mockGet.mockResolvedValue({
      key: MODULE_UPSTREAM_PROXY_ENABLED_KEY,
      value: "true",
    });

    const result = await isModuleUpstreamProxyEnabled();

    expect(result).toBe(true);
  });

  it("returns false when value is 'false'", async () => {
    mockGet.mockResolvedValue({
      key: MODULE_UPSTREAM_PROXY_ENABLED_KEY,
      value: "false",
    });

    const result = await isModuleUpstreamProxyEnabled();

    expect(result).toBe(false);
  });
});

// ============================================================================
// isProviderUpstreamProxyEnabled
// ============================================================================

describe("isProviderUpstreamProxyEnabled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockReset();
    setupSelectChain();
  });

  it("returns false when no DB record exists (default closed)", async () => {
    mockGet.mockResolvedValue(undefined);

    const result = await isProviderUpstreamProxyEnabled();

    expect(result).toBe(false);
  });

  it("returns true when value is 'true'", async () => {
    mockGet.mockResolvedValue({
      key: PROVIDER_UPSTREAM_PROXY_ENABLED_KEY,
      value: "true",
    });

    const result = await isProviderUpstreamProxyEnabled();

    expect(result).toBe(true);
  });
});

// ============================================================================
// setModuleUpstreamProxyEnabled / setProviderUpstreamProxyEnabled
// ============================================================================

describe("setModuleUpstreamProxyEnabled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupInsertChain();
  });

  it("calls setSystemSetting with 'true'", async () => {
    await setModuleUpstreamProxyEnabled(true);

    expect(mockInsert).toHaveBeenCalled();
    expect(mockOnConflictDoUpdate).toHaveBeenCalled();
  });

  it("calls setSystemSetting with 'false'", async () => {
    await setModuleUpstreamProxyEnabled(false);

    expect(mockInsert).toHaveBeenCalled();
  });
});

describe("setProviderUpstreamProxyEnabled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupInsertChain();
  });

  it("calls setSystemSetting with 'true'", async () => {
    await setProviderUpstreamProxyEnabled(true);

    expect(mockInsert).toHaveBeenCalled();
    expect(mockOnConflictDoUpdate).toHaveBeenCalled();
  });
});

// ============================================================================
// getModuleUpstreamRegistries
// ============================================================================

describe("getModuleUpstreamRegistries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockReset();
    setupSelectChain();
  });

  it("returns empty array when no DB record exists", async () => {
    mockGet.mockResolvedValue(undefined);

    const result = await getModuleUpstreamRegistries();

    expect(result).toEqual([]);
  });

  it("parses a valid JSON array of URLs", async () => {
    const urls = ["https://registry.terraform.io", "https://my-mirror.corp"];
    mockGet.mockResolvedValue({
      key: MODULE_UPSTREAM_REGISTRIES_KEY,
      value: JSON.stringify(urls),
    });

    const result = await getModuleUpstreamRegistries();

    expect(result).toEqual(urls);
  });

  it("returns empty array for invalid JSON", async () => {
    mockGet.mockResolvedValue({
      key: MODULE_UPSTREAM_REGISTRIES_KEY,
      value: "not-valid-json",
    });

    const result = await getModuleUpstreamRegistries();

    expect(result).toEqual([]);
  });

  it("returns empty array for non-array JSON", async () => {
    mockGet.mockResolvedValue({
      key: MODULE_UPSTREAM_REGISTRIES_KEY,
      value: JSON.stringify({ url: "https://example.com" }),
    });

    const result = await getModuleUpstreamRegistries();

    expect(result).toEqual([]);
  });

  it("returns empty array for array with non-string elements", async () => {
    mockGet.mockResolvedValue({
      key: MODULE_UPSTREAM_REGISTRIES_KEY,
      value: JSON.stringify([1, 2, 3]),
    });

    const result = await getModuleUpstreamRegistries();

    expect(result).toEqual([]);
  });
});

// ============================================================================
// getProviderUpstreamRegistries
// ============================================================================

describe("getProviderUpstreamRegistries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockReset();
    setupSelectChain();
  });

  it("returns empty array when no DB record exists", async () => {
    mockGet.mockResolvedValue(undefined);

    const result = await getProviderUpstreamRegistries();

    expect(result).toEqual([]);
  });

  it("parses a valid JSON array of URLs", async () => {
    const urls = ["https://registry.terraform.io"];
    mockGet.mockResolvedValue({
      key: PROVIDER_UPSTREAM_REGISTRIES_KEY,
      value: JSON.stringify(urls),
    });

    const result = await getProviderUpstreamRegistries();

    expect(result).toEqual(urls);
  });
});

// ============================================================================
// setModuleUpstreamRegistries / setProviderUpstreamRegistries
// ============================================================================

describe("setModuleUpstreamRegistries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupInsertChain();
  });

  it("persists registry URLs as JSON array", async () => {
    const urls = ["https://registry.terraform.io", "https://mirror.corp"];
    await setModuleUpstreamRegistries(urls);

    expect(mockInsert).toHaveBeenCalled();
    expect(mockOnConflictDoUpdate).toHaveBeenCalled();
  });

  it("persists empty array", async () => {
    await setModuleUpstreamRegistries([]);

    expect(mockInsert).toHaveBeenCalled();
  });
});

describe("setProviderUpstreamRegistries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupInsertChain();
  });

  it("persists registry URLs as JSON array", async () => {
    const urls = ["https://registry.terraform.io"];
    await setProviderUpstreamRegistries(urls);

    expect(mockInsert).toHaveBeenCalled();
    expect(mockOnConflictDoUpdate).toHaveBeenCalled();
  });
});
