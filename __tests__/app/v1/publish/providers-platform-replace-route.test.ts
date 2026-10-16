import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/middleware", () => ({ requirePublishAuth: vi.fn() }));

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
  findProviderPackage: vi.fn(),
  replaceProviderPlatform: vi.fn(),
}));

vi.mock("@/lib/data/settings", () => ({
  isImmutableUploadsEnabled: vi.fn(),
}));

vi.mock("@/lib/data/audit", () => ({
  buildProviderAuditMetadata: vi.fn((v) => v),
  writeAuditLog: vi.fn(),
}));

vi.mock("@/lib/data/concurrency", () => ({
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
  uploadProviderZip: vi.fn(),
  uploadShasums: vi.fn(),
  uploadShasumsSignature: vi.fn(),
  deleteObject: vi.fn(),
}));

import { PUT } from "@/app/v1/publish/providers/[namespace]/[type]/versions/[version]/platforms/[os]/[arch]/route";
import { requirePublishAuth } from "@/lib/auth/middleware";
import { parseRequiredIfMatch } from "@/lib/api/etag";
import { adminProviderPlatformReplaceBody } from "@/lib/validation/admin";
import {
  findProvider,
  findProviderPackage,
  replaceProviderPlatform,
} from "@/lib/data/providers";
import { isImmutableUploadsEnabled } from "@/lib/data/settings";
import { RevisionConflictError } from "@/lib/data/concurrency";
import {
  uploadProviderZip,
  uploadShasums,
  uploadShasumsSignature,
  deleteObject,
} from "@/lib/storage";

const mockRequirePublishAuth = vi.mocked(requirePublishAuth);
const mockParseRequiredIfMatch = vi.mocked(parseRequiredIfMatch);
const mockAdminProviderPlatformReplaceBody = vi.mocked(
  adminProviderPlatformReplaceBody,
);
const mockFindProvider = vi.mocked(findProvider);
const mockFindProviderPackage = vi.mocked(findProviderPackage);
const mockIsImmutableUploadsEnabled = vi.mocked(isImmutableUploadsEnabled);
const mockReplaceProviderPlatform = vi.mocked(replaceProviderPlatform);
const mockUploadProviderZip = vi.mocked(uploadProviderZip);
const mockUploadShasums = vi.mocked(uploadShasums);
const mockUploadShasumsSignature = vi.mocked(uploadShasumsSignature);
const mockDeleteObject = vi.mocked(deleteObject);

