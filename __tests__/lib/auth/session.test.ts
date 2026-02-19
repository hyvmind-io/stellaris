import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks — must be hoisted before any import of the module under test
// ============================================================================

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/db/schema", () => ({ sessions: {}, users: {} }));
vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn(), gt: vi.fn() }));

import { verifySessionToken } from "@/lib/auth/session";

// ============================================================================
// Helpers
// ============================================================================

/** Build a JWT signed with the given secret (defaults to the test secret). */
async function buildToken(
  claims: Record<string, unknown>,
  secret: string,
  options: { expirationTime?: string; skipExpiration?: boolean } = {},
): Promise<string> {
  const { SignJWT } = await import("jose");
  const encoded = new TextEncoder().encode(secret);
  let builder = new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt();
  if (!options.skipExpiration) {
    builder = builder.setExpirationTime(options.expirationTime ?? "1h");
  }
  return builder.sign(encoded);
}

const TEST_SECRET = "test-secret-minimum-32-characters-long!!";

// ============================================================================
// verifySessionToken
// ============================================================================

describe("verifySessionToken", () => {
  beforeEach(() => {
    process.env.AUTH_SESSION_SECRET = TEST_SECRET;
    vi.clearAllMocks();
  });

  it("returns null for an empty string token", async () => {
    const result = await verifySessionToken("");
    expect(result).toBeNull();
  });

  it("returns null for a malformed token", async () => {
    const result = await verifySessionToken("not.a.jwt");
    expect(result).toBeNull();
  });

  it("returns null for a token signed with wrong secret", async () => {
    const token = await buildToken(
      { sub: "session-abc" },
      "completely-different-secret-that-is-long-enough-x",
    );
    const result = await verifySessionToken(token);
    expect(result).toBeNull();
  });

  it("returns the session ID (sub claim) for a valid token", async () => {
    const token = await buildToken({ sub: "test-session-id" }, TEST_SECRET);
    const result = await verifySessionToken(token);
    expect(result).toBe("test-session-id");
  });

  it("returns null for an expired token", async () => {
    const { SignJWT } = await import("jose");
    const encoded = new TextEncoder().encode(TEST_SECRET);
    // Set iat in the past and exp already passed
    const token = await new SignJWT({ sub: "expired-session" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200) // issued 2h ago
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600) // expired 1h ago
      .sign(encoded);
    const result = await verifySessionToken(token);
    expect(result).toBeNull();
  });

  it("returns null for a token with no sub claim", async () => {
    // Build a valid JWT with custom claims but deliberately omit sub
    const token = await buildToken(
      { userId: "u_123", role: "admin" },
      TEST_SECRET,
    );
    const result = await verifySessionToken(token);
    // payload.sub is undefined → returns null
    expect(result).toBeNull();
  });
});
