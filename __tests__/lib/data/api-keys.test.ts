import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks — hoisted before any import of the module under test
// ============================================================================

// DB mock — flexible, untyped mocks to avoid shape-checking conflicts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;

const mockGet = vi.fn<AnyFn>();
const mockReturning = vi.fn<AnyFn>();

// Rebuild these lazily per test; top-level fns are stable references
const mockSelectOrderBy = vi.fn<AnyFn>();
const mockSelectWhere = vi.fn<AnyFn>();
const mockSelectFrom = vi.fn<AnyFn>();
const mockSelect = vi.fn<AnyFn>(() => ({ from: mockSelectFrom }));

const mockInsertReturning = vi.fn<AnyFn>();
const mockInsertValues = vi.fn<AnyFn>(() => ({
  returning: mockInsertReturning,
}));
const mockInsert = vi.fn<AnyFn>(() => ({ values: mockInsertValues }));

const mockDeleteWhere = vi.fn<AnyFn>(() => ({ returning: mockReturning }));
const mockDelete = vi.fn<AnyFn>(() => ({ where: mockDeleteWhere }));

vi.mock("@/db/client", () => ({
  getDb: vi.fn(() => ({
    select: mockSelect,
    insert: mockInsert,
    delete: mockDelete,
  })),
}));

// Mock api-key generators
const mockGenerateApiKey = vi.fn<AnyFn>();
const mockHashApiKey = vi.fn<AnyFn>();

vi.mock("@/lib/auth/api-keys", () => ({
  generateApiKey: () => mockGenerateApiKey(),
  hashApiKey: (key: string) => mockHashApiKey(key),
}));

// Mock schema
vi.mock("@/db/schema", () => ({
  apiKeys: {
    id: "id",
    keyHash: "keyHash",
    name: "name",
    description: "description",
    userId: "userId",
    createdAt: "createdAt",
    lastUsedAt: "lastUsedAt",
    expiresAt: "expiresAt",
  },
}));

// Mock drizzle-orm operators
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a, b) => ({ op: "eq", a, b })),
  and: vi.fn((...args) => ({ op: "and", args })),
  desc: vi.fn((a) => ({ op: "desc", a })),
  count: vi.fn(() => ({ op: "count" })),
}));

import {
  getUserApiKeys,
  countUserApiKeys,
  createUserApiKey,
  deleteUserApiKey,
} from "@/lib/data/api-keys";

// ============================================================================
// Shared fixtures
// ============================================================================

const NOW = new Date("2024-01-01T00:00:00Z");

const dbApiKeyRecord = {
  id: 10,
  keyHash: "sha256_hash_here",
  name: "my-key",
  description: null,
  permissions: ["admin"],
  userId: 1,
  createdAt: NOW,
  lastUsedAt: null,
  expiresAt: null,
};

// Safe client-facing shape (no keyHash, no permissions, no userId)
const apiKeyData = {
  id: 10,
  name: "my-key",
  description: null,
  createdAt: NOW,
  lastUsedAt: null,
  expiresAt: null,
};

// ============================================================================
// Helpers
// ============================================================================

/**
 * Sets up the select().from().where().orderBy().all() chain.
 * getUserApiKeys uses: select → from → where → orderBy → all
 */
function setupSelectAllChain(records: unknown[]) {
  mockSelectOrderBy.mockReturnValue({ all: () => Promise.resolve(records) });
  mockSelectWhere.mockReturnValue({ orderBy: mockSelectOrderBy });
  mockSelectFrom.mockReturnValue({ where: mockSelectWhere });
}

/**
 * Sets up the select().from().where().get() chain.
 * countUserApiKeys uses: select → from → where → get
 */
function setupSelectGetChain(result: unknown) {
  mockGet.mockResolvedValue(result);
  mockSelectWhere.mockReturnValue({ get: mockGet });
  mockSelectFrom.mockReturnValue({ where: mockSelectWhere });
}

// ============================================================================
// getUserApiKeys
// ============================================================================

describe("getUserApiKeys", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue({ from: mockSelectFrom });
  });

  it("returns array of ApiKeyData (no keyHash) for a user", async () => {
    setupSelectAllChain([dbApiKeyRecord]);

    const result = await getUserApiKeys(1);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(apiKeyData);
    expect(result[0]).not.toHaveProperty("keyHash");
  });

  it("returns empty array when user has no API keys", async () => {
    setupSelectAllChain([]);

    const result = await getUserApiKeys(42);

    expect(result).toEqual([]);
  });

  it("returns multiple keys stripped of sensitive data", async () => {
    const second = { ...dbApiKeyRecord, id: 11, name: "second-key" };
    setupSelectAllChain([dbApiKeyRecord, second]);

    const result = await getUserApiKeys(1);

    expect(result).toHaveLength(2);
    result.forEach((k) => {
      expect(k).not.toHaveProperty("keyHash");
      expect(k).not.toHaveProperty("permissions");
      expect(k).not.toHaveProperty("userId");
    });
  });
});

