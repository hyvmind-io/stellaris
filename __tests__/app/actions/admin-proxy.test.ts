import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks — hoisted before any import of the module under test
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;

// --- Auth ---
const mockGetAuth = vi.fn<AnyFn>();

vi.mock("@/lib/auth/get-auth", () => ({
  getAuth: () => mockGetAuth(),
}));

// --- Data layer: settings ---
const mockSetSystemSetting = vi.fn<AnyFn>();
const mockDeleteSystemSetting = vi.fn<AnyFn>();

vi.mock("@/lib/data/settings", () => ({
  isSignupEnabled: vi.fn(),
  setSignupEnabled: vi.fn(),
  setSystemSetting: (...args: unknown[]) => mockSetSystemSetting(...args),
  deleteSystemSetting: (...args: unknown[]) => mockDeleteSystemSetting(...args),
}));

// --- Upstream config ---
const mockIsModuleProxyEnabled = vi.fn<AnyFn>();
const mockIsProviderProxyEnabled = vi.fn<AnyFn>();
const mockResolveModuleRegistries = vi.fn<AnyFn>();
const mockResolveProviderRegistries = vi.fn<AnyFn>();
const mockNormaliseRegistryUrl = vi.fn<AnyFn>();

vi.mock("@/lib/upstream/config", () => ({
  SETTINGS_KEY: {
    moduleProxyEnabled: "module_upstream_proxy_enabled",
    providerProxyEnabled: "provider_upstream_proxy_enabled",
    moduleRegistries: "module_upstream_registries",
    providerRegistries: "provider_upstream_registries",
  },
  isModuleProxyEnabled: () => mockIsModuleProxyEnabled(),
  isProviderProxyEnabled: () => mockIsProviderProxyEnabled(),
  resolveModuleRegistries: () => mockResolveModuleRegistries(),
  resolveProviderRegistries: () => mockResolveProviderRegistries(),
  normaliseRegistryUrl: (url: string) => mockNormaliseRegistryUrl(url),
}));

// --- Unused mocks needed to satisfy other imports in admin.ts ---
vi.mock("@/lib/data/users", () => ({
  getAllUsers: vi.fn(),
  getUserById: vi.fn(),
  updateUserRole: vi.fn(),
  getAdminCount: vi.fn(),
  getUserByEmail: vi.fn(),
  getUserByUsername: vi.fn(),
  createUser: vi.fn(),
  deleteUser: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  deleteAllUserSessionsFromDb: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  getDb: vi.fn(() => ({ select: vi.fn() })),
}));

