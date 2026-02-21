import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/middleware", () => ({
  requireAuth: vi.fn(),
  requireAdminWriteAuth: vi.fn(),
}));

vi.mock("@/lib/data/modules", () => ({
  findModule: vi.fn(),
  saveModule: vi.fn(),
  resolveModuleTags: vi.fn((mod) =>
    mod.tags ? JSON.parse(mod.tags) : [mod.provider],
  ),
  hasModule: vi.fn(),
}));

vi.mock("@/lib/data/concurrency", () => ({
  conditionalModuleUpdate: vi.fn(),
  conditionalModuleDelete: vi.fn(),
  RevisionConflictError: class RevisionConflictError extends Error {
    expectedRevision: number;
    currentRevision: number | null;

    constructor(expectedRevision: number, currentRevision: number | null) {
      super("revision conflict");
      this.expectedRevision = expectedRevision;
      this.currentRevision = currentRevision;
    }
  },
}));

vi.mock("@/lib/storage", () => ({
  uploadModuleTarball: vi.fn(),
  deleteObject: vi.fn(),
}));

vi.mock("@/lib/data/audit", () => ({
  writeAuditLog: vi.fn(),
  buildModuleAuditMetadata: vi.fn((m) => ({ entity: "module", ...m })),
}));

vi.mock("@/lib/data/aliases", () => ({
  deleteModuleAliasesByTarget: vi.fn(),
  findModuleAlias: vi.fn(),
  findModuleAliasByTarget: vi.fn(),
  resolveModuleAlias: vi.fn(),
  validateModuleAliasCreateConstraints: vi.fn(),
  createModuleAlias: vi.fn(),
}));

import { requireAuth, requireAdminWriteAuth } from "@/lib/auth/middleware";
import { findModule, saveModule } from "@/lib/data/modules";
import {
  conditionalModuleUpdate,
  conditionalModuleDelete,
} from "@/lib/data/concurrency";
import { uploadModuleTarball, deleteObject } from "@/lib/storage";
import { writeAuditLog } from "@/lib/data/audit";
import {
  deleteModuleAliasesByTarget,
  validateModuleAliasCreateConstraints,
  createModuleAlias,
} from "@/lib/data/aliases";
import { POST as postVersion } from "@/app/v1/admin/modules/[namespace]/[name]/[system]/versions/route";
import {
  GET as getVersion,
  PATCH as patchVersion,
  DELETE as deleteVersion,
} from "@/app/v1/admin/modules/[namespace]/[name]/[system]/versions/[version]/route";
import { POST as postAlias } from "@/app/v1/admin/modules/aliases/route";

const mockRequireAuth = vi.mocked(requireAuth);
const mockRequireAdminWriteAuth = vi.mocked(requireAdminWriteAuth);
const mockFindModule = vi.mocked(findModule);
const mockSaveModule = vi.mocked(saveModule);
const mockConditionalModuleUpdate = vi.mocked(conditionalModuleUpdate);
const mockConditionalModuleDelete = vi.mocked(conditionalModuleDelete);
const mockUploadModuleTarball = vi.mocked(uploadModuleTarball);
const mockDeleteObject = vi.mocked(deleteObject);
const mockWriteAuditLog = vi.mocked(writeAuditLog);
const mockDeleteModuleAliasesByTarget = vi.mocked(deleteModuleAliasesByTarget);
const mockValidateModuleAliasCreateConstraints = vi.mocked(
  validateModuleAliasCreateConstraints,
);
const mockCreateModuleAlias = vi.mocked(createModuleAlias);

const adminApiKey = {
  id: 1,
  keyHash: "hash",
  name: "admin-key",
  description: null,
  permissions: ["admin"],
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  lastUsedAt: null,
  expiresAt: null,
  userId: null,
};