describe("PUT /v1/publish/providers/.../platforms/:os/:arch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePublishAuth.mockResolvedValue({ id: 1 } as never);
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
    mockUploadProviderZip.mockResolvedValue(
      "providers/hashicorp/aws/1.0.0/terraform-provider-aws_1.0.0_linux_amd64.zip",
    );
    mockUploadShasums.mockResolvedValue(
      "providers/hashicorp/aws/1.0.0/SHA256SUMS",
    );
    mockUploadShasumsSignature.mockResolvedValue(
      "providers/hashicorp/aws/1.0.0/SHA256SUMS.sig",
    );
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

describe("PUT /v1/publish/providers/.../platforms (multipart byte path)", () => {
  const params = {
    namespace: "hashicorp",
    type: "aws",
    version: "1.0.0",
    os: "linux",
    arch: "amd64",
  };

  function multipartRequest(form: FormData) {
    return new NextRequest("http://localhost/test", {
      method: "PUT",
      body: form,
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePublishAuth.mockResolvedValue({ id: 1 } as never);
    mockParseRequiredIfMatch.mockReturnValue({ ok: true, revision: 4 });
    mockFindProvider.mockResolvedValue({ id: 11 } as never);
    // Default: platform slot is empty (initial publish) — always allowed.
    mockFindProviderPackage.mockResolvedValue(null as never);
    mockIsImmutableUploadsEnabled.mockResolvedValue(true);
    mockReplaceProviderPlatform.mockResolvedValue({
      provider: { revision: 5 },
      platform: {
        os: "linux",
        arch: "amd64",
        filename: "terraform-provider-aws_1.0.0_linux_amd64.zip",
        shasum:
          "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        location:
          "providers/hashicorp/aws/1.0.0/terraform-provider-aws_1.0.0_linux_amd64.zip",
        shasumUrl: "providers/hashicorp/aws/1.0.0/SHA256SUMS",
        shasumSignatureUrl: "providers/hashicorp/aws/1.0.0/SHA256SUMS.sig",
      },
    } as never);
    mockUploadProviderZip.mockResolvedValue(
      "providers/hashicorp/aws/1.0.0/terraform-provider-aws_1.0.0_linux_amd64.zip",
    );
    mockUploadShasums.mockResolvedValue(
      "providers/hashicorp/aws/1.0.0/SHA256SUMS",
    );
    mockUploadShasumsSignature.mockResolvedValue(
      "providers/hashicorp/aws/1.0.0/SHA256SUMS.sig",
    );
  });

  it("uploads bytes, updates metadata, and bumps revision", async () => {
    const form = new FormData();
    form.set(
      "file",
      new File(["zip-bytes"], "terraform-provider-aws_1.0.0_linux_amd64.zip"),
    );

    const response = await PUT(multipartRequest(form), {
      params: Promise.resolve(params),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("ETag")).toBe('W/"5"');
    expect(mockUploadProviderZip).toHaveBeenCalledWith(
      "hashicorp",
      "aws",
      "1.0.0",
      "linux",
      "amd64",
      expect.anything(),
    );
    expect(mockReplaceProviderPlatform).toHaveBeenCalledWith(
      "hashicorp",
      "aws",
      "1.0.0",
      4,
      expect.objectContaining({
        os: "linux",
        arch: "amd64",
        filename: "terraform-provider-aws_1.0.0_linux_amd64.zip",
      }),
    );
  });

  it("overrides computed shasum from a SHA256SUMS file when present", async () => {
    const overrideSum =
      "abababababababababababababababababababababababababababababababab";
    const form = new FormData();
    form.set(
      "file",
      new File(["zip-bytes"], "terraform-provider-aws_1.0.0_linux_amd64.zip"),
    );
    form.set(
      "sha256sums",
      new File(
        [`${overrideSum}  terraform-provider-aws_1.0.0_linux_amd64.zip\n`],
        "SHA256SUMS",
      ),
    );
    form.set("sha256sums_sig", new File(["sig-bytes"], "SHA256SUMS.sig"));

    const response = await PUT(multipartRequest(form), {
      params: Promise.resolve(params),
    });

    expect(response.status).toBe(200);
    expect(mockUploadShasums).toHaveBeenCalled();
    expect(mockUploadShasumsSignature).toHaveBeenCalled();
    expect(mockReplaceProviderPlatform).toHaveBeenCalledWith(
      "hashicorp",
      "aws",
      "1.0.0",
      4,
      expect.objectContaining({ shasum: overrideSum }),
    );
  });

  it("returns 400 when the zip file is missing", async () => {
    const form = new FormData();
    form.set("sha256sums", new File(["x"], "SHA256SUMS"));

    const response = await PUT(multipartRequest(form), {
      params: Promise.resolve(params),
    });

    expect(response.status).toBe(400);
    expect(mockUploadProviderZip).not.toHaveBeenCalled();
    expect(mockReplaceProviderPlatform).not.toHaveBeenCalled();
  });

  it("returns 400 when Content-Length exceeds the provider zip cap", async () => {
    // Build a raw multipart body so the oversized Content-Length header is not
    // overwritten by the FormData encoder.
    const request = new NextRequest("http://localhost/test", {
      method: "PUT",
      body: "--boundary--\r\n",
      headers: {
        "Content-Type": "multipart/form-data; boundary=boundary",
        "Content-Length": String(64 * 1024 * 1024 + 1),
      },
    });

    const response = await PUT(request, { params: Promise.resolve(params) });

    expect(response.status).toBe(400);
    expect(mockUploadProviderZip).not.toHaveBeenCalled();
  });

  it("returns 428 when If-Match is missing", async () => {
    mockParseRequiredIfMatch.mockReturnValue({ ok: false, reason: "missing" });
    const form = new FormData();
    form.set(
      "file",
      new File(["zip-bytes"], "terraform-provider-aws_1.0.0_linux_amd64.zip"),
    );

    const response = await PUT(multipartRequest(form), {
      params: Promise.resolve(params),
    });

    expect(response.status).toBe(428);
    expect(mockUploadProviderZip).not.toHaveBeenCalled();
  });

  it("returns 412 on revision mismatch and cleans up uploaded R2 objects", async () => {
    mockReplaceProviderPlatform.mockRejectedValue(
      new RevisionConflictError(4, 7),
    );
    const form = new FormData();
    form.set(
      "file",
      new File(["zip-bytes"], "terraform-provider-aws_1.0.0_linux_amd64.zip"),
    );

    const response = await PUT(multipartRequest(form), {
      params: Promise.resolve(params),
    });

    expect(response.status).toBe(412);
    expect(mockDeleteObject).toHaveBeenCalledWith(
      "providers/hashicorp/aws/1.0.0/terraform-provider-aws_1.0.0_linux_amd64.zip",
    );
  });

  it("returns 409 when bytes exist and immutable uploads are enabled", async () => {
    mockIsImmutableUploadsEnabled.mockResolvedValue(true);
    mockFindProviderPackage.mockResolvedValue({
      provider: { id: 11, revision: 4 },
      platform: {
        os: "linux",
        arch: "amd64",
        location:
          "providers/hashicorp/aws/1.0.0/terraform-provider-aws_1.0.0_linux_amd64.zip",
      },
      gpgKeys: [],
    } as never);

    const form = new FormData();
    form.set(
      "file",
      new File(["zip-bytes"], "terraform-provider-aws_1.0.0_linux_amd64.zip"),
    );

    const response = await PUT(multipartRequest(form), {
      params: Promise.resolve(params),
    });

    expect(response.status).toBe(409);
    expect(mockUploadProviderZip).not.toHaveBeenCalled();
    expect(mockReplaceProviderPlatform).not.toHaveBeenCalled();
  });

  it("overwrites existing bytes when immutable uploads are disabled", async () => {
    mockIsImmutableUploadsEnabled.mockResolvedValue(false);
    mockFindProviderPackage.mockResolvedValue({
      provider: { id: 11, revision: 4 },
      platform: {
        os: "linux",
        arch: "amd64",
        // Same key as the new upload → no orphan cleanup expected.
        location:
          "providers/hashicorp/aws/1.0.0/terraform-provider-aws_1.0.0_linux_amd64.zip",
      },
      gpgKeys: [],
    } as never);

    const form = new FormData();
    form.set(
      "file",
      new File(["zip-bytes"], "terraform-provider-aws_1.0.0_linux_amd64.zip"),
    );

    const response = await PUT(multipartRequest(form), {
      params: Promise.resolve(params),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("ETag")).toBe('W/"5"');
    expect(mockReplaceProviderPlatform).toHaveBeenCalled();
    // Same key — R2 put overwrote in place, no delete.
    expect(mockDeleteObject).not.toHaveBeenCalled();
  });

  it("preserves existing shasum URLs when replace omits shasums files (GPG chain)", async () => {
    // Per-platform byte replace with no sha256sums/sig files must carry the
    // version-level SHA256SUMS / SHA256SUMS.sig pointers forward, never null
    // them out — they underpin Terraform's GPG verification chain.
    mockIsImmutableUploadsEnabled.mockResolvedValue(false);
    mockFindProviderPackage.mockResolvedValue({
      provider: { id: 11, revision: 4 },
      platform: {
        os: "linux",
        arch: "amd64",
        location:
          "providers/hashicorp/aws/1.0.0/terraform-provider-aws_1.0.0_linux_amd64.zip",
        shasumUrl: "providers/hashicorp/aws/1.0.0/SHA256SUMS",
        shasumSignatureUrl: "providers/hashicorp/aws/1.0.0/SHA256SUMS.sig",
      },
      gpgKeys: [],
    } as never);

    const form = new FormData();
    form.set(
      "file",
      new File(["zip-bytes"], "terraform-provider-aws_1.0.0_linux_amd64.zip"),
    );

    const response = await PUT(multipartRequest(form), {
      params: Promise.resolve(params),
    });

    expect(response.status).toBe(200);
    expect(mockUploadShasums).not.toHaveBeenCalled();
    expect(mockUploadShasumsSignature).not.toHaveBeenCalled();
    expect(mockReplaceProviderPlatform).toHaveBeenCalledWith(
      "hashicorp",
      "aws",
      "1.0.0",
      4,
      expect.objectContaining({
        shasumUrl: "providers/hashicorp/aws/1.0.0/SHA256SUMS",
        shasumSignatureUrl: "providers/hashicorp/aws/1.0.0/SHA256SUMS.sig",
      }),
    );
  });

  it("deletes the orphaned old object when the key changed on overwrite", async () => {
    mockIsImmutableUploadsEnabled.mockResolvedValue(false);
    mockFindProviderPackage.mockResolvedValue({
      provider: { id: 11, revision: 4 },
      platform: {
        os: "linux",
        arch: "amd64",
        location: "providers/hashicorp/aws/1.0.0/legacy-old-key.zip",
      },
      gpgKeys: [],
    } as never);

    const form = new FormData();
    form.set(
      "file",
      new File(["zip-bytes"], "terraform-provider-aws_1.0.0_linux_amd64.zip"),
    );

    const response = await PUT(multipartRequest(form), {
      params: Promise.resolve(params),
    });

    expect(response.status).toBe(200);
    expect(mockDeleteObject).toHaveBeenCalledWith(
      "providers/hashicorp/aws/1.0.0/legacy-old-key.zip",
    );
  });
});
