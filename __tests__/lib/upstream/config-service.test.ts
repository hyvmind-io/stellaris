import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSystemSetting = vi.fn();
const mockSetSystemSetting = vi.fn();
const mockDeleteSystemSetting = vi.fn();
const mockResolveModuleRegistries = vi.fn();
const mockResolveProviderRegistries = vi.fn();
const mockIsModuleProxyEnabled = vi.fn();
const mockIsProviderProxyEnabled = vi.fn();
const mockNormaliseRegistryUrl = vi.fn();

vi.mock("@/lib/data/settings", () => ({
  getSystemSetting: (...args: unknown[]) => mockGetSystemSetting(...args),
  setSystemSetting: (...args: unknown[]) => mockSetSystemSetting(...args),
  deleteSystemSetting: (...args: unknown[]) => mockDeleteSystemSetting(...args),
}));

vi.mock("@/lib/upstream/config", () => ({
  SETTINGS_KEY: {
    moduleProxyEnabled: "module_upstream_proxy_enabled",
    providerProxyEnabled: "provider_upstream_proxy_enabled",
    moduleRegistries: "module_upstream_registries",
    providerRegistries: "provider_upstream_registries",
  },
  resolveModuleRegistries: (...args: unknown[]) =>
    mockResolveModuleRegistries(...args),
  resolveProviderRegistries: (...args: unknown[]) =>
    mockResolveProviderRegistries(...args),
  isModuleProxyEnabled: (...args: unknown[]) =>
    mockIsModuleProxyEnabled(...args),
  isProviderProxyEnabled: (...args: unknown[]) =>
    mockIsProviderProxyEnabled(...args),
  normaliseRegistryUrl: (...args: unknown[]) =>
    mockNormaliseRegistryUrl(...args),
}));

import {
  getProxySettingsSnapshot,
  updateProxySettings,
} from "@/lib/upstream/config-service";

describe("config-service proxy settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockIsModuleProxyEnabled.mockResolvedValue(true);
    mockIsProviderProxyEnabled.mockResolvedValue(false);
    mockResolveModuleRegistries.mockResolvedValue([
      "https://registry.opentofu.org",
    ]);
    mockResolveProviderRegistries.mockResolvedValue([
      "https://registry.terraform.io",
    ]);

    mockNormaliseRegistryUrl.mockImplementation((raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed.startsWith("https://")) return null;
      return trimmed.replace(/\/+$/, "");
    });
  });

  it("returns effective settings without raw overrides by default", async () => {
    const result = await getProxySettingsSnapshot();

    expect(result).toEqual({
      module_proxy_enabled: true,
      provider_proxy_enabled: false,
      module_upstream_registries: ["https://registry.opentofu.org"],
      provider_upstream_registries: ["https://registry.terraform.io"],
    });
    expect(mockGetSystemSetting).not.toHaveBeenCalled();
  });

  it("includes raw DB overrides when requested", async () => {
    mockGetSystemSetting
      .mockResolvedValueOnce("true")
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('["https://db-modules.example"]')
      .mockResolvedValueOnce("not-json");

    const result = await getProxySettingsSnapshot({ includeOverrides: true });

    expect(result.overrides).toEqual({
      module_proxy_enabled: "true",
      provider_proxy_enabled: null,
      module_upstream_registries: ["https://db-modules.example"],
      provider_upstream_registries: "not-json",
    });
  });

  it("treats null as clear override and [] as explicit disable", async () => {
    await updateProxySettings({
      module_upstream_registries: null,
      provider_upstream_registries: [],
    });

    expect(mockDeleteSystemSetting).toHaveBeenCalledWith(
      "module_upstream_registries",
    );
    expect(mockSetSystemSetting).toHaveBeenCalledWith(
      "provider_upstream_registries",
      "[]",
    );
  });

  it("normalises and deduplicates explicit upstream lists", async () => {
    await updateProxySettings({
      module_upstream_registries: [
        " https://mirror.example/ ",
        "https://mirror.example",
        "https://registry.terraform.io/",
      ],
    });

    expect(mockSetSystemSetting).toHaveBeenCalledWith(
      "module_upstream_registries",
      JSON.stringify([
        "https://mirror.example",
        "https://registry.terraform.io",
      ]),
    );
  });

  it("rejects non-HTTPS upstream URLs", async () => {
    await expect(
      updateProxySettings({
        module_upstream_registries: ["http://insecure.example"],
      }),
    ).rejects.toThrow(
      "module_upstream_registries contains an invalid URL. Only HTTPS upstream URLs are allowed.",
    );

    expect(mockSetSystemSetting).not.toHaveBeenCalledWith(
      "module_upstream_registries",
      expect.any(String),
    );
  });
});