const moduleRow = {
  id: 10,
  namespace: "hashicorp",
  name: "vpc",
  provider: "aws",
  version: "1.0.0",
  owner: "team",
  description: "desc",
  source: "https://github.com/example/vpc",
  location: "hashicorp/vpc/aws/1.0.0.tar.gz",
  definition: null,
  downloads: 0,
  publishedAt: new Date("2026-01-01T00:00:00.000Z"),
  tags: '["aws"]',
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  revision: 1,
};

describe("admin module CRUD routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(adminApiKey);
    mockRequireAdminWriteAuth.mockResolvedValue(adminApiKey);
    mockWriteAuditLog.mockResolvedValue({ id: 1 } as never);
    mockDeleteModuleAliasesByTarget.mockResolvedValue([]);
  });

  it("POST /versions creates module and returns ETag", async () => {
    mockFindModule.mockResolvedValue(undefined);
    mockUploadModuleTarball.mockResolvedValue(moduleRow.location);
    mockSaveModule.mockResolvedValue(moduleRow);

    const form = new FormData();
    form.set("version", "1.0.0");
    form.set("owner", "team");
    form.set("module", new File(["fake-tar"], "module.tar.gz"));

    const request = new NextRequest(
      "http://localhost/v1/admin/modules/hashicorp/vpc/aws/versions",
      {
        method: "POST",
        body: form,
      },
    );

    const response = await postVersion(request, {
      params: Promise.resolve({
        namespace: "hashicorp",
        name: "vpc",
        system: "aws",
      }),
    });

    expect(response.status).toBe(201);
    expect(response.headers.get("etag")).toBe('W/"1"');
    expect(mockUploadModuleTarball).toHaveBeenCalled();
  });

  it("PATCH /versions/:version requires If-Match", async () => {
    const request = new NextRequest(
      "http://localhost/v1/admin/modules/hashicorp/vpc/aws/versions/1.0.0",
      {
        method: "PATCH",
        body: JSON.stringify({ owner: "new-owner" }),
        headers: { "Content-Type": "application/json" },
      },
    );

    const response = await patchVersion(request, {
      params: Promise.resolve({
        namespace: "hashicorp",
        name: "vpc",
        system: "aws",
        version: "1.0.0",
      }),
    });

    expect(response.status).toBe(428);
    expect(mockConditionalModuleUpdate).not.toHaveBeenCalled();
  });

  it("PATCH /versions/:version updates module with revision guard", async () => {
    const updated = { ...moduleRow, owner: "new-owner", revision: 2 };
    mockConditionalModuleUpdate.mockResolvedValue(updated);

    const request = new NextRequest(
      "http://localhost/v1/admin/modules/hashicorp/vpc/aws/versions/1.0.0",
      {
        method: "PATCH",
        body: JSON.stringify({ owner: "new-owner" }),
        headers: {
          "Content-Type": "application/json",
          "If-Match": 'W/"1"',
        },
      },
    );

    const response = await patchVersion(request, {
      params: Promise.resolve({
        namespace: "hashicorp",
        name: "vpc",
        system: "aws",
        version: "1.0.0",
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("etag")).toBe('W/"2"');
    expect(mockConditionalModuleUpdate).toHaveBeenCalledWith(
      "hashicorp",
      "vpc",
      "aws",
      "1.0.0",
      1,
      { owner: "new-owner" },
    );
  });

  it("DELETE /versions/:version hard deletes and cleans artifacts", async () => {
    mockFindModule.mockResolvedValueOnce({ ...moduleRow, revision: 3 });
    mockConditionalModuleDelete.mockResolvedValue(moduleRow);
    mockFindModule.mockResolvedValueOnce(undefined);

    const request = new NextRequest(
      "http://localhost/v1/admin/modules/hashicorp/vpc/aws/versions/1.0.0",
      {
        method: "DELETE",
        headers: { "If-Match": 'W/"3"' },
      },
    );

    const response = await deleteVersion(request, {
      params: Promise.resolve({
        namespace: "hashicorp",
        name: "vpc",
        system: "aws",
        version: "1.0.0",
      }),
    });

    expect(response.status).toBe(204);
    expect(mockDeleteObject).toHaveBeenCalledWith(moduleRow.location);
    expect(mockConditionalModuleDelete).toHaveBeenCalled();
    expect(mockDeleteModuleAliasesByTarget).toHaveBeenCalledWith(
      "hashicorp",
      "vpc",
      "aws",
    );
  });

  it("GET /versions/:version returns ETag", async () => {
    mockFindModule.mockResolvedValue(moduleRow);

    const request = new NextRequest(
      "http://localhost/v1/admin/modules/hashicorp/vpc/aws/versions/1.0.0",
      {
        method: "GET",
      },
    );

    const response = await getVersion(request, {
      params: Promise.resolve({
        namespace: "hashicorp",
        name: "vpc",
        system: "aws",
        version: "1.0.0",
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("etag")).toBe('W/"1"');
  });
});

describe("admin module alias route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(adminApiKey);
    mockRequireAdminWriteAuth.mockResolvedValue(adminApiKey);
    mockWriteAuditLog.mockResolvedValue({ id: 1 } as never);
  });

  it("rejects alias-to-alias target", async () => {
    mockValidateModuleAliasCreateConstraints.mockResolvedValue({
      ok: false,
      code: "TARGET_IS_ALIAS",
      message: "Alias target must be canonical",
    } as never);

    const request = new NextRequest(
      "http://localhost/v1/admin/modules/aliases",
      {
        method: "POST",
        body: JSON.stringify({
          source_namespace: "old",
          source_name: "vpc",
          source_provider: "aws",
          target_namespace: "new",
          target_name: "vpc",
          target_provider: "aws",
        }),
        headers: { "Content-Type": "application/json" },
      },
    );

    const response = await postAlias(request);
    expect(response.status).toBe(400);
    expect(mockCreateModuleAlias).not.toHaveBeenCalled();
  });

  it("creates alias when target is canonical", async () => {
    mockValidateModuleAliasCreateConstraints.mockResolvedValue({
      ok: true,
    } as never);
    mockCreateModuleAlias.mockResolvedValue({
      id: 1,
      sourceNamespace: "old",
      sourceName: "vpc",
      sourceProvider: "aws",
      targetNamespace: "new",
      targetName: "vpc",
      targetProvider: "aws",
      createdBy: "admin-key",
      createdAt: new Date("2026-01-02T00:00:00.000Z"),
    });

    const request = new NextRequest(
      "http://localhost/v1/admin/modules/aliases",
      {
        method: "POST",
        body: JSON.stringify({
          source_namespace: "old",
          source_name: "vpc",
          source_provider: "aws",
          target_namespace: "new",
          target_name: "vpc",
          target_provider: "aws",
        }),
        headers: { "Content-Type": "application/json" },
      },
    );

    const response = await postAlias(request);
    expect(response.status).toBe(201);
    expect(mockCreateModuleAlias).toHaveBeenCalled();
  });

  it("rejects alias source that is already a target", async () => {
    mockValidateModuleAliasCreateConstraints.mockResolvedValue({
      ok: false,
      code: "SOURCE_IS_ALIAS_TARGET",
      message: "Alias source cannot be an alias target",
    } as never);

    const request = new NextRequest(
      "http://localhost/v1/admin/modules/aliases",
      {
        method: "POST",
        body: JSON.stringify({
          source_namespace: "mid",
          source_name: "vpc",
          source_provider: "aws",
          target_namespace: "new",
          target_name: "vpc",
          target_provider: "aws",
        }),
        headers: { "Content-Type": "application/json" },
      },
    );

    const response = await postAlias(request);
    expect(response.status).toBe(400);
    expect(mockCreateModuleAlias).not.toHaveBeenCalled();
  });
});
