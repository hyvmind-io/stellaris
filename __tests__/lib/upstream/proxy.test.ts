import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

const mockIsModuleProxyEnabled = vi.fn();
const mockIsProviderProxyEnabled = vi.fn();
const mockResolveModuleRegistries = vi.fn();
const mockResolveProviderRegistries = vi.fn();

vi.mock("@/lib/upstream/config", () => ({
  isModuleProxyEnabled: () => mockIsModuleProxyEnabled(),
  isProviderProxyEnabled: () => mockIsProviderProxyEnabled(),
  resolveModuleRegistries: () => mockResolveModuleRegistries(),
  resolveProviderRegistries: () => mockResolveProviderRegistries(),
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import {
  proxyModuleRequest,
  proxyModuleJson,
  proxyProviderRequest,
  proxyProviderJson,
} from "@/lib/upstream/proxy";

// ============================================================================
// Helpers
// ============================================================================

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ============================================================================
// proxyModuleRequest
// ============================================================================

describe("proxyModuleRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when proxy is disabled", async () => {
    mockIsModuleProxyEnabled.mockResolvedValue(false);

    const result = await proxyModuleRequest(
      "/v1/modules/hashicorp/consul/aws/versions",
    );
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns first successful upstream response", async () => {
    mockIsModuleProxyEnabled.mockResolvedValue(true);
    mockResolveModuleRegistries.mockResolvedValue([
      "https://registry.opentofu.org",
      "https://registry.terraform.io",
    ]);
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ modules: [{ versions: [{ version: "1.0.0" }] }] }),
    );

    const result = await proxyModuleRequest(
      "/v1/modules/hashicorp/consul/aws/versions",
    );
    expect(result).not.toBeNull();
    expect(result!.upstream).toBe("https://registry.opentofu.org");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("skips 404 upstream and tries next", async () => {
    mockIsModuleProxyEnabled.mockResolvedValue(true);
    mockResolveModuleRegistries.mockResolvedValue([
      "https://registry.opentofu.org",
      "https://registry.terraform.io",
    ]);
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 404 }));
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ modules: [{ versions: [{ version: "2.0.0" }] }] }),
    );

    const result = await proxyModuleRequest(
      "/v1/modules/test/mod/aws/versions",
    );
    expect(result).not.toBeNull();
    expect(result!.upstream).toBe("https://registry.terraform.io");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("returns null when all upstreams fail", async () => {
    mockIsModuleProxyEnabled.mockResolvedValue(true);
    mockResolveModuleRegistries.mockResolvedValue([
      "https://registry.opentofu.org",
    ]);
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 404 }));

    const result = await proxyModuleRequest(
      "/v1/modules/nonexistent/mod/aws/versions",
    );
    expect(result).toBeNull();
  });

  it("returns null when registries list is empty", async () => {
    mockIsModuleProxyEnabled.mockResolvedValue(true);
    mockResolveModuleRegistries.mockResolvedValue([]);

    const result = await proxyModuleRequest(
      "/v1/modules/hashicorp/consul/aws/versions",
    );
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("handles network errors gracefully", async () => {
    mockIsModuleProxyEnabled.mockResolvedValue(true);
    mockResolveModuleRegistries.mockResolvedValue([
      "https://unreachable.example.com",
    ]);
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const result = await proxyModuleRequest(
      "/v1/modules/hashicorp/consul/aws/versions",
    );
    expect(result).toBeNull();
  });
});

// ============================================================================
// proxyModuleJson
// ============================================================================

describe("proxyModuleJson", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns parsed JSON from upstream", async () => {
    mockIsModuleProxyEnabled.mockResolvedValue(true);
    mockResolveModuleRegistries.mockResolvedValue([
      "https://registry.opentofu.org",
    ]);
    const data = { modules: [{ versions: [{ version: "1.0.0" }] }] };
    mockFetch.mockResolvedValueOnce(jsonResponse(data));

    const result = await proxyModuleJson("/v1/modules/test/mod/aws/versions");
    expect(result).not.toBeNull();
    expect(result!.data).toEqual(data);
    expect(result!.upstream).toBe("https://registry.opentofu.org");
  });

  it("returns null when proxy is disabled", async () => {
    mockIsModuleProxyEnabled.mockResolvedValue(false);

    const result = await proxyModuleJson("/v1/modules/test/mod/aws/versions");
    expect(result).toBeNull();
  });
});

// ============================================================================
// proxyProviderRequest
// ============================================================================

describe("proxyProviderRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when proxy is disabled", async () => {
    mockIsProviderProxyEnabled.mockResolvedValue(false);

    const result = await proxyProviderRequest(
      "/v1/providers/hashicorp/aws/versions",
    );
    expect(result).toBeNull();
  });

  it("returns upstream response when enabled", async () => {
    mockIsProviderProxyEnabled.mockResolvedValue(true);
    mockResolveProviderRegistries.mockResolvedValue([
      "https://registry.terraform.io",
    ]);
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ versions: [{ version: "5.0.0" }] }),
    );

    const result = await proxyProviderRequest(
      "/v1/providers/hashicorp/aws/versions",
    );
    expect(result).not.toBeNull();
    expect(result!.upstream).toBe("https://registry.terraform.io");
  });
});

// ============================================================================
// proxyProviderJson
// ============================================================================

describe("proxyProviderJson", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns parsed JSON from upstream", async () => {
    mockIsProviderProxyEnabled.mockResolvedValue(true);
    mockResolveProviderRegistries.mockResolvedValue([
      "https://registry.terraform.io",
    ]);
    const data = { versions: [{ version: "5.0.0" }] };
    mockFetch.mockResolvedValueOnce(jsonResponse(data));

    const result = await proxyProviderJson(
      "/v1/providers/hashicorp/aws/versions",
    );
    expect(result).not.toBeNull();
    expect(result!.data).toEqual(data);
  });
});
