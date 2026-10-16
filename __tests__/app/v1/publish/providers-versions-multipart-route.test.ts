import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/middleware", () => ({ requirePublishAuth: vi.fn() }));

vi.mock("@/lib/data/providers", () => ({
  findProvider: vi.fn(),
  saveProvider: vi.fn(),
}));

vi.mock("@/lib/data/audit", () => ({
  buildProviderAuditMetadata: vi.fn((v) => v),
  writeAuditLog: vi.fn(),
}));

vi.mock("@/lib/data/errors", () => ({
  isUniqueConstraintError: vi.fn(() => false),
}));

vi.mock("@/lib/storage", () => ({
  uploadShasums: vi.fn(),
  uploadShasumsSignature: vi.fn(),
  deleteObject: vi.fn(),
}));

// NOTE: validation schemas are NOT mocked here — the multipart create path
// exercises the real `adminProviderCreateMultipartBody` schema.

import { POST } from "@/app/v1/publish/providers/[namespace]/[type]/versions/route";
import { requirePublishAuth } from "@/lib/auth/middleware";
import { findProvider, saveProvider } from "@/lib/data/providers";
import { uploadShasums, uploadShasumsSignature } from "@/lib/storage";

const mockRequirePublishAuth = vi.mocked(requirePublishAuth);
const mockFindProvider = vi.mocked(findProvider);
const mockSaveProvider = vi.mocked(saveProvider);
const mockUploadShasums = vi.mocked(uploadShasums);
const mockUploadShasumsSignature = vi.mocked(uploadShasumsSignature);

describe("POST /v1/publish/providers/:namespace/:type/versions (multipart)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePublishAuth.mockResolvedValue({ id: 1 } as never);
    mockFindProvider.mockResolvedValue(undefined);
    mockSaveProvider.mockResolvedValue({ revision: 1 } as never);
    mockUploadShasums.mockResolvedValue(
      "providers/myorg/custom/1.0.0/SHA256SUMS",
    );
    mockUploadShasumsSignature.mockResolvedValue(
      "providers/myorg/custom/1.0.0/SHA256SUMS.sig",
    );
  });

  it("creates a version and uploads SHA256SUMS + signature", async () => {
    const form = new FormData();
    form.set("version", "1.0.0");
    form.set("protocols", JSON.stringify(["6.0"]));
    form.set(
      "gpg_public_keys",
      JSON.stringify([
        { key_id: "ABCD1234", ascii_armor: "PGP", source: "myorg" },
      ]),
    );
    form.set("SHA256SUMS", new File(["sums"], "SHA256SUMS"));
    form.set("SHA256SUMS.sig", new File(["sig"], "SHA256SUMS.sig"));

    const request = new NextRequest("http://localhost/test", {
      method: "POST",
      body: form,
    });

    const response = await POST(request, {
      params: Promise.resolve({ namespace: "myorg", type: "custom" }),
    });

    expect(response.status).toBe(201);
    expect(response.headers.get("ETag")).toBe('W/"1"');
    expect(mockUploadShasums).toHaveBeenCalledWith(
      "myorg",
      "custom",
      "1.0.0",
      "sums",
    );
    expect(mockUploadShasumsSignature).toHaveBeenCalled();
    expect(mockSaveProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: "myorg",
        type: "custom",
        version: "1.0.0",
        protocols: ["6.0"],
        platforms: [],
      }),
    );
  });

  it("returns 422 when protocols are missing", async () => {
    const form = new FormData();
    form.set("version", "1.0.0");
    form.set(
      "gpg_public_keys",
      JSON.stringify([{ key_id: "ABCD1234", ascii_armor: "PGP" }]),
    );

    const request = new NextRequest("http://localhost/test", {
      method: "POST",
      body: form,
    });

    const response = await POST(request, {
      params: Promise.resolve({ namespace: "myorg", type: "custom" }),
    });

    expect(response.status).toBe(422);
    expect(mockSaveProvider).not.toHaveBeenCalled();
  });

  it("returns 409 when the version already exists", async () => {
    mockFindProvider.mockResolvedValue({ id: 1 } as never);
    const form = new FormData();
    form.set("version", "1.0.0");
    form.set("protocols", JSON.stringify(["6.0"]));
    form.set(
      "gpg_public_keys",
      JSON.stringify([{ key_id: "ABCD1234", ascii_armor: "PGP" }]),
    );

    const request = new NextRequest("http://localhost/test", {
      method: "POST",
      body: form,
    });

    const response = await POST(request, {
      params: Promise.resolve({ namespace: "myorg", type: "custom" }),
    });

    expect(response.status).toBe(409);
    expect(mockSaveProvider).not.toHaveBeenCalled();
  });
});
