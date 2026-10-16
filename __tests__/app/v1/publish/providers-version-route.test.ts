import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/middleware", () => ({ requireAuth: vi.fn(), requirePublishAuth: vi.fn() }));

vi.mock("@/lib/api/etag", () => ({
  parseRequiredIfMatch: vi.fn(),
  makeEtag: (revision: number) => `W/"${revision}"`,
}));

vi.mock("@/lib/validation/admin", () => ({
  adminProviderUpdateBody: {
    safeParse: vi.fn(),
  },
}));

vi.mock("@/lib/data/concurrency", () => ({
  RevisionConflictError: class RevisionConflictError extends Error {},
  conditionalProviderUpdate: vi.fn(),
}));

vi.mock("@/lib/data/providers", () => ({
  findProvider: vi.fn(),
  findAnyProvider: vi.fn(),
  getProviderPlatforms: vi.fn(),
  getProviderGpgKeys: vi.fn(),
  conditionalDeleteProvider: vi.fn(),
}));

vi.mock("@/lib/data/aliases", () => ({
  deleteProviderAliasesByTarget: vi.fn(),
}));

vi.mock("@/lib/storage", () => ({
  deleteByPrefix: vi.fn(),
}));

vi.mock("@/lib/data/audit", () => ({
  buildProviderAuditMetadata: vi.fn((v) => v),
  writeAuditLog: vi.fn(),
}));

import {
  PATCH,
  DELETE,
} from "@/app/v1/publish/providers/[namespace]/[type]/versions/[version]/route";
import { requirePublishAuth } from "@/lib/auth/middleware";
import { parseRequiredIfMatch } from "@/lib/api/etag";
import { adminProviderUpdateBody } from "@/lib/validation/admin";
import { conditionalProviderUpdate } from "@/lib/data/concurrency";
import {
  conditionalDeleteProvider,
  findAnyProvider,
  findProvider,
} from "@/lib/data/providers";
import { deleteProviderAliasesByTarget } from "@/lib/data/aliases";
import { deleteByPrefix } from "@/lib/storage";

const mockRequirePublishAuth = vi.mocked(requirePublishAuth);
const mockParseRequiredIfMatch = vi.mocked(parseRequiredIfMatch);
const mockAdminProviderUpdateBody = vi.mocked(adminProviderUpdateBody);
const mockConditionalProviderUpdate = vi.mocked(conditionalProviderUpdate);
const mockConditionalDeleteProvider = vi.mocked(conditionalDeleteProvider);
const mockFindAnyProvider = vi.mocked(findAnyProvider);
const mockFindProvider = vi.mocked(findProvider);
const mockDeleteProviderAliasesByTarget = vi.mocked(
  deleteProviderAliasesByTarget,
);
const mockDeleteByPrefix = vi.mocked(deleteByPrefix);

describe("Publish provider version route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePublishAuth.mockResolvedValue({ id: 1 } as never);
    mockParseRequiredIfMatch.mockReturnValue({ ok: true, revision: 2 });
    mockAdminProviderUpdateBody.safeParse.mockReturnValue({
      success: true,
      data: { protocols: ["6.0"] },
    } as never);
    mockFindProvider.mockResolvedValue({
      namespace: "hashicorp",
      type: "aws",
      version: "1.0.0",
      revision: 2,
      protocols: ["5.0"],
      publishedAt: new Date(),
      updatedAt: new Date(),
      id: 1,
    } as never);
    mockConditionalProviderUpdate.mockResolvedValue({ revision: 3 } as never);
    mockConditionalDeleteProvider.mockResolvedValue({
      provider: { revision: 2 },
      platforms: [],
    } as never);
    mockFindAnyProvider.mockResolvedValue(undefined);
  });

  it("returns 428 when If-Match is missing on PATCH", async () => {
    mockParseRequiredIfMatch.mockReturnValue({ ok: false, reason: "missing" });

    const response = await PATCH(
      new NextRequest("http://localhost/test", {
        method: "PATCH",
        body: JSON.stringify({ protocols: ["6.0"] }),
      }),
      {
        params: Promise.resolve({
          namespace: "hashicorp",
          type: "aws",
          version: "1.0.0",
        }),
      },
    );

    expect(response.status).toBe(428);
    expect(mockConditionalProviderUpdate).not.toHaveBeenCalled();
  });

  it("deletes provider version and triggers artifact cleanup", async () => {
    const response = await DELETE(
      new NextRequest("http://localhost/test", { method: "DELETE" }),
      {
        params: Promise.resolve({
          namespace: "hashicorp",
          type: "aws",
          version: "1.0.0",
        }),
      },
    );

    expect(response.status).toBe(204);
    expect(mockConditionalDeleteProvider).toHaveBeenCalledWith(
      "hashicorp",
      "aws",
      "1.0.0",
      2,
    );
    expect(mockDeleteByPrefix).toHaveBeenCalledWith(
      "providers/hashicorp/aws/1.0.0/",
    );
    expect(mockDeleteByPrefix.mock.invocationCallOrder[0]).toBeLessThan(
      mockConditionalDeleteProvider.mock.invocationCallOrder[0]!,
    );
    expect(mockDeleteProviderAliasesByTarget).toHaveBeenCalledWith(
      "hashicorp",
      "aws",
    );
  });

  it("returns 500 when provider artifact cleanup fails", async () => {
    mockDeleteByPrefix.mockRejectedValueOnce(new Error("cleanup failed"));

    const response = await DELETE(
      new NextRequest("http://localhost/test", { method: "DELETE" }),
      {
        params: Promise.resolve({
          namespace: "hashicorp",
          type: "aws",
          version: "1.0.0",
        }),
      },
    );

    expect(response.status).toBe(500);
    expect(mockDeleteProviderAliasesByTarget).not.toHaveBeenCalled();
    expect(mockConditionalDeleteProvider).not.toHaveBeenCalled();
  });

  it("returns 412 and skips cleanup when If-Match is stale", async () => {
    mockParseRequiredIfMatch.mockReturnValue({ ok: true, revision: 99 });

    const response = await DELETE(
      new NextRequest("http://localhost/test", { method: "DELETE" }),
      {
        params: Promise.resolve({
          namespace: "hashicorp",
          type: "aws",
          version: "1.0.0",
        }),
      },
    );

    expect(response.status).toBe(412);
    expect(mockDeleteByPrefix).not.toHaveBeenCalled();
    expect(mockConditionalDeleteProvider).not.toHaveBeenCalled();
  });
});
