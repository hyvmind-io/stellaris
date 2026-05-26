import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/middleware", () => ({
  requireAuth: vi.fn(),
  requireAdminWriteAuth: vi.fn(),
}));

vi.mock("@/lib/data/modules", () => ({
  findModule: vi.fn(),
  resolveModuleTags: vi.fn((mod) =>
    mod.tags ? JSON.parse(mod.tags) : [mod.provider],
  ),
}));

vi.mock("@/lib/data/concurrency", () => ({
  conditionalModuleUpdate: vi.fn(),
  conditionalModuleDelete: vi.fn(),
  conditionalModuleReplaceBytes: vi.fn(),
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

vi.mock("@/lib/data/settings", () => ({
  isImmutableUploadsEnabled: vi.fn(),
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
}));

import { requireAdminWriteAuth } from "@/lib/auth/middleware";
import { findModule } from "@/lib/data/modules";
import { conditionalModuleReplaceBytes } from "@/lib/data/concurrency";
import { isImmutableUploadsEnabled } from "@/lib/data/settings";
import { uploadModuleTarball, deleteObject } from "@/lib/storage";
import { PUT } from "@/app/v1/admin/modules/[namespace]/[name]/[system]/versions/[version]/route";

const mockRequireAdminWriteAuth = vi.mocked(requireAdminWriteAuth);
const mockFindModule = vi.mocked(findModule);
const mockReplaceBytes = vi.mocked(conditionalModuleReplaceBytes);
const mockIsImmutable = vi.mocked(isImmutableUploadsEnabled);
const mockUploadTarball = vi.mocked(uploadModuleTarball);
const mockDeleteObject = vi.mocked(deleteObject);

const params = {
  namespace: "evilcorp",
  name: "vpc",
  system: "aws",
  version: "1.0.0",
};

const existingModule = {
  id: 1,
  namespace: "evilcorp",
  name: "vpc",
  provider: "aws",
  version: "1.0.0",
  owner: "",
  description: null,
  source: null,
  location: "evilcorp/vpc/aws/1.0.0.tar.gz",
  tags: '["aws"]',
  downloads: 0,
  revision: 3,
  publishedAt: new Date("2024-01-01T00:00:00Z"),
  updatedAt: new Date("2024-01-01T00:00:00Z"),
};

function multipartRequest(form: FormData) {
  return new NextRequest("http://localhost/test", {
    method: "PUT",
    body: form,
    headers: { "If-Match": 'W/"3"' },
  });
}

function tarballForm() {
  const form = new FormData();
  form.set("module", new File(["tar-bytes"], "vpc.tar.gz"));
  return form;
}

describe("PUT /v1/admin/modules/.../versions/:version (replace bytes)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdminWriteAuth.mockResolvedValue({
      id: 1,
      name: "ci-key",
    } as never);
    mockFindModule.mockResolvedValue(existingModule as never);
    mockUploadTarball.mockResolvedValue("evilcorp/vpc/aws/1.0.0.tar.gz");
    mockReplaceBytes.mockResolvedValue({
      ...existingModule,
      revision: 4,
      updatedAt: new Date("2024-02-01T00:00:00Z"),
    } as never);
  });

  it("returns 409 when immutable uploads are enabled (overwrite blocked)", async () => {
    mockIsImmutable.mockResolvedValue(true);

    const response = await PUT(multipartRequest(tarballForm()), {
      params: Promise.resolve(params),
    });

    expect(response.status).toBe(409);
    expect(mockUploadTarball).not.toHaveBeenCalled();
    expect(mockReplaceBytes).not.toHaveBeenCalled();
  });

  it("overwrites bytes, bumps revision when immutable uploads are disabled", async () => {
    mockIsImmutable.mockResolvedValue(false);

    const response = await PUT(multipartRequest(tarballForm()), {
      params: Promise.resolve(params),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("ETag")).toBe('W/"4"');
    expect(mockUploadTarball).toHaveBeenCalledWith(
      "evilcorp",
      "vpc",
      "aws",
      "1.0.0",
      expect.anything(),
    );
    expect(mockReplaceBytes).toHaveBeenCalledWith(
      "evilcorp",
      "vpc",
      "aws",
      "1.0.0",
      3,
      expect.objectContaining({ location: "evilcorp/vpc/aws/1.0.0.tar.gz" }),
    );
  });

  it("cleans up the old R2 object when the key changed on overwrite", async () => {
    mockIsImmutable.mockResolvedValue(false);
    mockFindModule.mockResolvedValue({
      ...existingModule,
      location: "legacy/old-key.tar.gz",
    } as never);

    const response = await PUT(multipartRequest(tarballForm()), {
      params: Promise.resolve(params),
    });

    expect(response.status).toBe(200);
    expect(mockDeleteObject).toHaveBeenCalledWith("legacy/old-key.tar.gz");
  });

  it("does NOT delete when the new key equals the old key", async () => {
    mockIsImmutable.mockResolvedValue(false);

    const response = await PUT(multipartRequest(tarballForm()), {
      params: Promise.resolve(params),
    });

    expect(response.status).toBe(200);
    expect(mockDeleteObject).not.toHaveBeenCalled();
  });

  it("returns 404 when the version does not exist", async () => {
    mockIsImmutable.mockResolvedValue(false);
    mockFindModule.mockResolvedValue(undefined as never);

    const response = await PUT(multipartRequest(tarballForm()), {
      params: Promise.resolve(params),
    });

    expect(response.status).toBe(404);
    expect(mockUploadTarball).not.toHaveBeenCalled();
  });

  it("returns 412 on revision mismatch before any R2 work", async () => {
    mockIsImmutable.mockResolvedValue(false);
    mockFindModule.mockResolvedValue({
      ...existingModule,
      revision: 9,
    } as never);

    const response = await PUT(multipartRequest(tarballForm()), {
      params: Promise.resolve(params),
    });

    expect(response.status).toBe(412);
    expect(mockUploadTarball).not.toHaveBeenCalled();
  });

  it("returns 428 when If-Match is missing", async () => {
    mockIsImmutable.mockResolvedValue(false);
    const request = new NextRequest("http://localhost/test", {
      method: "PUT",
      body: tarballForm(),
    });

    const response = await PUT(request, { params: Promise.resolve(params) });

    expect(response.status).toBe(428);
    expect(mockUploadTarball).not.toHaveBeenCalled();
  });

  it("returns 400 when the module file is missing", async () => {
    mockIsImmutable.mockResolvedValue(false);
    const form = new FormData();
    form.set("owner", "evilcorp");

    const response = await PUT(multipartRequest(form), {
      params: Promise.resolve(params),
    });

    expect(response.status).toBe(400);
    expect(mockUploadTarball).not.toHaveBeenCalled();
  });
});
