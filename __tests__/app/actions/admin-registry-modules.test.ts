import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetAuth = vi.fn();
const mockFindModule = vi.fn();
const mockSaveModule = vi.fn();
const mockUploadModuleTarball = vi.fn();
const mockDeleteObject = vi.fn();
const mockConditionalModuleUpdate = vi.fn();
const mockConditionalModuleDelete = vi.fn();
const mockCreateModuleAlias = vi.fn();
const mockValidateModuleAliasCreateConstraints = vi.fn();

const { MockRevisionConflictError } = vi.hoisted(() => {
  class RevisionConflictErrorForTest extends Error {
    readonly expectedRevision: number;
    readonly currentRevision: number | null;

    constructor(expectedRevision: number, currentRevision: number | null) {
      super("revision conflict");
      this.expectedRevision = expectedRevision;
      this.currentRevision = currentRevision;
    }
  }

  return { MockRevisionConflictError: RevisionConflictErrorForTest };
});

vi.mock("@/lib/auth/get-auth", () => ({
  getAuth: () => mockGetAuth(),
}));

vi.mock("@/lib/data/modules", () => ({
  browseModules: vi.fn(),
  findModule: (...args: unknown[]) => mockFindModule(...args),
  getModuleVersions: vi.fn(),
  parseTags: vi.fn(() => []),
  saveModule: (...args: unknown[]) => mockSaveModule(...args),
}));

vi.mock("@/lib/storage", () => ({
  uploadModuleTarball: (...args: unknown[]) => mockUploadModuleTarball(...args),
  deleteObject: (...args: unknown[]) => mockDeleteObject(...args),
}));

vi.mock("@/lib/data/concurrency", () => ({
  conditionalModuleUpdate: (...args: unknown[]) =>
    mockConditionalModuleUpdate(...args),
  conditionalModuleDelete: (...args: unknown[]) =>
    mockConditionalModuleDelete(...args),
  RevisionConflictError: MockRevisionConflictError,
}));

vi.mock("@/lib/data/aliases", () => ({
  createModuleAlias: (...args: unknown[]) => mockCreateModuleAlias(...args),
  validateModuleAliasCreateConstraints: (...args: unknown[]) =>
    mockValidateModuleAliasCreateConstraints(...args),
}));

vi.mock("@/db/client", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/db/schema", () => ({
  modules: {},
}));

import {
  createModuleAction,
  deleteModuleVersionAction,
  editModuleMetadataAction,
  renameModuleAction,
} from "@/app/actions/admin-modules";

describe("admin module registry actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuth.mockResolvedValue({ user: { role: "admin" } });
    mockValidateModuleAliasCreateConstraints.mockResolvedValue({ ok: true });
  });

  it("returns validation error when creating module without artifact", async () => {
    const result = await createModuleAction({
      namespace: "hashicorp",
      name: "consul",
      provider: "aws",
      version: "1.0.0",
      description: "",
      source: "",
      owner: "hashicorp",
      tags: "aws",
      artifact: null,
    });

    expect(result).toEqual({
      success: false,
      code: "VALIDATION",
      error: "Module archive is required",
    });
    expect(mockUploadModuleTarball).not.toHaveBeenCalled();
  });

  it("returns conflict when creating an existing module version", async () => {
    mockFindModule.mockResolvedValue({ id: 10 });

    const artifact = new File(["tgz"], "module.tgz", {
      type: "application/gzip",
    });

    const result = await createModuleAction({
      namespace: "hashicorp",
      name: "consul",
      provider: "aws",
      version: "1.0.0",
      description: "desc",
      source: "src",
      owner: "owner",
      tags: "aws",
      artifact,
    });

    expect(result).toEqual({
      success: false,
      code: "CONFLICT",
      error: "Module version already exists",
    });
    expect(mockUploadModuleTarball).not.toHaveBeenCalled();
  });

  it("maps stale revision conflict from edit to UI-safe conflict payload", async () => {
    mockConditionalModuleUpdate.mockRejectedValue(
      new MockRevisionConflictError(3, 8),
    );

    const result = await editModuleMetadataAction(
      "hashicorp",
      "consul",
      "aws",
      {
        version: "1.0.0",
        description: "new",
        source: "src",
        owner: "owner",
        tags: "aws,gcp",
      },
      3,
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe("CONFLICT");
    expect(result.error).toContain("changed by another admin");
    expect(result.conflict).toEqual({
      expectedRevision: 3,
      currentRevision: 8,
    });
  });

  it("maps stale revision conflict from delete to UI-safe conflict payload", async () => {
    mockFindModule.mockResolvedValue({ location: "modules/path.tgz" });
    mockConditionalModuleDelete.mockRejectedValue(
      new MockRevisionConflictError(4, 9),
    );

    const result = await deleteModuleVersionAction(
      "hashicorp",
      "consul",
      "aws",
      "1.0.0",
      4,
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe("CONFLICT");
    expect(result.conflict).toEqual({
      expectedRevision: 4,
      currentRevision: 9,
    });
  });

  it("returns not found when deleting an unknown module version", async () => {
    mockFindModule.mockResolvedValue(null);

    const result = await deleteModuleVersionAction(
      "hashicorp",
      "consul",
      "aws",
      "9.9.9",
      1,
    );

    expect(result).toEqual({
      success: false,
      code: "NOT_FOUND",
      error: "Module version not found",
    });
    expect(mockConditionalModuleDelete).not.toHaveBeenCalled();
  });

  it("validates rename alias constraints before creating alias", async () => {
    mockValidateModuleAliasCreateConstraints.mockResolvedValue({
      ok: false,
      code: "TARGET_NOT_FOUND",
      message: "Alias target must be an existing canonical module",
    });

    const result = await renameModuleAction("old-ns", "old-name", "aws", {
      namespace: "new-ns",
      name: "new-name",
      provider: "aws",
    });

    expect(result).toEqual({
      success: false,
      code: "NOT_FOUND",
      error: "Alias target must be an existing canonical module",
    });
    expect(mockCreateModuleAlias).not.toHaveBeenCalled();
  });
});
