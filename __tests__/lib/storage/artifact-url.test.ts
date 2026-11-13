import { describe, it, expect, vi, afterEach } from "vitest";

import { artifactUrl, offloadedArtifact } from "@/lib/storage/artifact-url";

const KEY = "providers/acme/cloudflare/1.0.0/terraform-provider-cloudflare_1.0.0_darwin_arm64.zip";

afterEach(() => vi.unstubAllEnvs());

describe("artifactUrl", () => {
  it("prefers R2_PUBLIC_BASE_URL and tolerates a trailing slash", async () => {
    vi.stubEnv("R2_PUBLIC_BASE_URL", "https://artifacts.example.test/");
    vi.stubEnv("R2_ACCESS_KEY_ID", "AKIDEXAMPLE");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "secret");
    vi.stubEnv("R2_ACCOUNT_ID", "acct");
    expect(await artifactUrl(KEY)).toBe(`https://artifacts.example.test/${KEY}`);
  });

  it("presigns a short-lived GET against the account's R2 endpoint", async () => {
    vi.stubEnv("R2_ACCESS_KEY_ID", "AKIDEXAMPLE");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "secret");
    vi.stubEnv("R2_ACCOUNT_ID", "acct");
    vi.stubEnv("R2_BUCKET_NAME", "bucket");
    const url = new URL((await artifactUrl(KEY))!);
    expect(url.host).toBe("bucket.acct.r2.cloudflarestorage.com");
    expect(url.pathname).toBe(`/${KEY}`);
    expect(url.searchParams.get("X-Amz-Expires")).toBe("600");
    expect(url.searchParams.get("X-Amz-Credential")).toMatch(/^AKIDEXAMPLE\/\d{8}\/auto\/s3\/aws4_request$/);
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns null without a public URL or complete credentials", async () => {
    vi.stubEnv("R2_ACCESS_KEY_ID", "AKIDEXAMPLE");
    expect(await artifactUrl(KEY)).toBeNull();
  });
});

describe("offloadedArtifact", () => {
  it("does nothing unless CLOUDFLARE_WORKERS_FREE_TIER is true", async () => {
    vi.stubEnv("R2_PUBLIC_BASE_URL", "https://artifacts.example.test");
    expect(await offloadedArtifact(KEY)).toBeNull();
  });

  it("falls back to streaming and warns when free tier has no offload configured", async () => {
    vi.stubEnv("CLOUDFLARE_WORKERS_FREE_TIER", "true");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await offloadedArtifact(KEY)).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
  });
});
