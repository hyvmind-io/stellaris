import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  hashApiKey,
  generateApiKey,
  validateApiKey,
} from "@/lib/auth/api-keys";

// ============================================================================
// Mock: getDb (for validateApiKey tests)
// ============================================================================

const mockGet = vi.fn();
const mockWhere = vi.fn(() => ({ get: mockGet }));
const mockFrom = vi.fn(() => ({ where: mockWhere }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));

const mockUpdateWhere = vi.fn(() => Promise.resolve());
const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }));
const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }));

vi.mock("@/db/client", () => ({
  getDb: vi.fn(() => ({
    select: mockSelect,
    update: mockUpdate,
  })),
}));

// ============================================================================
// generateApiKey
// ============================================================================

describe("generateApiKey", () => {
  it("returns a string starting with 'stlr_'", () => {
    const key = generateApiKey();
    expect(key).toMatch(/^stlr_/);
  });

  it("has total length of 45 (stlr_ + 40 hex chars)", () => {
    const key = generateApiKey();
    expect(key).toHaveLength(45);
  });

  it("hex portion is exactly 40 lowercase hex characters", () => {
    const key = generateApiKey();
    const hex = key.slice(5);
    expect(hex).toMatch(/^[0-9a-f]{40}$/);
  });

  it("generates unique keys on each call", () => {
    const keys = new Set(Array.from({ length: 100 }, () => generateApiKey()));
    expect(keys.size).toBe(100);
  });
});

// ============================================================================
// hashApiKey
// ============================================================================

describe("hashApiKey", () => {
  it("returns a 64-character lowercase hex string (SHA-256)", async () => {
    const hash = await hashApiKey("stlr_abc123");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic — same input produces same hash", async () => {
    const hash1 = await hashApiKey("my-test-key");
    const hash2 = await hashApiKey("my-test-key");
    expect(hash1).toBe(hash2);
  });

  it("different inputs produce different hashes", async () => {
    const hash1 = await hashApiKey("key-a");
    const hash2 = await hashApiKey("key-b");
    expect(hash1).not.toBe(hash2);
  });

  it("empty string produces a valid hash", async () => {
    const hash = await hashApiKey("");
    expect(hash).toHaveLength(64);
  });

  it("produces the known SHA-256 of empty string", async () => {
    const hash = await hashApiKey("");
    expect(hash).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});

// ============================================================================
// validateApiKey (timing-safe comparison)
// ============================================================================

describe("validateApiKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when no record matches the hash", async () => {
    mockGet.mockResolvedValue(undefined);

    const result = await validateApiKey("stlr_nonexistent");

    expect(result).toBeNull();
    expect(mockSelect).toHaveBeenCalled();
  });

  it("returns the record when hash matches (timing-safe comparison passes)", async () => {
    const testKey = "stlr_testkey123";
    const expectedHash = await hashApiKey(testKey);

    const mockRecord = {
      id: 1,
      keyHash: expectedHash,
      name: "test-key",
      description: null,
      permissions: null,
      createdAt: new Date(),
      lastUsedAt: null,
      expiresAt: null,
    };

    mockGet.mockResolvedValue(mockRecord);

    const result = await validateApiKey(testKey);

    expect(result).toEqual(mockRecord);
  });

  it("returns null when DB record has a different hash (timing-safe comparison fails)", async () => {
    // Simulate a scenario where the DB returns a record with a mismatched hash
    // (defense-in-depth: the DB eq() matched but the constant-time compare catches it)
    const tampered = "a".repeat(64); // Valid hex but wrong hash

    const mockRecord = {
      id: 1,
      keyHash: tampered,
      name: "tampered-key",
      description: null,
      permissions: null,
      createdAt: new Date(),
      lastUsedAt: null,
      expiresAt: null,
    };

    mockGet.mockResolvedValue(mockRecord);

    const result = await validateApiKey("stlr_anykey");

    expect(result).toBeNull();
  });

  it("returns null when record is expired", async () => {
    const testKey = "stlr_expiredkey";
    const expectedHash = await hashApiKey(testKey);

    const mockRecord = {
      id: 2,
      keyHash: expectedHash,
      name: "expired-key",
      description: null,
      permissions: null,
      createdAt: new Date(),
      lastUsedAt: null,
      expiresAt: new Date(Date.now() - 60_000), // Expired 1 minute ago
    };

    mockGet.mockResolvedValue(mockRecord);

    const result = await validateApiKey(testKey);

    expect(result).toBeNull();
  });

  it("updates lastUsedAt on successful validation", async () => {
    const testKey = "stlr_trackusage";
    const expectedHash = await hashApiKey(testKey);

    const mockRecord = {
      id: 3,
      keyHash: expectedHash,
      name: "tracked-key",
      description: null,
      permissions: null,
      createdAt: new Date(),
      lastUsedAt: null,
      expiresAt: null,
    };

    mockGet.mockResolvedValue(mockRecord);

    await validateApiKey(testKey);

    expect(mockUpdate).toHaveBeenCalled();
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ lastUsedAt: expect.any(Date) }),
    );
  });

  it("still returns record when lastUsedAt update fails", async () => {
    const testKey = "stlr_updatefail";
    const expectedHash = await hashApiKey(testKey);

    const mockRecord = {
      id: 4,
      keyHash: expectedHash,
      name: "resilient-key",
      description: null,
      permissions: null,
      createdAt: new Date(),
      lastUsedAt: null,
      expiresAt: null,
    };

    mockGet.mockResolvedValue(mockRecord);
    mockUpdateWhere.mockRejectedValue(new Error("DB write failed"));

    const result = await validateApiKey(testKey);

    // Non-critical failure — should still return the record
    expect(result).toEqual(mockRecord);
  });
});
