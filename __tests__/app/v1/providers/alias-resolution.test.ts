import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/middleware", () => ({
  requireAuth: vi.fn(),
}));

vi.mock("@/lib/data/aliases", () => ({
  resolveProviderCoordinates: vi.fn(),
}));

vi.mock("@/lib/data/providers", () => ({
  getProviderVersions: vi.fn(),
}));

vi.mock("@/lib/upstream/proxy", () => ({
  proxyProviderJson: vi.fn(),
}));

vi.mock("@/lib/validation/registry", () => ({
  providerVersionsParams: {
    safeParse: vi.fn(),
  },
}));

import { GET } from "@/app/v1/providers/[namespace]/[type]/versions/route";
import { requireAuth } from "@/lib/auth/middleware";
import { resolveProviderCoordinates } from "@/lib/data/aliases";
import { getProviderVersions } from "@/lib/data/providers";
import { providerVersionsParams } from "@/lib/validation/registry";

const mockRequireAuth = vi.mocked(requireAuth);
const mockResolveProviderCoordinates = vi.mocked(resolveProviderCoordinates);
const mockGetProviderVersions = vi.mocked(getProviderVersions);
const mockProviderVersionsParams = vi.mocked(providerVersionsParams);

describe("Provider alias resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ id: 1 } as never);
    mockProviderVersionsParams.safeParse.mockReturnValue({
      success: true,
      data: { namespace: "old", type: "legacy" },
    } as never);
    mockResolveProviderCoordinates.mockResolvedValue({
      namespace: "hashicorp",
      type: "aws",
      aliased: true,
    });
    mockGetProviderVersions.mockResolvedValue([
      {
        version: "1.0.0",
        protocols: ["5.0"],
        platforms: [{ os: "linux", arch: "amd64" }],
      },
    ]);
  });

  it("resolves aliases to canonical coordinates in versions route", async () => {
    const response = await GET(new NextRequest("http://localhost/test"), {
      params: Promise.resolve({ namespace: "old", type: "legacy" }),
    });

    expect(response.status).toBe(200);
    expect(mockResolveProviderCoordinates).toHaveBeenCalledWith(
      "old",
      "legacy",
    );
    expect(mockGetProviderVersions).toHaveBeenCalledWith("hashicorp", "aws");
  });
});
