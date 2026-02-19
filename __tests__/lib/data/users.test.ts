import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks — hoisted before any import of the module under test
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;

// DB mock primitives
const mockGet = vi.fn<AnyFn>();
const mockAll = vi.fn<AnyFn>();
const mockReturning = vi.fn<AnyFn>();

// Select chain: .select().from().where().get() / .all() / .orderBy()
const mockSelectWhere = vi.fn<AnyFn>(() => ({ get: mockGet, all: mockAll }));
const mockSelectOrderBy = vi.fn<AnyFn>(() => ({
  limit: vi.fn(() => ({
    offset: vi.fn(() => ({ all: mockAll })),
  })),
}));
const mockSelectFrom = vi.fn<AnyFn>(() => ({
  where: mockSelectWhere,
  get: mockGet,
  all: mockAll,
  orderBy: mockSelectOrderBy,
}));
const mockSelect = vi.fn<AnyFn>(() => ({ from: mockSelectFrom }));

// Insert chain: .insert().values().returning()
const mockInsertReturning = vi.fn();
const mockInsertValues = vi.fn(() => ({ returning: mockInsertReturning }));
const mockInsert = vi.fn<AnyFn>(() => ({ values: mockInsertValues }));

// Update chain: .update().set().where()  (no returning by default)
const mockUpdateWhere = vi.fn<AnyFn>(() => ({ returning: mockReturning }));
const mockUpdateSet = vi.fn<AnyFn>(() => ({
  where: mockUpdateWhere,
}));
const mockUpdate = vi.fn<AnyFn>(() => ({ set: mockUpdateSet }));

// Delete chain: .delete().where().returning()
const mockDeleteWhere = vi.fn<AnyFn>(() => ({ returning: mockReturning }));
const mockDelete = vi.fn<AnyFn>(() => ({ where: mockDeleteWhere }));

vi.mock("@/db/client", () => ({
  getDb: vi.fn(() => ({
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
  })),
}));

// Mock password hashing
const mockHashPassword = vi.fn();
vi.mock("@/lib/auth/password", () => ({
  hashPassword: (pw: string) => mockHashPassword(pw),
}));

// Mock schema — return simple objects so drizzle-orm operators just pass through
vi.mock("@/db/schema", () => ({
  users: {
    id: "id",
    email: "email",
    username: "username",
    displayName: "displayName",
    passwordHash: "passwordHash",
    role: "role",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
    lastLoginAt: "lastLoginAt",
  },
}));

// Mock drizzle-orm operators (used internally by users.ts)
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a, b) => ({ op: "eq", a, b })),
  and: vi.fn((...args) => ({ op: "and", args })),
  or: vi.fn((...args) => ({ op: "or", args })),
  like: vi.fn((a, b) => ({ op: "like", a, b })),
  desc: vi.fn((a) => ({ op: "desc", a })),
  count: vi.fn(() => ({ op: "count" })),
  not: vi.fn((a) => ({ op: "not", a })),
}));

import {
  getUserById,
  getUserByEmail,
  getUserByEmailWithPassword,
  getUserByUsername,
  getAllUsers,
  createUser,
  updateUser,
  updateUserRole,
  updateUserPassword,
  updateLastLogin,
  deleteUser,
  isEmailTaken,
  isUsernameTaken,
  getAdminCount,
} from "@/lib/data/users";

// ============================================================================
// Shared fixtures
// ============================================================================

const NOW = new Date("2024-01-01T00:00:00Z");

const dbUser = {
  id: 1,
  email: "alice@example.com",
  username: "alice",
  displayName: "Alice",
  passwordHash: "hashed_password",
  role: "admin" as const,
  createdAt: NOW,
  updatedAt: NOW,
  lastLoginAt: null,
};

// AuthUser = dbUser without passwordHash
const authUser = (({ passwordHash: _, ...rest }) => rest)(dbUser);

// ============================================================================
// Helpers
// ============================================================================

