import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetAuth = vi.fn();
const mockFindProvider = vi.fn();
const mockConditionalProviderUpdate = vi.fn();
const mockConditionalDeleteProvider = vi.fn();
const mockReplaceProviderPlatform = vi.fn();
const mockUploadProviderZip = vi.fn();
const mockDeleteByPrefix = vi.fn();
const mockCreateProviderAlias = vi.fn();
const mockValidateProviderAliasCreateConstraints = vi.fn();

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

vi.mock("@/lib/data/providers", () => ({
  browseProviders: vi.fn(),
  conditionalDeleteProvider: (...args: unknown[]) =>
    mockConditionalDeleteProvider(...args),
  findProvider: (...args: unknown[]) => mockFindProvider(...args),
  getProviderGpgKeys: vi.fn(),
  getProviderPlatforms: vi.fn(),
  getProviderVersions: vi.fn(),
  replaceProviderPlatform: (...args: unknown[]) =>
    mockReplaceProviderPlatform(...args),
  saveProvider: vi.fn(),
}));

vi.mock("@/lib/storage", () => ({
  uploadProviderZip: (...args: unknown[]) => mockUploadProviderZip(...args),
  uploadShasums: vi.fn(),
  uploadShasumsSignature: vi.fn(),
  deleteByPrefix: (...args: unknown[]) => mockDeleteByPrefix(...args),
}));

vi.mock("@/lib/data/concurrency", () => ({
  conditionalProviderUpdate: (...args: unknown[]) =>
    mockConditionalProviderUpdate(...args),
  RevisionConflictError: MockRevisionConflictError,
}));

vi.mock("@/lib/data/aliases", () => ({
  createProviderAlias: (...args: unknown[]) => mockCreateProviderAlias(...args),
  validateProviderAliasCreateConstraints: (...args: unknown[]) =>
    mockValidateProviderAliasCreateConstraints(...args),
}));

vi.mock("@/db/client", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/db/schema", () => ({
  providers: {},
}));

import {
  createProviderAction,
  deleteProviderVersionAction,
  editProviderMetadataAction,
  renameProviderAction,
  replaceProviderArtifactAction,
} from "@/app/actions/admin-providers";

describe("admin provider registry actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuth.mockResolvedValue({ user: { role: "admin" } });
    mockValidateProviderAliasCreateConstraints.mockResolvedValue({ ok: true });
  });

  it("returns validation error when creating provider without artifact", async () => {
    const result = await createProviderAction({
      namespace: "hashicorp",
      type: "aws",
      version: "1.0.0",
      os: "linux",
      arch: "amd64",
      protocols: "5.0",
      gpgKeyId: "key",
      gpgAsciiArmor: "armor",
      gpgSource: "source",
      gpgSourceUrl: "",
      artifact: null,
      shasumFile: null,
      shasumSigFile: null,
    });

    expect(result).toEqual({
      success: false,
      code: "VALIDATION",
      error: "Provider archive is required",
    });
    expect(mockUploadProviderZip).not.toHaveBeenCalled();
  });

  it("returns conflict when provider version already exists", async () => {
    mockFindProvider.mockResolvedValue({ id: 12 });

    const artifact = new File(["zip"], "terraform-provider-aws.zip");
    const result = await createProviderAction({
      namespace: "hashicorp",
      type: "aws",
      version: "1.0.0",
      os: "linux",
      arch: "amd64",
      protocols: "5.0",
      gpgKeyId: "key",
      gpgAsciiArmor: "armor",
      gpgSource: "source",
      gpgSourceUrl: "",
      artifact,
      shasumFile: null,
      shasumSigFile: null,
    });

    expect(result).toEqual({
      success: false,
      code: "CONFLICT",
      error: "Provider version already exists",
    });
  });

  it("maps edit conflict into explicit stale revision payload", async () => {
    mockConditionalProviderUpdate.mockRejectedValue(
      new MockRevisionConflictError(7, 11),
    );

    const result = await editProviderMetadataAction(
      "hashicorp",
      "aws",
      { version: "1.0.0", protocols: "5.0" },
      7,
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe("CONFLICT");
    expect(result.error).toContain("changed by another admin");
    expect(result.conflict).toEqual({
      expectedRevision: 7,
      currentRevision: 11,
    });
  });

  it("returns not found when provider version delete target is missing", async () => {
    mockFindProvider.mockResolvedValue(undefined);

    const result = await deleteProviderVersionAction(
      "hashicorp",
      "aws",
      "9.9.9",
      2,
    );

    expect(result).toEqual({
      success: false,
      code: "NOT_FOUND",
      error: "Provider version not found",
    });
    expect(mockDeleteByPrefix).not.toHaveBeenCalled();
  });

  it("maps artifact replacement conflict to stale revision response", async () => {
    mockUploadProviderZip.mockResolvedValue(
      "providers/hashicorp/aws/1.0.0/file.zip",
    );
    mockReplaceProviderPlatform.mockRejectedValue(
      new MockRevisionConflictError(5, 6),
    );

    const artifact = new File(["zip-content"], "terraform-provider-aws.zip");

    const result = await replaceProviderArtifactAction({
      namespace: "hashicorp",
      type: "aws",
      version: "1.0.0",
      os: "linux",
      arch: "amd64",
      artifact,
      expectedRevision: 5,
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe("CONFLICT");
    expect(result.conflict).toEqual({
      expectedRevision: 5,
      currentRevision: 6,
    });
  });

  it("validates provider rename alias constraints before creating alias", async () => {
    mockValidateProviderAliasCreateConstraints.mockResolvedValue({
      ok: false,
      code: "TARGET_IS_ALIAS",
      message: "Alias target must be canonical (alias-to-alias is not allowed)",
    });

    const result = await renameProviderAction("old-ns", "old-type", {
      namespace: "new-ns",
      type: "new-type",
    });

    expect(result).toEqual({
      success: false,
      code: "VALIDATION",
      error: "Alias target must be canonical (alias-to-alias is not allowed)",
    });
    expect(mockCreateProviderAlias).not.toHaveBeenCalled();
  });
});
