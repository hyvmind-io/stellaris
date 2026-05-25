import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { middleware } from "@/middleware";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { CF_ACCESS_JWT_HEADER } from "@/lib/auth/cf-access-config";

// process.env entries pinned via wrangler `vars` get narrowed to their literal
// production values by `wrangler types`, which blocks assignment of different
// strings and `delete` in tests. Cast through a wider record type so the
// narrowing doesn't reach the test code.
const env = process.env as unknown as Record<string, string | undefined>;

const TEST_SECRET = "test-secret-minimum-32-characters-long!!";

async function buildSessionCookie(): Promise<string> {
  const encoded = new TextEncoder().encode(TEST_SECRET);
  return new SignJWT({ sub: "test-session-id" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(encoded);
}

interface MakeOpts {
  cookie?: string;
  accessJwt?: string;
}

function make(path: string, opts: MakeOpts = {}): NextRequest {
  const headers: Record<string, string> = {};
  if (opts.accessJwt) headers[CF_ACCESS_JWT_HEADER] = opts.accessJwt;

  const req = new NextRequest(`http://localhost${path}`, { headers });
  if (opts.cookie) req.cookies.set(SESSION_COOKIE_NAME, opts.cookie);
  return req;
}

beforeEach(() => {
  env.AUTH_SESSION_SECRET = TEST_SECRET;
  env.PRIVATE_REGISTRY = "true";
  // Default off — individual tests enable as needed.
  delete env.CF_ACCESS_AUTH_ENABLED;
  delete env.CF_ACCESS_AUD;
  delete env.CF_ACCESS_TEAM_DOMAIN;
});

describe("middleware — CF Access bridging", () => {
  it("redirects to /login when Access is disabled and no cookie is present", async () => {
    const res = await middleware(make("/admin"));
    expect(res.status).toBe(307); // NextResponse.redirect default
    expect(res.headers.get("location")).toContain("/login");
  });

  it("does NOT bridge when CF_ACCESS_AUTH_ENABLED is false even if header present", async () => {
    const res = await middleware(
      make("/admin", { accessJwt: "some.jwt.value" }),
    );
    expect(res.headers.get("location")).toContain("/login");
    expect(res.headers.get("location")).not.toContain(
      "/api/auth/cf-access-bridge",
    );
  });

  it("redirects to the bridge when Access is enabled, header present, no cookie", async () => {
    env.CF_ACCESS_AUTH_ENABLED = "true";
    env.CF_ACCESS_AUD = "abc";
    env.CF_ACCESS_TEAM_DOMAIN = "example.cloudflareaccess.com";

    const res = await middleware(
      make("/modules?foo=bar", { accessJwt: "any.jwt.value" }),
    );
    const location = res.headers.get("location");
    expect(location).toContain("/api/auth/cf-access-bridge");
    expect(location).toContain(
      `next=${encodeURIComponent("/modules?foo=bar")}`,
    );
  });

  it("prefers the cookie session over Access bridging (cheaper path)", async () => {
    env.CF_ACCESS_AUTH_ENABLED = "true";
    env.CF_ACCESS_AUD = "abc";
    env.CF_ACCESS_TEAM_DOMAIN = "example.cloudflareaccess.com";

    const cookie = await buildSessionCookie();
    const res = await middleware(
      make("/admin", { cookie, accessJwt: "any.jwt.value" }),
    );
    // No redirect, just continue
    expect(res.headers.get("location")).toBeNull();
  });

  it("does not bridge when header is absent even if Access is enabled", async () => {
    env.CF_ACCESS_AUTH_ENABLED = "true";
    env.CF_ACCESS_AUD = "abc";
    env.CF_ACCESS_TEAM_DOMAIN = "example.cloudflareaccess.com";

    const res = await middleware(make("/admin"));
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/login");
    expect(location).not.toContain("/api/auth/cf-access-bridge");
  });

  it("never bridges or redirects auth pages — they stay reachable", async () => {
    env.CF_ACCESS_AUTH_ENABLED = "true";
    env.CF_ACCESS_AUD = "abc";
    env.CF_ACCESS_TEAM_DOMAIN = "example.cloudflareaccess.com";

    const res = await middleware(
      make("/login", { accessJwt: "any.jwt.value" }),
    );
    // Login is public — request just continues
    expect(res.headers.get("location")).toBeNull();
  });
});
