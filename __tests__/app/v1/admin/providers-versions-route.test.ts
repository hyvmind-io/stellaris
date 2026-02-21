import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/middleware", () => ({
  requireAdminWriteAuth: vi.fn(),
}));

vi.mock("@/lib/validation/admin", () => ({
  adminProviderCreateBody: {
    safeParse: vi.fn(),
  },
}));

vi.mock("@/lib/data/providers", () => ({
  findProvider: vi.fn(),
  saveProvider: vi.fn(),
}));

vi.mock("@/lib/data/audit", () => ({
  buildProviderAuditMetadata: vi.fn((v) => v),
  writeAuditLog: vi.fn(),
}));

import { POST } from "@/app/v1/admin/providers/[namespace]/[type]/versions/route";
import { requireAdminWriteAuth } from "@/lib/auth/middleware";
import { adminProviderCreateBody } from "@/lib/validation/admin";
import { findProvider, saveProvider } from "@/lib/data/providers";

const mockRequireAdminWriteAuth = vi.mocked(requireAdminWriteAuth);
const mockAdminProviderCreateBody = vi.mocked(adminProviderCreateBody);
const mockFindProvider = vi.mocked(findProvider);
const mockSaveProvider = vi.mocked(saveProvider);

describe("POST /v1/admin/providers/:namespace/:type/versions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdminWriteAuth.mockResolvedValue({
      id: 1,
      name: "admin",
    } as never);
    mockAdminProviderCreateBody.safeParse.mockReturnValue({
      success: true,
      data: {
        version: "1.0.0",
        protocols: ["5.0"],
        platforms: [
          {
            os: "linux",
            arch: "amd64",
            filename: "terraform-provider-aws_1.0.0_linux_amd64.zip",
            shasum:
              "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            location: "providers/hashicorp/aws/1.0.0/file.zip",
          },
        ],
        gpg_public_keys: [
          {
            key_id: "ABC",
            ascii_armor: "PGP",
            source: "src",
            source_url: undefined,
          },
        ],
      },
    } as never);
    mockFindProvider.mockResolvedValue(undefined);
    mockSaveProvider.mockResolvedValue({ revision: 1 } as never);
  });

  it("creates provider version and returns revision ETag", async () => {
    const request = new NextRequest("http://localhost/test", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const response = await POST(request, {
      params: Promise.resolve({ namespace: "hashicorp", type: "aws" }),
    });

    expect(response.status).toBe(201);
    expect(response.headers.get("ETag")).toBe('W/"1"');
    expect(mockSaveProvider).toHaveBeenCalled();
  });
});
