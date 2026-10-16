import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/middleware", () => ({ requireAuth: vi.fn() }));

vi.mock("@/lib/validation/admin", () => ({
  createProviderAliasBody: {
    safeParse: vi.fn(),
  },
}));

vi.mock("@/lib/data/aliases", () => ({
  validateProviderAliasCreateConstraints: vi.fn(),
  createProviderAlias: vi.fn(),
}));

vi.mock("@/lib/data/audit", () => ({
  buildProviderAuditMetadata: vi.fn((v) => v),
  writeAuditLog: vi.fn(),
}));

import { POST } from "@/app/v1/admin/providers/aliases/route";
import { requireAuth } from "@/lib/auth/middleware";
import { createProviderAliasBody } from "@/lib/validation/admin";
import {
  createProviderAlias,
  validateProviderAliasCreateConstraints,
} from "@/lib/data/aliases";

const mockRequireAuth = vi.mocked(requireAuth);
const mockCreateProviderAliasBody = vi.mocked(createProviderAliasBody);
const mockCreateProviderAlias = vi.mocked(createProviderAlias);
const mockValidateProviderAliasCreateConstraints = vi.mocked(
  validateProviderAliasCreateConstraints,
);

describe("POST /v1/admin/providers/aliases", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockRequireAuth.mockResolvedValue({
      id: 1,
      name: "admin-key",
      permissions: ["admin"],
    } as never);

    mockCreateProviderAliasBody.safeParse.mockReturnValue({
      success: true,
      data: {
        source_namespace: "old-ns",
        source_type: "old-type",
        target_namespace: "new-ns",
        target_type: "new-type",
      },
    } as never);

    mockValidateProviderAliasCreateConstraints.mockResolvedValue({
      ok: true,
    } as never);
    mockCreateProviderAlias.mockResolvedValue({
      id: 55,
      sourceNamespace: "old-ns",
      sourceType: "old-type",
      targetNamespace: "new-ns",
      targetType: "new-type",
      createdBy: "admin-key",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    } as never);
  });

  it("rejects alias-to-alias targets", async () => {
    mockValidateProviderAliasCreateConstraints.mockResolvedValue({
      ok: false,
      code: "TARGET_IS_ALIAS",
      message: "Alias target must be canonical",
    } as never);

    const request = new NextRequest(
      "http://localhost/v1/admin/providers/aliases",
      {
        method: "POST",
        body: JSON.stringify({}),
      },
    );

    const response = await POST(request);
    expect(response.status).toBe(409);
    expect(mockCreateProviderAlias).not.toHaveBeenCalled();
  });

  it("creates alias when rules are valid", async () => {
    const request = new NextRequest(
      "http://localhost/v1/admin/providers/aliases",
      {
        method: "POST",
        body: JSON.stringify({}),
      },
    );

    const response = await POST(request);
    expect(response.status).toBe(201);
    expect(mockCreateProviderAlias).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceNamespace: "old-ns",
        sourceType: "old-type",
        targetNamespace: "new-ns",
        targetType: "new-type",
      }),
    );
  });
});
