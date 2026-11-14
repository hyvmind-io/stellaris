import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/middleware", () => ({ requireAuth: vi.fn() }));
vi.mock("@/lib/data/aliases", () => ({
  resolveProviderCoordinates: vi.fn(async (namespace: string, type: string) => ({ namespace, type, aliased: false })),
  resolveCanonicalModuleCoordinates: vi.fn(async (namespace: string, name: string, provider: string) => ({ namespace, name, provider })),
}));
vi.mock("@/lib/data/providers", () => ({ findProviderPackage: vi.fn() }));
vi.mock("@/lib/data/modules", () => ({ resolveModule: vi.fn(), incrementModuleDownloads: vi.fn() }));
vi.mock("@/lib/upstream/proxy", () => ({ proxyProviderJson: vi.fn(), proxyModuleJson: vi.fn() }));

import { requireAuth } from "@/lib/auth/middleware";
import { findProviderPackage } from "@/lib/data/providers";
import { incrementModuleDownloads, resolveModule } from "@/lib/data/modules";
import { GET as providerDownload } from "@/app/v1/providers/[namespace]/[type]/[version]/download/[os]/[arch]/route";
import { GET as moduleDownload } from "@/app/v1/modules/[namespace]/[name]/[system]/[version]/download/route";

const R2 = "https://artifacts.example.test";

const providerParams = { namespace: "acme", type: "cloudflare", version: "1.0.0", os: "darwin", arch: "arm64" };
const moduleParams = { namespace: "acme", name: "vpc", system: "aws", version: "1.0.0" };

function req(path: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, { headers: { Authorization: "Bearer stlr_x" } });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue({ id: 1, permissions: ["admin"] } as never);
  vi.mocked(findProviderPackage).mockResolvedValue({
    provider: { protocols: ["6.0"] },
    platform: { os: "darwin", arch: "arm64", filename: "terraform-provider-cloudflare_1.0.0_darwin_arm64.zip", shasum: "abc" },
    gpgKeys: [],
  } as never);
  vi.mocked(resolveModule).mockResolvedValue({
    namespace: "acme",
    name: "vpc",
    provider: "aws",
    version: "1.0.0",
    location: "acme/vpc/aws/1.0.0.tar.gz",
  } as never);
});

afterEach(() => vi.unstubAllEnvs());

describe("provider package lookup", () => {
  it("keeps Worker-relative artifact URLs when the free-tier flag is off", async () => {
    vi.stubEnv("R2_PUBLIC_BASE_URL", R2);
    const res = await providerDownload(req("/x"), { params: Promise.resolve(providerParams) });
    const body = (await res.json()) as Record<string, string>;
    expect(body.download_url).toBe("/v1/providers/acme/cloudflare/1.0.0/download/darwin/arm64/zip");
    expect(body.shasums_url).toBe("/v1/providers/acme/cloudflare/1.0.0/sha256sums");
    expect(body.shasums_signature_url).toBe("/v1/providers/acme/cloudflare/1.0.0/sha256sums.sig");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns R2 URLs for the zip, SHA256SUMS and signature on the free tier", async () => {
    vi.stubEnv("CLOUDFLARE_WORKERS_FREE_TIER", "true");
    vi.stubEnv("R2_PUBLIC_BASE_URL", R2);
    const res = await providerDownload(req("/x"), { params: Promise.resolve(providerParams) });
    const body = (await res.json()) as Record<string, string>;
    expect(body.download_url).toBe(
      `${R2}/providers/acme/cloudflare/1.0.0/terraform-provider-cloudflare_1.0.0_darwin_arm64.zip`,
    );
    expect(body.shasums_url).toBe(`${R2}/providers/acme/cloudflare/1.0.0/SHA256SUMS`);
    expect(body.shasums_signature_url).toBe(`${R2}/providers/acme/cloudflare/1.0.0/SHA256SUMS.sig`);
  });
});

describe("module download", () => {
  it("counts the download once for an existing module", async () => {
    await moduleDownload(req("/x"), { params: Promise.resolve(moduleParams) });
    expect(incrementModuleDownloads).toHaveBeenCalledExactlyOnceWith("acme", "vpc", "aws", "1.0.0");
  });

  it("does not count a module that does not exist", async () => {
    vi.mocked(resolveModule).mockResolvedValue(undefined as never);
    const res = await moduleDownload(req("/x"), { params: Promise.resolve(moduleParams) });
    expect(res.status).toBe(404);
    expect(incrementModuleDownloads).not.toHaveBeenCalled();
  });

  it("still answers when the counter write fails", async () => {
    vi.mocked(incrementModuleDownloads).mockRejectedValue(new Error("D1 down"));
    const res = await moduleDownload(req("/x"), { params: Promise.resolve(moduleParams) });
    expect(res.status).toBe(200);
  });

  it("points location at the Worker tarball route when the flag is off", async () => {
    const res = await moduleDownload(req("/x"), { params: Promise.resolve(moduleParams) });
    expect(res.headers.get("X-Terraform-Get")).toBe("/v1/modules/tarball/acme/vpc/aws/1.0.0.tar.gz");
  });

  it("points location at R2 on the free tier", async () => {
    vi.stubEnv("CLOUDFLARE_WORKERS_FREE_TIER", "true");
    vi.stubEnv("R2_PUBLIC_BASE_URL", R2);
    const res = await moduleDownload(req("/x"), { params: Promise.resolve(moduleParams) });
    expect(res.headers.get("X-Terraform-Get")).toBe(`${R2}/acme/vpc/aws/1.0.0.tar.gz`);
    expect(((await res.json()) as { location: string }).location).toBe(`${R2}/acme/vpc/aws/1.0.0.tar.gz`);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
