import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/middleware", () => ({
  requireAuth: vi.fn(),
}));

vi.mock("@/lib/data/providers", () => ({
  findProvider: vi.fn(),
  getProviderPlatforms: vi.fn(),
}));

vi.mock("@/lib/data/aliases", () => ({
  resolveProviderCoordinates: vi.fn(),
}));

vi.mock("@/lib/upstream/proxy", () => ({
  proxyProviderJson: vi.fn(),
}));

import {
  DELETE,
  POST,
} from "@/app/v1/providers/[namespace]/[type]/[version]/route";
import { requireAuth } from "@/lib/auth/middleware";

const mockRequireAuth = vi.mocked(requireAuth);

describe("Public provider version route write methods", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 405 for publish on public endpoint", async () => {
    const response = await POST(
      new NextRequest("http://localhost/v1/providers/hashicorp/aws/1.0.0", {
        method: "POST",
      }),
      {
        params: Promise.resolve({
          namespace: "hashicorp",
          type: "aws",
          version: "1.0.0",
        }),
      },
    );

    expect(response.status).toBe(405);
    expect(mockRequireAuth).not.toHaveBeenCalled();
  });

  it("returns 405 for delete on public endpoint", async () => {
    const response = await DELETE(
      new NextRequest("http://localhost/v1/providers/hashicorp/aws/1.0.0", {
        method: "DELETE",
      }),
      {
        params: Promise.resolve({
          namespace: "hashicorp",
          type: "aws",
          version: "1.0.0",
        }),
      },
    );

    expect(response.status).toBe(405);
    expect(mockRequireAuth).not.toHaveBeenCalled();
  });
});