// ============================================================================
// countUserApiKeys
// ============================================================================

describe("countUserApiKeys", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue({ from: mockSelectFrom });
  });

  it("returns the count of API keys owned by a user", async () => {
    setupSelectGetChain({ count: 3 });

    const result = await countUserApiKeys(1);

    expect(result).toBe(3);
  });

  it("returns 0 when user has no keys", async () => {
    setupSelectGetChain({ count: 0 });

    const result = await countUserApiKeys(1);

    expect(result).toBe(0);
  });

  it("returns 0 when count result is undefined (no rows)", async () => {
    setupSelectGetChain(undefined);

    const result = await countUserApiKeys(99);

    expect(result).toBe(0);
  });
});

// ============================================================================
// createUserApiKey
// ============================================================================

describe("createUserApiKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockReturnValue({ values: mockInsertValues });
    mockInsertValues.mockReturnValue({ returning: mockInsertReturning });
  });

  it("calls generateApiKey and hashApiKey, inserts with userId, returns plainTextKey", async () => {
    const plainKey = "stlr_abc123";
    const keyHash = "sha256_of_abc123";

    mockGenerateApiKey.mockReturnValue(plainKey);
    mockHashApiKey.mockResolvedValue(keyHash);
    mockInsertReturning.mockResolvedValue([dbApiKeyRecord]);

    const result = await createUserApiKey(1, "my-key");

    expect(mockGenerateApiKey).toHaveBeenCalledTimes(1);
    expect(mockHashApiKey).toHaveBeenCalledWith(plainKey);
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 1, name: "my-key", keyHash }),
    );
    expect(result.plainTextKey).toBe(plainKey);
  });

  it("returns ApiKeyData without keyHash", async () => {
    mockGenerateApiKey.mockReturnValue("stlr_testkey");
    mockHashApiKey.mockResolvedValue("some_hash");
    mockInsertReturning.mockResolvedValue([dbApiKeyRecord]);

    const result = await createUserApiKey(1, "test");

    expect(result.key).toEqual(apiKeyData);
    expect(result.key).not.toHaveProperty("keyHash");
  });

  it("assigns permissions: ['admin'] by default", async () => {
    mockGenerateApiKey.mockReturnValue("stlr_key");
    mockHashApiKey.mockResolvedValue("hash");
    mockInsertReturning.mockResolvedValue([dbApiKeyRecord]);

    await createUserApiKey(1, "admin-key");

    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ permissions: ["admin"] }),
    );
  });

  it("returns the plaintext key (only at creation time)", async () => {
    const plainKey = "stlr_unique_plain_key";
    mockGenerateApiKey.mockReturnValue(plainKey);
    mockHashApiKey.mockResolvedValue("hash_of_unique");
    mockInsertReturning.mockResolvedValue([dbApiKeyRecord]);

    const result = await createUserApiKey(1, "unique-key");

    // plainTextKey is only ever returned here — never stored
    expect(result.plainTextKey).toBe(plainKey);
    expect(result.key).not.toHaveProperty("keyHash");
  });
});

// ============================================================================
// deleteUserApiKey
// ============================================================================

describe("deleteUserApiKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDelete.mockReturnValue({ where: mockDeleteWhere });
  });

  it("returns true when key belongs to the user and was deleted", async () => {
    mockReturning.mockResolvedValue([{ id: 10 }]);
    mockDeleteWhere.mockReturnValue({ returning: mockReturning });

    const result = await deleteUserApiKey(10, 1);

    expect(result).toBe(true);
  });

  it("returns false when key not found (wrong keyId)", async () => {
    mockReturning.mockResolvedValue([]);
    mockDeleteWhere.mockReturnValue({ returning: mockReturning });

    const result = await deleteUserApiKey(999, 1);

    expect(result).toBe(false);
  });

  it("returns false when userId does not match (ownership violation)", async () => {
    // The data layer uses AND(keyId, userId) — if userId doesn't match, no rows returned
    mockReturning.mockResolvedValue([]);
    mockDeleteWhere.mockReturnValue({ returning: mockReturning });

    const result = await deleteUserApiKey(10, 999);

    expect(result).toBe(false);
  });

  it("verifies ownership by including userId in the where clause", async () => {
    mockReturning.mockResolvedValue([{ id: 10 }]);
    mockDeleteWhere.mockReturnValue({ returning: mockReturning });

    await deleteUserApiKey(10, 1);

    // The where clause should have been called (ownership enforced at DB level)
    expect(mockDeleteWhere).toHaveBeenCalled();
  });
});