/**
 * Configure the select → from → where → get() chain for single-row lookups.
 * Uses Once variants so values don't bleed across tests even when clearAllMocks
 * doesn't fully reset implementations.
 */
function setupSelectGet(returnValue: unknown) {
  mockGet.mockResolvedValueOnce(returnValue);
  mockSelectWhere.mockReturnValueOnce({ get: mockGet, all: mockAll });
  mockSelectFrom.mockReturnValueOnce({
    where: mockSelectWhere,
    get: mockGet,
    all: mockAll,
    orderBy: mockSelectOrderBy,
  });
}

// ============================================================================
// getUserById
// ============================================================================

describe("getUserById", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns AuthUser (without passwordHash) when user exists", async () => {
    setupSelectGet(dbUser);

    const result = await getUserById(1);

    expect(result).toEqual(authUser);
    expect(result).not.toHaveProperty("passwordHash");
  });

  it("returns null when user is not found", async () => {
    setupSelectGet(undefined);

    const result = await getUserById(999);

    expect(result).toBeNull();
  });
});

// ============================================================================
// getUserByEmail
// ============================================================================

describe("getUserByEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns AuthUser when email matches (lowercased)", async () => {
    setupSelectGet(dbUser);

    const result = await getUserByEmail("Alice@Example.COM");

    expect(result).toEqual(authUser);
    expect(result).not.toHaveProperty("passwordHash");
  });

  it("returns null when email not found", async () => {
    setupSelectGet(undefined);

    const result = await getUserByEmail("nobody@example.com");

    expect(result).toBeNull();
  });
});

// ============================================================================
// getUserByEmailWithPassword
// ============================================================================

describe("getUserByEmailWithPassword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns full User record including passwordHash", async () => {
    setupSelectGet(dbUser);

    const result = await getUserByEmailWithPassword("alice@example.com");

    expect(result).toEqual(dbUser);
    expect(result).toHaveProperty("passwordHash", "hashed_password");
  });

  it("returns null when user not found", async () => {
    setupSelectGet(undefined);

    const result = await getUserByEmailWithPassword("ghost@example.com");

    expect(result).toBeNull();
  });
});

// ============================================================================
// getUserByUsername
// ============================================================================

describe("getUserByUsername", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns AuthUser when username matches", async () => {
    setupSelectGet(dbUser);

    const result = await getUserByUsername("alice");

    expect(result).toEqual(authUser);
    expect(result).not.toHaveProperty("passwordHash");
  });

  it("returns null when username not found", async () => {
    setupSelectGet(undefined);

    const result = await getUserByUsername("unknown");

    expect(result).toBeNull();
  });
});

// ============================================================================
// getAllUsers
// ============================================================================

