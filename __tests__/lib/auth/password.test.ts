import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, dummyVerify } from "@/lib/auth/password";

// ============================================================================
// hashPassword
// ============================================================================

describe("hashPassword", () => {
  it("returns a v1 formatted hash string", async () => {
    const hash = await hashPassword("my-password");
    expect(hash).toMatch(/^v1:\d+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
  });

  it("produces 4-part colon-separated string", async () => {
    const hash = await hashPassword("my-password");
    const parts = hash.split(":");
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe("v1");
  });

  it("uses 100000 iterations", async () => {
    const hash = await hashPassword("my-password");
    const parts = hash.split(":");
    const iterations = Number(parts[1]);
    expect(iterations).toBe(100_000);
  });

  it("generates unique salt each time", async () => {
    const hash1 = await hashPassword("same-password");
    const hash2 = await hashPassword("same-password");
    // Different salts → different stored hashes
    expect(hash1).not.toBe(hash2);
    // But both must still verify correctly
    expect(await verifyPassword("same-password", hash1)).toBe(true);
    expect(await verifyPassword("same-password", hash2)).toBe(true);
  });
});

// ============================================================================
// verifyPassword
// ============================================================================

describe("verifyPassword", () => {
  it("returns true for correct password", async () => {
    const hash = await hashPassword("correct-password");
    expect(await verifyPassword("correct-password", hash)).toBe(true);
  });

  it("returns false for wrong password", async () => {
    const hash = await hashPassword("correct-password");
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("returns false for empty password against non-empty hash", async () => {
    const hash = await hashPassword("non-empty-password");
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("returns false for malformed hash (wrong parts count)", async () => {
    expect(
      await verifyPassword("any-password", "v1:100000:onlythreeparts"),
    ).toBe(false);
  });

  it("returns false for wrong version prefix", async () => {
    expect(
      await verifyPassword("any-password", "v2:100000:fakesalt:fakehash"),
    ).toBe(false);
  });

  it("returns false for NaN iterations", async () => {
    expect(
      await verifyPassword("any-password", "v1:notanumber:fakesalt:fakehash"),
    ).toBe(false);
  });

  it("returns false for tampered hash", async () => {
    const hash = await hashPassword("my-password");
    const parts = hash.split(":");
    // Flip last character of the hash portion (4th part)
    const hashPart = parts[3]!;
    const lastChar = hashPart[hashPart.length - 1]!;
    // Replace last char with a different character
    const flipped = lastChar === "A" ? "B" : "A";
    parts[3] = hashPart.slice(0, -1) + flipped;
    const tampered = parts.join(":");
    expect(await verifyPassword("my-password", tampered)).toBe(false);
  });
});

// ============================================================================
// dummyVerify
// ============================================================================

describe("dummyVerify", () => {
  it("resolves without throwing", async () => {
    await expect(dummyVerify()).resolves.toBeUndefined();
  });

  it("completes in reasonable time (< 5s)", async () => {
    const start = Date.now();
    await dummyVerify();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(5_000);
  }, 10_000); // 10s timeout — PBKDF2 with 100k iterations can be slow
});
