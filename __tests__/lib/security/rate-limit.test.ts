import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const limit = vi.fn();
const cloudflareEnv: Record<string, unknown> = {};

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({ env: cloudflareEnv }),
}));
vi.mock("@/lib/auth/api-keys", () => ({ validateApiKey: vi.fn() }));

import { validateApiKey } from "@/lib/auth/api-keys";
import { requireAuth } from "@/lib/auth/middleware";
import { allowRequest, clientIp } from "@/lib/security/rate-limit";

const mockValidateApiKey = vi.mocked(validateApiKey);

function request(headers: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/v1/modules", { headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  delete cloudflareEnv.API_RATE_LIMITER;
});

describe("clientIp", () => {
  it("uses CF-Connecting-IP and ignores a spoofed X-Forwarded-For", () => {
    const headers = new Headers({ "CF-Connecting-IP": "203.0.113.7", "X-Forwarded-For": "1.2.3.4" });
    expect(clientIp(headers)).toBe("203.0.113.7");
  });

  it("never falls back to X-Forwarded-For", () => {
    expect(clientIp(new Headers({ "X-Forwarded-For": "1.2.3.4" }))).toBe("unknown");
  });
});

describe("allowRequest", () => {
  it("allows when the binding is not configured", async () => {
    expect(await allowRequest("API_RATE_LIMITER", "api:x")).toBe(true);
  });

  it("returns the binding's decision for the given key", async () => {
    cloudflareEnv.API_RATE_LIMITER = { limit };
    limit.mockResolvedValue({ success: false });
    expect(await allowRequest("API_RATE_LIMITER", "api:203.0.113.7")).toBe(false);
    expect(limit).toHaveBeenCalledWith({ key: "api:203.0.113.7" });
  });
});

describe("requireAuth rate limiting", () => {
  it("answers 429 before looking the key up in D1", async () => {
    cloudflareEnv.API_RATE_LIMITER = { limit };
    limit.mockResolvedValue({ success: false });

    const result = await requireAuth(
      request({ Authorization: "Bearer stlr_any", "CF-Connecting-IP": "203.0.113.7" }),
    );

    expect((result as Response).status).toBe(429);
    expect((result as Response).headers.get("Retry-After")).toBe("60");
    expect(mockValidateApiKey).not.toHaveBeenCalled();
    expect(limit).toHaveBeenCalledWith({ key: "api:203.0.113.7" });
  });
});