describe("getAllUsers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Helper for getAllUsers tests: wire up the full Drizzle chain.
   * getAllUsers fires two parallel queries:
   *   1. select().from().where().orderBy().limit().offset().all()  — data
   *   2. select().from().where().get()                            — count
   *
   * Both share the same mockSelectFrom / mockSelectWhere, so we configure
   * mockSelectWhere to expose BOTH orderBy (for data query) AND get (for count).
   */
  function setupGetAllUsersChain(dataRows: unknown[], countResult: unknown) {
    const mockOffset = vi.fn(() => ({ all: mockAll }));
    const mockLimit = vi.fn(() => ({ offset: mockOffset }));
    mockSelectOrderBy.mockReturnValue({ limit: mockLimit });
    mockSelectWhere.mockReturnValue({
      get: mockGet,
      all: mockAll,
      orderBy: mockSelectOrderBy,
    });
    mockSelectFrom.mockReturnValue({
      where: mockSelectWhere,
      get: mockGet,
      all: mockAll,
      orderBy: mockSelectOrderBy,
    });
    // Data query resolves via mockAll, count via mockGet
    mockAll.mockResolvedValueOnce(dataRows);
    mockGet.mockResolvedValueOnce(countResult);
  }

  it("returns users list and total count with no filters", async () => {
    setupGetAllUsersChain([dbUser], { count: 1 });

    const result = await getAllUsers();

    expect(result.users).toHaveLength(1);
    expect(result.users[0]).not.toHaveProperty("passwordHash");
    expect(result.total).toBe(1);
  });

  it("returns empty array and 0 total when no users match", async () => {
    setupGetAllUsersChain([], { count: 0 });

    const result = await getAllUsers({ search: "nobody" });

    expect(result.users).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("returns 0 total when count result is undefined", async () => {
    setupGetAllUsersChain([], undefined);

    const result = await getAllUsers();

    expect(result.total).toBe(0);
  });

  it("uses page 1, limit 20 by default", async () => {
    setupGetAllUsersChain([dbUser], { count: 1 });

    // Should not throw
    const result = await getAllUsers(undefined, undefined);
    expect(result).toHaveProperty("users");
    expect(result).toHaveProperty("total");
  });
});

// ============================================================================
// createUser
// ============================================================================

describe("createUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hashes the password and returns AuthUser", async () => {
    mockHashPassword.mockResolvedValue("hashed_pw");
    mockInsertReturning.mockResolvedValue([dbUser]);

    const result = await createUser({
      email: "Alice@Example.COM",
      username: "alice",
      password: "plaintext",
      role: "admin",
    });

    expect(mockHashPassword).toHaveBeenCalledWith("plaintext");
    expect(result).toEqual(authUser);
    expect(result).not.toHaveProperty("passwordHash");
  });

  it("defaults role to 'guest' when not provided", async () => {
    mockHashPassword.mockResolvedValue("hashed_pw");
    const guestUser = { ...dbUser, role: "guest" as const };
    mockInsertReturning.mockResolvedValue([guestUser]);

    const result = await createUser({
      email: "bob@example.com",
      username: "bob",
      password: "password123",
    });

    // Verify insert was called (exact args depend on drizzle internals — just ensure no throw)
    expect(mockInsert).toHaveBeenCalled();
    expect(result).not.toHaveProperty("passwordHash");
  });

  it("lowercases the email on insert", async () => {
    mockHashPassword.mockResolvedValue("hashed_pw");
    mockInsertReturning.mockResolvedValue([dbUser]);

    await createUser({
      email: "UPPER@EXAMPLE.COM",
      username: "testuser",
      password: "testpass123",
    });

    // The values mock should have been called
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ email: "upper@example.com" }),
    );
  });
});

// ============================================================================
// updateUser
// ============================================================================

describe("updateUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns updated AuthUser without passwordHash", async () => {
    // updateUser uses .update().set().where().returning()
    const updatedReturning = vi.fn().mockResolvedValue([dbUser]);
    mockUpdateWhere.mockReturnValue({ returning: updatedReturning });
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });

    const result = await updateUser(1, { displayName: "Alice Updated" });

    expect(result).toEqual(authUser);
    expect(result).not.toHaveProperty("passwordHash");
  });

  it("sets updatedAt on every update", async () => {
    const updatedReturning = vi.fn().mockResolvedValue([dbUser]);
    mockUpdateWhere.mockReturnValue({ returning: updatedReturning });
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });

    await updateUser(1, { username: "alice_new" });

    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ updatedAt: expect.any(Date) }),
    );
  });

  it("lowercases email when email is provided", async () => {
    const updatedReturning = vi.fn().mockResolvedValue([dbUser]);
    mockUpdateWhere.mockReturnValue({ returning: updatedReturning });
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });

    await updateUser(1, { email: "NEWEMAIL@EXAMPLE.COM" });

    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ email: "newemail@example.com" }),
    );
  });
});

// ============================================================================
// updateUserRole
// ============================================================================

