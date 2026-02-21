import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/middleware", () => ({
  requireAdminWriteAuth: vi.fn(),
}));

vi.mock("@/lib/api/etag", () => ({
  parseRequiredIfMatch: vi.fn(),
  makeEtag: (revision: number) => `W/"${revision}"`,
}));

vi.mock("@/lib/validation/admin", () => ({
  adminProviderPlatformReplaceBody: {
    safeParse: vi.fn(),
  },
}));

vi.mock("@/lib/data/providers", () => ({
  findProvider: vi.fn(),
  replaceProviderPlatform: vi.fn(),
}));

vi.mock("@/lib/data/audit", () => ({
  buildProviderAuditMetadata: vi.fn((v) => v),
  writeAuditLog: vi.fn(),
}));

import { PUT } from "@/app/v1/admin/providers/[namespace]/[type]/versions/[version]/platforms/[os]/[arch]/route";
import { requireAdminWriteAuth } from "@/lib/auth/middleware";
import { parseRequiredIfMatch } from "@/lib/api/etag";
import { adminProviderPlatformReplaceBody } from "@/lib/validation/admin";
import { findProvider, replaceProviderPlatform } from "@/lib/data/providers";

const mockRequireAdminWriteAuth = vi.mocked(requireAdminWriteAuth);
const mockParseRequiredIfMatch = vi.mocked(parseRequiredIfMatch);
const mockAdminProviderPlatformReplaceBody = vi.mocked(
  adminProviderPlatformReplaceBody,
);
const mockFindProvider = vi.mocked(findProvider);
const mockReplaceProviderPlatform = vi.mocked(replaceProviderPlatform);

describe("PUT /v1/admin/providers/.../platforms/:os/:arch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdminWriteAuth.mockResolvedValue({ id: 1 } as never);
    mockParseRequiredIfMatch.mockReturnValue({ ok: true, revision: 4 });
    mockAdminProviderPlatformReplaceBody.safeParse.mockReturnValue({
      success: true,
      data: {
        filename: "terraform-provider-aws_1.0.0_linux_amd64.zip",
        shasum:
          "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        location: "providers/hashicorp/aws/1.0.0/file.zip",
      },
    } as never);
    mockFindProvider.mockResolvedValue({ id: 11 } as never);
    mockReplaceProviderPlatform.mockResolvedValue({
      provider: { revision: 5 },
      platform: {
        os: "linux",
        arch: "amd64",
        filename: "terraform-provider-aws_1.0.0_linux_amd64.zip",
        shasum:
          "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        location: "providers/hashicorp/aws/1.0.0/file.zip",
        shasumUrl: null,
        shasumSignatureUrl: null,
      },
    } as never);
  });

  it("returns 428 when If-Match is missing", async () => {
    mockParseRequiredIfMatch.mockReturnValue({ ok: false, reason: "missing" });

    const request = new NextRequest("http://localhost/test", {
      method: "PUT",
      body: JSON.stringify({}),
    });

    const response = await PUT(request, {
      params: Promise.resolve({
        namespace: "hashicorp",
        type: "aws",
        version: "1.0.0",
        os: "linux",
        arch: "amd64",
      }),
    });

    expect(response.status).toBe(428);
    expect(mockReplaceProviderPlatform).not.toHaveBeenCalled();
  });

  it("replaces platform and returns updated ETag", async () => {
    const request = new NextRequest("http://localhost/test", {
      method: "PUT",
      body: JSON.stringify({}),
    });

    const response = await PUT(request, {
      params: Promise.resolve({
        namespace: "hashicorp",
        type: "aws",
        version: "1.0.0",
        os: "linux",
        arch: "amd64",
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("ETag")).toBe('W/"5"');
    expect(mockReplaceProviderPlatform).toHaveBeenCalledWith(
      "hashicorp",
      "aws",
      "1.0.0",
      4,
      expect.objectContaining({ os: "linux", arch: "amd64" }),
    );
  });
});