vi.mock("@/db/schema", () => ({
  apiKeys: { userId: "userId" },
  sessions: { userId: "userId" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  count: vi.fn(),
}));

import {
  getProxySettingsAction,
  updateProxySettingsAction,
} from "@/app/actions/admin";

// ============================================================================
// Shared fixtures
// ============================================================================

const adminAuth = {
  user: {
    id: 1,
    email: "admin@example.com",
    username: "admin",
    role: "admin" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  sessionId: "session-admin",
};

const userAuth = {
  user: {
    id: 2,
    email: "user@example.com",
    username: "regular",
    role: "user" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  sessionId: "session-user",
};

// ============================================================================
// getProxySettingsAction
// ============================================================================

describe("getProxySettingsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns error when not authenticated", async () => {
    mockGetAuth.mockResolvedValue(null);

    const result = await getProxySettingsAction();

    expect(result).toEqual({ success: false, error: "Not authenticated" });
    expect(mockIsModuleProxyEnabled).not.toHaveBeenCalled();
  });

  it("returns error when not admin", async () => {
    mockGetAuth.mockResolvedValue(userAuth);

    const result = await getProxySettingsAction();

    expect(result).toEqual({ success: false, error: "Admin access required" });
    expect(mockIsModuleProxyEnabled).not.toHaveBeenCalled();
  });

  it("returns proxy settings on happy path", async () => {
    mockGetAuth.mockResolvedValue(adminAuth);
    mockIsModuleProxyEnabled.mockResolvedValue(true);
    mockIsProviderProxyEnabled.mockResolvedValue(false);
    mockResolveModuleRegistries.mockResolvedValue([
      "https://registry.opentofu.org",
      "https://registry.terraform.io",
    ]);
    mockResolveProviderRegistries.mockResolvedValue([
      "https://registry.terraform.io",
    ]);

    const result = await getProxySettingsAction();

    expect(result.success).toBe(true);
    expect(result.settings).toEqual({
      module_proxy_enabled: true,
      provider_proxy_enabled: false,
      module_upstream_registries: [
        "https://registry.opentofu.org",
        "https://registry.terraform.io",
      ],
      provider_upstream_registries: ["https://registry.terraform.io"],
    });
  });

  it("returns empty arrays when no registries configured", async () => {
    mockGetAuth.mockResolvedValue(adminAuth);
    mockIsModuleProxyEnabled.mockResolvedValue(false);
    mockIsProviderProxyEnabled.mockResolvedValue(false);
    mockResolveModuleRegistries.mockResolvedValue([]);
    mockResolveProviderRegistries.mockResolvedValue([]);

    const result = await getProxySettingsAction();

    expect(result.success).toBe(true);
    expect(result.settings?.module_upstream_registries).toEqual([]);
    expect(result.settings?.provider_upstream_registries).toEqual([]);
  });

  it("returns error when data layer throws", async () => {
    mockGetAuth.mockResolvedValue(adminAuth);
    mockIsModuleProxyEnabled.mockRejectedValue(new Error("DB error"));

    const result = await getProxySettingsAction();

    expect(result).toEqual({
      success: false,
      error: "Failed to load proxy settings",
    });
  });
});

// ============================================================================
// updateProxySettingsAction
// ============================================================================

describe("updateProxySettingsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: normaliseRegistryUrl returns the URL as-is
    mockNormaliseRegistryUrl.mockImplementation((url: string) => url);
  });

  // --------------------------------------------------------------------------
  // Auth guard
  // --------------------------------------------------------------------------

  it("returns error when not authenticated", async () => {
    mockGetAuth.mockResolvedValue(null);

    const result = await updateProxySettingsAction({
      module_proxy_enabled: true,
    });

    expect(result).toEqual({ success: false, error: "Not authenticated" });
    expect(mockSetSystemSetting).not.toHaveBeenCalled();
  });

  it("returns error when not admin", async () => {
    mockGetAuth.mockResolvedValue(userAuth);

    const result = await updateProxySettingsAction({
      module_proxy_enabled: true,
    });

    expect(result).toEqual({ success: false, error: "Admin access required" });
    expect(mockSetSystemSetting).not.toHaveBeenCalled();
  });

  // --------------------------------------------------------------------------
  // Toggle updates
  // --------------------------------------------------------------------------

  it("updates module proxy enabled flag", async () => {
    mockGetAuth.mockResolvedValue(adminAuth);
    mockSetSystemSetting.mockResolvedValue(undefined);
    mockIsModuleProxyEnabled.mockResolvedValue(true);
    mockIsProviderProxyEnabled.mockResolvedValue(false);
    mockResolveModuleRegistries.mockResolvedValue([]);
    mockResolveProviderRegistries.mockResolvedValue([]);

    const result = await updateProxySettingsAction({
      module_proxy_enabled: true,
    });

    expect(result.success).toBe(true);
    expect(mockSetSystemSetting).toHaveBeenCalledWith(
      "module_upstream_proxy_enabled",
      "true",
    );
  });

  it("updates provider proxy enabled flag", async () => {
    mockGetAuth.mockResolvedValue(adminAuth);
    mockSetSystemSetting.mockResolvedValue(undefined);
    mockIsModuleProxyEnabled.mockResolvedValue(false);
    mockIsProviderProxyEnabled.mockResolvedValue(true);
    mockResolveModuleRegistries.mockResolvedValue([]);
    mockResolveProviderRegistries.mockResolvedValue([]);

    const result = await updateProxySettingsAction({
      provider_proxy_enabled: true,
    });

    expect(result.success).toBe(true);
    expect(mockSetSystemSetting).toHaveBeenCalledWith(
      "provider_upstream_proxy_enabled",
      "true",
    );
  });

  // --------------------------------------------------------------------------
  // Registry list updates
  // --------------------------------------------------------------------------

  it("saves module upstream registries as normalised JSON", async () => {
    mockGetAuth.mockResolvedValue(adminAuth);
    mockSetSystemSetting.mockResolvedValue(undefined);
    mockNormaliseRegistryUrl.mockImplementation((url: string) =>
      url.replace(/\/+$/, ""),
    );
    mockIsModuleProxyEnabled.mockResolvedValue(true);
    mockIsProviderProxyEnabled.mockResolvedValue(false);
    mockResolveModuleRegistries.mockResolvedValue([
      "https://registry.opentofu.org",
    ]);
    mockResolveProviderRegistries.mockResolvedValue([]);

    const result = await updateProxySettingsAction({
      module_upstream_registries: ["https://registry.opentofu.org/"],
    });

    expect(result.success).toBe(true);
    expect(mockSetSystemSetting).toHaveBeenCalledWith(
      "module_upstream_registries",
      JSON.stringify(["https://registry.opentofu.org"]),
    );
  });

  it("saves provider upstream registries", async () => {
    mockGetAuth.mockResolvedValue(adminAuth);
    mockSetSystemSetting.mockResolvedValue(undefined);
    mockIsModuleProxyEnabled.mockResolvedValue(false);
    mockIsProviderProxyEnabled.mockResolvedValue(false);
    mockResolveModuleRegistries.mockResolvedValue([]);
    mockResolveProviderRegistries.mockResolvedValue([
      "https://registry.terraform.io",
    ]);

    const result = await updateProxySettingsAction({
      provider_upstream_registries: ["https://registry.terraform.io"],
    });

    expect(result.success).toBe(true);
    expect(mockSetSystemSetting).toHaveBeenCalledWith(
      "provider_upstream_registries",
      JSON.stringify(["https://registry.terraform.io"]),
    );
  });

  it("clears module registries override when set to null", async () => {
    mockGetAuth.mockResolvedValue(adminAuth);
    mockDeleteSystemSetting.mockResolvedValue(undefined);
    mockIsModuleProxyEnabled.mockResolvedValue(false);
    mockIsProviderProxyEnabled.mockResolvedValue(false);
    mockResolveModuleRegistries.mockResolvedValue([
      "https://registry.opentofu.org",
      "https://registry.terraform.io",
    ]);
    mockResolveProviderRegistries.mockResolvedValue([]);

    const result = await updateProxySettingsAction({
      module_upstream_registries: null,
    });

    expect(result.success).toBe(true);
    expect(mockDeleteSystemSetting).toHaveBeenCalledWith(
      "module_upstream_registries",
    );
  });

  it("clears provider registries override when set to null", async () => {
    mockGetAuth.mockResolvedValue(adminAuth);
    mockDeleteSystemSetting.mockResolvedValue(undefined);
    mockIsModuleProxyEnabled.mockResolvedValue(false);
    mockIsProviderProxyEnabled.mockResolvedValue(false);
    mockResolveModuleRegistries.mockResolvedValue([]);
    mockResolveProviderRegistries.mockResolvedValue([
      "https://registry.opentofu.org",
      "https://registry.terraform.io",
    ]);

    const result = await updateProxySettingsAction({
      provider_upstream_registries: null,
    });

    expect(result.success).toBe(true);
    expect(mockDeleteSystemSetting).toHaveBeenCalledWith(
      "provider_upstream_registries",
    );
  });

  // --------------------------------------------------------------------------
  // Filters out invalid URLs
  // --------------------------------------------------------------------------

  it("filters out URLs that normaliseRegistryUrl returns null for", async () => {
    mockGetAuth.mockResolvedValue(adminAuth);
    mockSetSystemSetting.mockResolvedValue(undefined);
    // Simulate: valid URL passes, invalid returns null
    mockNormaliseRegistryUrl
      .mockReturnValueOnce("https://registry.opentofu.org")
      .mockReturnValueOnce(null); // "not-a-url" is invalid
    mockIsModuleProxyEnabled.mockResolvedValue(true);
    mockIsProviderProxyEnabled.mockResolvedValue(false);
    mockResolveModuleRegistries.mockResolvedValue([
      "https://registry.opentofu.org",
    ]);
    mockResolveProviderRegistries.mockResolvedValue([]);

    const result = await updateProxySettingsAction({
      module_upstream_registries: [
        "https://registry.opentofu.org",
        "not-a-url",
      ],
    });

    expect(result.success).toBe(true);
    expect(mockSetSystemSetting).toHaveBeenCalledWith(
      "module_upstream_registries",
      JSON.stringify(["https://registry.opentofu.org"]),
    );
  });

  // --------------------------------------------------------------------------
  // Multiple fields at once
  // --------------------------------------------------------------------------

  it("updates all fields in a single call", async () => {
    mockGetAuth.mockResolvedValue(adminAuth);
    mockSetSystemSetting.mockResolvedValue(undefined);
    mockIsModuleProxyEnabled.mockResolvedValue(true);
    mockIsProviderProxyEnabled.mockResolvedValue(true);
    mockResolveModuleRegistries.mockResolvedValue([
      "https://registry.opentofu.org",
    ]);
    mockResolveProviderRegistries.mockResolvedValue([
      "https://registry.terraform.io",
    ]);

    const result = await updateProxySettingsAction({
      module_proxy_enabled: true,
      provider_proxy_enabled: true,
      module_upstream_registries: ["https://registry.opentofu.org"],
      provider_upstream_registries: ["https://registry.terraform.io"],
    });

    expect(result.success).toBe(true);
    expect(mockSetSystemSetting).toHaveBeenCalledTimes(4);
    expect(result.settings).toEqual({
      module_proxy_enabled: true,
      provider_proxy_enabled: true,
      module_upstream_registries: ["https://registry.opentofu.org"],
      provider_upstream_registries: ["https://registry.terraform.io"],
    });
  });

  // --------------------------------------------------------------------------
  // Omitted fields left unchanged
  // --------------------------------------------------------------------------

  it("does not call setSystemSetting for omitted fields", async () => {
    mockGetAuth.mockResolvedValue(adminAuth);
    mockSetSystemSetting.mockResolvedValue(undefined);
    mockIsModuleProxyEnabled.mockResolvedValue(true);
    mockIsProviderProxyEnabled.mockResolvedValue(false);
    mockResolveModuleRegistries.mockResolvedValue([]);
    mockResolveProviderRegistries.mockResolvedValue([]);

    await updateProxySettingsAction({
      module_proxy_enabled: true,
    });

    // Only called once — for module_proxy_enabled
    expect(mockSetSystemSetting).toHaveBeenCalledTimes(1);
    expect(mockDeleteSystemSetting).not.toHaveBeenCalled();
  });

  // --------------------------------------------------------------------------
  // Error handling
  // --------------------------------------------------------------------------

  it("returns error when setSystemSetting throws", async () => {
    mockGetAuth.mockResolvedValue(adminAuth);
    mockSetSystemSetting.mockRejectedValue(new Error("D1_ERROR: disk full"));

    const result = await updateProxySettingsAction({
      module_proxy_enabled: true,
    });

    expect(result).toEqual({
      success: false,
      error: "D1_ERROR: disk full",
    });
  });

  it("returns generic error when non-Error is thrown", async () => {
    mockGetAuth.mockResolvedValue(adminAuth);
    mockSetSystemSetting.mockRejectedValue("unknown error");

    const result = await updateProxySettingsAction({
      module_proxy_enabled: false,
    });

    expect(result).toEqual({
      success: false,
      error: "Failed to update proxy settings",
    });
  });
});