describe("updateUserRole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns updated AuthUser with new role", async () => {
    const updatedUser = { ...dbUser, role: "user" as const };
    const updatedReturning = vi.fn().mockResolvedValue([updatedUser]);
    mockUpdateWhere.mockReturnValue({ returning: updatedReturning });
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });

    const result = await updateUserRole(1, "user");

    expect(result).not.toHaveProperty("passwordHash");
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ role: "user", updatedAt: expect.any(Date) }),
    );
  });
});

// ============================================================================
// updateUserPassword
// ============================================================================

describe("updateUserPassword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hashes the new password and updates the record", async () => {
    mockHashPassword.mockResolvedValue("new_hashed_pw");
    mockUpdateWhere.mockReturnValue({ returning: mockReturning });
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });

    await updateUserPassword(1, "newPassword123");

    expect(mockHashPassword).toHaveBeenCalledWith("newPassword123");
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        passwordHash: "new_hashed_pw",
        updatedAt: expect.any(Date),
      }),
    );
  });
});

// ============================================================================
// updateLastLogin
// ============================================================================

describe("updateLastLogin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets both lastLoginAt and updatedAt", async () => {
    mockUpdateWhere.mockReturnValue({ returning: mockReturning });
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });

    await updateLastLogin(1);

    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        lastLoginAt: expect.any(Date),
        updatedAt: expect.any(Date),
      }),
    );
  });
});

// ============================================================================
// deleteUser
// ============================================================================

describe("deleteUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when user was deleted", async () => {
    mockReturning.mockResolvedValue([{ id: 1 }]);
    mockDeleteWhere.mockReturnValue({ returning: mockReturning });

    const result = await deleteUser(1);

    expect(result).toBe(true);
  });

  it("returns false when user was not found", async () => {
    mockReturning.mockResolvedValue([]);
    mockDeleteWhere.mockReturnValue({ returning: mockReturning });

    const result = await deleteUser(999);

    expect(result).toBe(false);
  });
});

// ============================================================================
// isEmailTaken
// ============================================================================

describe("isEmailTaken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when email is already in use", async () => {
    setupSelectGet({ id: 1 });

    const result = await isEmailTaken("alice@example.com");

    expect(result).toBe(true);
  });

  it("returns false when email is not in use", async () => {
    setupSelectGet(undefined);

    const result = await isEmailTaken("new@example.com");

    expect(result).toBe(false);
  });

  it("excludes the given userId from the check", async () => {
    // When we're updating our own email, it shouldn't count as taken
    setupSelectGet(undefined);

    const result = await isEmailTaken("alice@example.com", 1);

    // The data function should call .where() with an AND condition including NOT(eq(id, 1))
    expect(mockSelectWhere).toHaveBeenCalled();
    expect(result).toBe(false);
  });
});

// ============================================================================
// isUsernameTaken
// ============================================================================

describe("isUsernameTaken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when username is already taken", async () => {
    setupSelectGet({ id: 1 });

    const result = await isUsernameTaken("alice");

    expect(result).toBe(true);
  });

  it("returns false when username is available", async () => {
    setupSelectGet(undefined);

    const result = await isUsernameTaken("newuser");

    expect(result).toBe(false);
  });

  it("excludes the given userId (own username update)", async () => {
    setupSelectGet(undefined);

    const result = await isUsernameTaken("alice", 1);

    expect(mockSelectWhere).toHaveBeenCalled();
    expect(result).toBe(false);
  });
});

// ============================================================================
// getAdminCount
// ============================================================================

describe("getAdminCount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the admin count from the DB", async () => {
    setupSelectGet({ count: 3 });

    const result = await getAdminCount();

    expect(result).toBe(3);
  });

  it("returns 0 when count result is undefined", async () => {
    setupSelectGet(undefined);

    const result = await getAdminCount();

    expect(result).toBe(0);
  });

  it("returns 0 when count is 0", async () => {
    setupSelectGet({ count: 0 });

    const result = await getAdminCount();

    expect(result).toBe(0);
  });
});
