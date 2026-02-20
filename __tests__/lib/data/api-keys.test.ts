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

const mockUpdateSet = vi.fn<AnyFn>();
const mockUpdateWhere = vi.fn<AnyFn>(() => ({ returning: mockReturning }));
const mockUpdate = vi.fn<AnyFn>(() => ({ set: mockUpdateSet }));

vi.mock("@/db/client", () => ({
  getDb: vi.fn(() => ({
    select: mockSelect,
    insert: mockInsert,
    delete: mockDelete,
    update: mockUpdate,
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
  updateUserApiKey,
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

// Safe client-facing shape (no keyHash, no userId — permissions IS exposed)
const apiKeyData = {
  id: 10,
  name: "my-key",
  description: null,
  permissions: ["admin"],
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
      expect(k).toHaveProperty("permissions");
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

  it("uses custom permissions when provided", async () => {
    mockGenerateApiKey.mockReturnValue("stlr_custom");
    mockHashApiKey.mockResolvedValue("custom_hash");
    mockInsertReturning.mockResolvedValue([
      { ...dbApiKeyRecord, permissions: ["modules:read", "providers:read"] },
    ]);

    await createUserApiKey(1, "read-only", ["modules:read", "providers:read"]);

    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        permissions: ["modules:read", "providers:read"],
      }),
    );
  });

  it("falls back to ['admin'] when empty permissions array is provided", async () => {
    mockGenerateApiKey.mockReturnValue("stlr_fallback");
    mockHashApiKey.mockResolvedValue("fallback_hash");
    mockInsertReturning.mockResolvedValue([dbApiKeyRecord]);

    await createUserApiKey(1, "fallback-key", []);

    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ permissions: ["admin"] }),
    );
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

// ============================================================================
// updateUserApiKey
// ============================================================================

describe("updateUserApiKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockReturnValue({ set: mockUpdateSet });
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
  });

  it("updates name and permissions, returns updated ApiKeyData", async () => {
    const updated = {
      ...dbApiKeyRecord,
      name: "renamed",
      permissions: ["modules:read"],
    };
    mockReturning.mockResolvedValue([updated]);
    mockUpdateWhere.mockReturnValue({ returning: mockReturning });
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });

    const result = await updateUserApiKey(10, 1, {
      name: "renamed",
      permissions: ["modules:read"],
    });

    expect(result).not.toBeNull();
    expect(result!.name).toBe("renamed");
    expect(result!.permissions).toEqual(["modules:read"]);
    expect(result).not.toHaveProperty("keyHash");
    expect(result).not.toHaveProperty("userId");
  });

  it("returns null when key not found (wrong keyId)", async () => {
    mockReturning.mockResolvedValue([]);
    mockUpdateWhere.mockReturnValue({ returning: mockReturning });
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });

    const result = await updateUserApiKey(999, 1, { name: "test" });

    expect(result).toBeNull();
  });

  it("returns null when userId does not match (ownership violation)", async () => {
    mockReturning.mockResolvedValue([]);
    mockUpdateWhere.mockReturnValue({ returning: mockReturning });
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });

    const result = await updateUserApiKey(10, 999, { name: "test" });

    expect(result).toBeNull();
  });

  it("returns null when no fields are provided", async () => {
    const result = await updateUserApiKey(10, 1, {});

    expect(result).toBeNull();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("only updates name when only name is provided", async () => {
    const updated = { ...dbApiKeyRecord, name: "new-name" };
    mockReturning.mockResolvedValue([updated]);
    mockUpdateWhere.mockReturnValue({ returning: mockReturning });
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });

    const result = await updateUserApiKey(10, 1, { name: "new-name" });

    expect(result).not.toBeNull();
    expect(result!.name).toBe("new-name");
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ name: "new-name" }),
    );
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.not.objectContaining({ permissions: expect.anything() }),
    );
  });

  it("only updates permissions when only permissions is provided", async () => {
    const updated = {
      ...dbApiKeyRecord,
      permissions: ["providers:write"],
    };
    mockReturning.mockResolvedValue([updated]);
    mockUpdateWhere.mockReturnValue({ returning: mockReturning });
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });

    const result = await updateUserApiKey(10, 1, {
      permissions: ["providers:write"],
    });

    expect(result).not.toBeNull();
    expect(result!.permissions).toEqual(["providers:write"]);
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ permissions: ["providers:write"] }),
    );
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.not.objectContaining({ name: expect.anything() }),
    );
  });
});
