import { describe, it, expect, vi, beforeEach } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;

const mockGetAuth = vi.fn<AnyFn>();
const mockGetProxySettingsSnapshot = vi.fn<AnyFn>();
const mockUpdateProxySettings = vi.fn<AnyFn>();

vi.mock("@/lib/auth/get-auth", () => ({
  getAuth: () => mockGetAuth(),
}));

vi.mock("@/lib/upstream/config-service", () => ({
  getProxySettingsSnapshot: (...args: unknown[]) =>
    mockGetProxySettingsSnapshot(...args),
  updateProxySettings: (...args: unknown[]) => mockUpdateProxySettings(...args),
}));

vi.mock("@/lib/data/settings", () => ({
  isSignupEnabled: vi.fn(),
  setSignupEnabled: vi.fn(),
}));

vi.mock("@/lib/data/users", () => ({
  getAllUsers: vi.fn(),
  getUserById: vi.fn(),
  updateUserRole: vi.fn(),
  getAdminCount: vi.fn(),
  getUserByEmail: vi.fn(),
  getUserByUsername: vi.fn(),
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  isEmailTaken: vi.fn(),
  isUsernameTaken: vi.fn(),
  updateUser: vi.fn(),
  updateUserPassword: vi.fn(),
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

describe("getProxySettingsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns error when not authenticated", async () => {
    mockGetAuth.mockResolvedValue(null);

    const result = await getProxySettingsAction();

    expect(result).toEqual({ success: false, error: "Not authenticated" });
    expect(mockGetProxySettingsSnapshot).not.toHaveBeenCalled();
  });

  it("returns error when not admin", async () => {
    mockGetAuth.mockResolvedValue(userAuth);

    const result = await getProxySettingsAction();

    expect(result).toEqual({ success: false, error: "Admin access required" });
    expect(mockGetProxySettingsSnapshot).not.toHaveBeenCalled();
  });

  it("returns settings from canonical config service", async () => {
    mockGetAuth.mockResolvedValue(adminAuth);
    mockGetProxySettingsSnapshot.mockResolvedValue({
      module_proxy_enabled: true,
      provider_proxy_enabled: false,
      module_upstream_registries: ["https://registry.opentofu.org"],
      provider_upstream_registries: ["https://registry.terraform.io"],
    });

    const result = await getProxySettingsAction();

    expect(result).toEqual({
      success: true,
      settings: {
        module_proxy_enabled: true,
        provider_proxy_enabled: false,
        module_upstream_registries: ["https://registry.opentofu.org"],
        provider_upstream_registries: ["https://registry.terraform.io"],
      },
    });
  });

  it("returns generic error when service read fails", async () => {
    mockGetAuth.mockResolvedValue(adminAuth);
    mockGetProxySettingsSnapshot.mockRejectedValue(new Error("D1 unavailable"));

    const result = await getProxySettingsAction();

    expect(result).toEqual({
      success: false,
      error: "Failed to load proxy settings",
    });
  });
});

describe("updateProxySettingsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns error when not authenticated", async () => {
    mockGetAuth.mockResolvedValue(null);

    const result = await updateProxySettingsAction({
      module_proxy_enabled: true,
    });

    expect(result).toEqual({ success: false, error: "Not authenticated" });
    expect(mockUpdateProxySettings).not.toHaveBeenCalled();
  });

  it("returns error when not admin", async () => {
    mockGetAuth.mockResolvedValue(userAuth);

    const result = await updateProxySettingsAction({
      module_proxy_enabled: true,
    });

    expect(result).toEqual({ success: false, error: "Admin access required" });
    expect(mockUpdateProxySettings).not.toHaveBeenCalled();
  });

  it("delegates writes to canonical config service", async () => {
    mockGetAuth.mockResolvedValue(adminAuth);
    mockUpdateProxySettings.mockResolvedValue({
      module_proxy_enabled: true,
      provider_proxy_enabled: true,
      module_upstream_registries: ["https://registry.opentofu.org"],
      provider_upstream_registries: ["https://registry.terraform.io"],
    });

    const payload = {
      module_proxy_enabled: true,
      provider_proxy_enabled: true,
      module_upstream_registries: ["https://registry.opentofu.org"],
      provider_upstream_registries: ["https://registry.terraform.io"],
    };

    const result = await updateProxySettingsAction(payload);

    expect(mockUpdateProxySettings).toHaveBeenCalledWith(payload);
    expect(result).toEqual({
      success: true,
      settings: {
        module_proxy_enabled: true,
        provider_proxy_enabled: true,
        module_upstream_registries: ["https://registry.opentofu.org"],
        provider_upstream_registries: ["https://registry.terraform.io"],
      },
    });
  });

  it("supports null clear semantics via canonical service", async () => {
    mockGetAuth.mockResolvedValue(adminAuth);
    mockUpdateProxySettings.mockResolvedValue({
      module_proxy_enabled: true,
      provider_proxy_enabled: true,
      module_upstream_registries: ["https://registry.opentofu.org"],
      provider_upstream_registries: ["https://registry.terraform.io"],
    });

    await updateProxySettingsAction({
      module_upstream_registries: null,
      provider_upstream_registries: null,
    });

    expect(mockUpdateProxySettings).toHaveBeenCalledWith({
      module_upstream_registries: null,
      provider_upstream_registries: null,
    });
  });

  it("supports explicit empty-list disable semantics via canonical service", async () => {
    mockGetAuth.mockResolvedValue(adminAuth);
    mockUpdateProxySettings.mockResolvedValue({
      module_proxy_enabled: true,
      provider_proxy_enabled: true,
      module_upstream_registries: [],
      provider_upstream_registries: [],
    });

    await updateProxySettingsAction({
      module_upstream_registries: [],
      provider_upstream_registries: [],
    });

    expect(mockUpdateProxySettings).toHaveBeenCalledWith({
      module_upstream_registries: [],
      provider_upstream_registries: [],
    });
  });

  it("returns explicit service error messages", async () => {
    mockGetAuth.mockResolvedValue(adminAuth);
    mockUpdateProxySettings.mockRejectedValue(
      new Error(
        "module_upstream_registries contains an invalid URL. Only HTTPS upstream URLs are allowed.",
      ),
    );

    const result = await updateProxySettingsAction({
      module_upstream_registries: ["not-a-url"],
    });

    expect(result).toEqual({
      success: false,
      error:
        "module_upstream_registries contains an invalid URL. Only HTTPS upstream URLs are allowed.",
    });
  });

  it("returns generic error when non-Error is thrown", async () => {
    mockGetAuth.mockResolvedValue(adminAuth);
    mockUpdateProxySettings.mockRejectedValue("unknown");

    const result = await updateProxySettingsAction({
      module_proxy_enabled: false,
    });

    expect(result).toEqual({
      success: false,
      error: "Failed to update proxy settings",
    });
  });
});
