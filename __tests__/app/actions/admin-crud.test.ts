import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks — hoisted before any import of the module under test
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;

// --- Auth ---
const mockGetAuth = vi.fn<AnyFn>();

vi.mock("@/lib/auth/get-auth", () => ({
  getAuth: () => mockGetAuth(),
}));

// --- User data layer ---
const mockGetAllUsers = vi.fn<AnyFn>();
const mockGetUserById = vi.fn<AnyFn>();
const mockUpdateUserRole = vi.fn<AnyFn>();
const mockGetAdminCount = vi.fn<AnyFn>();
const mockGetUserByEmail = vi.fn<AnyFn>();
const mockGetUserByUsername = vi.fn<AnyFn>();
const mockCreateUser = vi.fn<AnyFn>();
const mockDeleteUser = vi.fn<AnyFn>();
const mockIsEmailTaken = vi.fn<AnyFn>();
const mockIsUsernameTaken = vi.fn<AnyFn>();
const mockUpdateUser = vi.fn<AnyFn>();
const mockUpdateUserPassword = vi.fn<AnyFn>();

vi.mock("@/lib/data/users", () => ({
  getAllUsers: (...args: unknown[]) => mockGetAllUsers(...args),
  getUserById: (...args: unknown[]) => mockGetUserById(...args),
  updateUserRole: (...args: unknown[]) => mockUpdateUserRole(...args),
  getAdminCount: () => mockGetAdminCount(),
  getUserByEmail: (...args: unknown[]) => mockGetUserByEmail(...args),
  getUserByUsername: (...args: unknown[]) => mockGetUserByUsername(...args),
  createUser: (...args: unknown[]) => mockCreateUser(...args),
  deleteUser: (...args: unknown[]) => mockDeleteUser(...args),
  isEmailTaken: (...args: unknown[]) => mockIsEmailTaken(...args),
  isUsernameTaken: (...args: unknown[]) => mockIsUsernameTaken(...args),
  updateUser: (...args: unknown[]) => mockUpdateUser(...args),
  updateUserPassword: (...args: unknown[]) => mockUpdateUserPassword(...args),
}));

// --- Session ---
const mockDeleteAllUserSessionsFromDb = vi.fn<AnyFn>();

vi.mock("@/lib/auth/session", () => ({
  deleteAllUserSessionsFromDb: (...args: unknown[]) =>
    mockDeleteAllUserSessionsFromDb(...args),
}));

// --- DB (for getUserDetailsAction count queries) ---
const mockDbGet = vi.fn<AnyFn>();
const mockDbWhere = vi.fn<AnyFn>(() => ({ get: mockDbGet }));
const mockDbFrom = vi.fn<AnyFn>(() => ({ where: mockDbWhere }));
const mockDbSelect = vi.fn<AnyFn>(() => ({ from: mockDbFrom }));

vi.mock("@/db/client", () => ({
  getDb: vi.fn(() => ({ select: mockDbSelect })),
}));

// --- Schema (for table references in count queries) ---
vi.mock("@/db/schema", () => ({
  apiKeys: { userId: "userId" },
  sessions: { userId: "userId" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a, b) => ({ op: "eq", a, b })),
  count: vi.fn(() => ({ op: "count" })),
}));

vi.mock("@/lib/data/settings", () => ({
  isSignupEnabled: vi.fn(),
  setSignupEnabled: vi.fn(),
}));

import {
  listUsersAction,
  updateUserRoleAction,
  getUserDetailsAction,
  createUserAction,
  editUserAction,
  deleteUserAction,
  resetUserPasswordAction,
} from "@/app/actions/admin";

// ============================================================================
// Shared fixtures
// ============================================================================

const NOW = new Date("2024-01-01T00:00:00Z");

const adminUser = {
  id: 1,
  email: "admin@example.com",
  username: "admin",
  displayName: "Admin",
  role: "admin" as const,
  createdAt: NOW,
  updatedAt: NOW,
  lastLoginAt: null,
};

const regularUser = {
  id: 2,
  email: "user@example.com",
  username: "regularuser",
  displayName: "Regular User",
  role: "user" as const,
  createdAt: NOW,
  updatedAt: NOW,
  lastLoginAt: null,
};

const adminAuthResult = { user: adminUser, sessionId: "session-admin" };
const userAuthResult = { user: { ...regularUser }, sessionId: "session-user" };
const guestAuthResult = {
  user: { ...regularUser, role: "guest" as const },
  sessionId: "session-guest",
};

// ============================================================================
// listUsersAction
// ============================================================================

describe("listUsersAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns error when not authenticated", async () => {
    mockGetAuth.mockResolvedValue(null);

    const result = await listUsersAction();

    expect(result).toEqual({ success: false, error: "Not authenticated" });
    expect(mockGetAllUsers).not.toHaveBeenCalled();
  });

  it("returns error when authenticated as non-admin (user role)", async () => {
    mockGetAuth.mockResolvedValue(userAuthResult);

    const result = await listUsersAction();

    expect(result).toEqual({ success: false, error: "Admin access required" });
    expect(mockGetAllUsers).not.toHaveBeenCalled();
  });

  it("returns error when authenticated as guest", async () => {
    mockGetAuth.mockResolvedValue(guestAuthResult);

    const result = await listUsersAction();

    expect(result).toEqual({ success: false, error: "Admin access required" });
  });

  it("returns users list on happy path", async () => {
    mockGetAuth.mockResolvedValue(adminAuthResult);
    mockGetAllUsers.mockResolvedValue({
      users: [adminUser, regularUser],
      total: 2,
    });

    const result = await listUsersAction();

    expect(result.success).toBe(true);
    expect(result.users).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(10);
    expect(result.totalPages).toBe(1);
  });

  it("passes search and role filters to getAllUsers", async () => {
    mockGetAuth.mockResolvedValue(adminAuthResult);
    mockGetAllUsers.mockResolvedValue({ users: [adminUser], total: 1 });

    await listUsersAction({
      search: "admin",
      role: "admin",
      page: 2,
      limit: 5,
    });

    expect(mockGetAllUsers).toHaveBeenCalledWith(
      { search: "admin", role: "admin" },
      { page: 2, limit: 5 },
    );
  });

  it("returns error when getAllUsers throws", async () => {
    mockGetAuth.mockResolvedValue(adminAuthResult);
    mockGetAllUsers.mockRejectedValue(new Error("DB error"));

    const result = await listUsersAction();

    expect(result).toEqual({ success: false, error: "Failed to list users" });
  });

  it("calculates totalPages correctly", async () => {
    mockGetAuth.mockResolvedValue(adminAuthResult);
    mockGetAllUsers.mockResolvedValue({ users: [], total: 55 });

    const result = await listUsersAction({ limit: 10 });

    expect(result.totalPages).toBe(6); // ceil(55/10) = 6
  });
});

// ============================================================================
// updateUserRoleAction
// ============================================================================

describe("updateUserRoleAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns error when not authenticated", async () => {
    mockGetAuth.mockResolvedValue(null);

    const result = await updateUserRoleAction(2, "user");

    expect(result).toEqual({ success: false, error: "Not authenticated" });
    expect(mockUpdateUserRole).not.toHaveBeenCalled();
  });

  it("returns error when not admin", async () => {
    mockGetAuth.mockResolvedValue(userAuthResult);

    const result = await updateUserRoleAction(2, "user");

    expect(result).toEqual({ success: false, error: "Admin access required" });
  });

  it("returns error when target user not found", async () => {
    mockGetAuth.mockResolvedValue(adminAuthResult);
    mockGetUserById.mockResolvedValue(null);

    const result = await updateUserRoleAction(999, "user");

    expect(result).toEqual({ success: false, error: "User not found" });
    expect(mockUpdateUserRole).not.toHaveBeenCalled();
  });

  it("prevents demoting the last admin", async () => {
    mockGetAuth.mockResolvedValue(adminAuthResult);
    mockGetUserById.mockResolvedValue(adminUser); // target is also admin
    mockGetAdminCount.mockResolvedValue(1); // only 1 admin

    const result = await updateUserRoleAction(1, "user");

    expect(result).toEqual({
      success: false,
      error: "Cannot demote the last admin",
    });
    expect(mockUpdateUserRole).not.toHaveBeenCalled();
  });

  it("allows demoting admin when more than 1 admin exists", async () => {
    mockGetAuth.mockResolvedValue(adminAuthResult);
    mockGetUserById.mockResolvedValue(adminUser);
    mockGetAdminCount.mockResolvedValue(2); // 2 admins — safe to demote
    const demotedUser = { ...adminUser, role: "user" as const };
    mockUpdateUserRole.mockResolvedValue(demotedUser);
    mockDeleteAllUserSessionsFromDb.mockResolvedValue(undefined);

    const result = await updateUserRoleAction(1, "user");

    expect(result.success).toBe(true);
    expect(result.user).toEqual(demotedUser);
  });

  it("invalidates target user sessions on success", async () => {
    mockGetAuth.mockResolvedValue(adminAuthResult);
    mockGetUserById.mockResolvedValue(regularUser);
    const promotedUser = { ...regularUser, role: "admin" as const };
    mockUpdateUserRole.mockResolvedValue(promotedUser);
    mockDeleteAllUserSessionsFromDb.mockResolvedValue(undefined);

    await updateUserRoleAction(2, "admin");

    expect(mockDeleteAllUserSessionsFromDb).toHaveBeenCalledWith(2);
  });

  it("returns error when updateUserRole throws", async () => {
    mockGetAuth.mockResolvedValue(adminAuthResult);
    mockGetUserById.mockResolvedValue(regularUser);
    mockUpdateUserRole.mockRejectedValue(new Error("DB error"));

    const result = await updateUserRoleAction(2, "admin");

    expect(result).toEqual({
      success: false,
      error: "Failed to update user role",
    });
  });
});

// ============================================================================
// getUserDetailsAction
// ============================================================================

describe("getUserDetailsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns error when not authenticated", async () => {
    mockGetAuth.mockResolvedValue(null);

    const result = await getUserDetailsAction(1);

    expect(result).toEqual({ success: false, error: "Not authenticated" });
  });

  it("returns error when not admin", async () => {
    mockGetAuth.mockResolvedValue(userAuthResult);

    const result = await getUserDetailsAction(1);

    expect(result).toEqual({ success: false, error: "Admin access required" });
  });

  it("returns error when user not found", async () => {
    mockGetAuth.mockResolvedValue(adminAuthResult);
    mockGetUserById.mockResolvedValue(null);

    const result = await getUserDetailsAction(999);

    expect(result).toEqual({ success: false, error: "User not found" });
  });

  it("returns user with apiKeyCount and sessionCount on happy path", async () => {
    mockGetAuth.mockResolvedValue(adminAuthResult);
    mockGetUserById.mockResolvedValue(regularUser);

    // Setup parallel count queries
    // First get() call → apiKey count, second → session count
    mockDbGet
      .mockResolvedValueOnce({ count: 3 })
      .mockResolvedValueOnce({ count: 2 });
    mockDbWhere.mockReturnValue({ get: mockDbGet });
    mockDbFrom.mockReturnValue({ where: mockDbWhere });

    const result = await getUserDetailsAction(2);

    expect(result.success).toBe(true);
    expect(result.user?.apiKeyCount).toBe(3);
    expect(result.user?.sessionCount).toBe(2);
    expect(result.user?.email).toBe(regularUser.email);
  });

  it("handles undefined count results (returns 0)", async () => {
    mockGetAuth.mockResolvedValue(adminAuthResult);
    mockGetUserById.mockResolvedValue(regularUser);

    mockDbGet.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined);
    mockDbWhere.mockReturnValue({ get: mockDbGet });
    mockDbFrom.mockReturnValue({ where: mockDbWhere });

    const result = await getUserDetailsAction(2);

    expect(result.success).toBe(true);
    expect(result.user?.apiKeyCount).toBe(0);
    expect(result.user?.sessionCount).toBe(0);
  });

  it("returns error when DB throws", async () => {
    mockGetAuth.mockResolvedValue(adminAuthResult);
    mockGetUserById.mockRejectedValue(new Error("DB failure"));

    const result = await getUserDetailsAction(2);

    expect(result).toEqual({
      success: false,
      error: "Failed to get user details",
    });
  });
});

// ============================================================================
// createUserAction
// ============================================================================

describe("createUserAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validInput = {
    email: "newuser@example.com",
    username: "newuser",
    password: "Password123",
    role: "user" as const,
  };

  it("returns error when not authenticated", async () => {
    mockGetAuth.mockResolvedValue(null);

    const result = await createUserAction(validInput);

    expect(result).toEqual({ success: false, error: "Not authenticated" });
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it("returns error when not admin", async () => {
    mockGetAuth.mockResolvedValue(userAuthResult);

    const result = await createUserAction(validInput);

    expect(result).toEqual({ success: false, error: "Admin access required" });
  });

  it("returns error for invalid email format", async () => {
    mockGetAuth.mockResolvedValue(adminAuthResult);

    const result = await createUserAction({
      ...validInput,
      email: "notanemail",
    });

    expect(result).toEqual({ success: false, error: "Invalid email format" });
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it("returns error for invalid username (too short)", async () => {
    mockGetAuth.mockResolvedValue(adminAuthResult);

    const result = await createUserAction({ ...validInput, username: "ab" });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Username must be/);
  });

  it("returns error for invalid username (special characters)", async () => {
    mockGetAuth.mockResolvedValue(adminAuthResult);

    const result = await createUserAction({
      ...validInput,
      username: "bad user!",
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Username must be/);
  });

  it("returns error for password shorter than 8 characters", async () => {
    mockGetAuth.mockResolvedValue(adminAuthResult);

    const result = await createUserAction({ ...validInput, password: "short" });

    expect(result).toEqual({
      success: false,
      error: "Password must be at least 8 characters",
    });
  });

  it("returns error when email is already in use", async () => {
    mockGetAuth.mockResolvedValue(adminAuthResult);
    mockGetUserByEmail.mockResolvedValue(regularUser); // email taken

    const result = await createUserAction(validInput);

    expect(result).toEqual({ success: false, error: "Email already in use" });
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it("returns error when username is already in use", async () => {
    mockGetAuth.mockResolvedValue(adminAuthResult);
    mockGetUserByEmail.mockResolvedValue(null); // email is free
    mockGetUserByUsername.mockResolvedValue(regularUser); // username taken

    const result = await createUserAction(validInput);

    expect(result).toEqual({
      success: false,
      error: "Username already in use",
    });
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it("creates user and returns AuthUser on happy path", async () => {
    mockGetAuth.mockResolvedValue(adminAuthResult);
    mockGetUserByEmail.mockResolvedValue(null);
    mockGetUserByUsername.mockResolvedValue(null);
    mockCreateUser.mockResolvedValue(regularUser);

    const result = await createUserAction(validInput);

    expect(result.success).toBe(true);
    expect(result.user).toEqual(regularUser);
    expect(mockCreateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: validInput.email,
        username: validInput.username,
        role: validInput.role,
      }),
    );
  });

  it("returns error when createUser throws (e.g., DB constraint)", async () => {
    mockGetAuth.mockResolvedValue(adminAuthResult);
    mockGetUserByEmail.mockResolvedValue(null);
    mockGetUserByUsername.mockResolvedValue(null);
    mockCreateUser.mockRejectedValue(new Error("UNIQUE constraint failed"));

    const result = await createUserAction(validInput);

    expect(result).toEqual({ success: false, error: "Failed to create user" });
  });
});

// ============================================================================
// deleteUserAction
// ============================================================================

describe("deleteUserAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns error when not authenticated", async () => {
    mockGetAuth.mockResolvedValue(null);

    const result = await deleteUserAction(2);

    expect(result).toEqual({ success: false, error: "Not authenticated" });
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it("returns error when not admin", async () => {
    mockGetAuth.mockResolvedValue(userAuthResult);

    const result = await deleteUserAction(2);

    expect(result).toEqual({ success: false, error: "Admin access required" });
  });

  it("prevents self-deletion", async () => {
    mockGetAuth.mockResolvedValue(adminAuthResult); // requireAdmin()
    // deleteUserAction calls getAuth() again for self-check
    mockGetAuth
      .mockResolvedValueOnce(adminAuthResult) // requireAdmin check
      .mockResolvedValueOnce(adminAuthResult); // self-check

    const result = await deleteUserAction(1); // adminUser.id === 1

    expect(result).toEqual({
      success: false,
      error: "Cannot delete your own account",
    });
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it("returns error when target user not found", async () => {
    mockGetAuth
      .mockResolvedValueOnce(adminAuthResult) // requireAdmin
      .mockResolvedValueOnce(adminAuthResult); // self-check
    mockGetUserById.mockResolvedValue(null);

    const result = await deleteUserAction(999);

    expect(result).toEqual({ success: false, error: "User not found" });
  });

  it("prevents deleting the last admin", async () => {
    mockGetAuth
      .mockResolvedValueOnce(adminAuthResult)
      .mockResolvedValueOnce(adminAuthResult);
    mockGetUserById.mockResolvedValue({ ...adminUser, id: 99 }); // another admin
    mockGetAdminCount.mockResolvedValue(1);

    const result = await deleteUserAction(99);

    expect(result).toEqual({
      success: false,
      error: "Cannot delete the last admin",
    });
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it("deletes user and invalidates sessions on happy path", async () => {
    mockGetAuth
      .mockResolvedValueOnce(adminAuthResult)
      .mockResolvedValueOnce(adminAuthResult);
    mockGetUserById.mockResolvedValue(regularUser); // non-admin target
    mockDeleteAllUserSessionsFromDb.mockResolvedValue(undefined);
    mockDeleteUser.mockResolvedValue(true);

    const result = await deleteUserAction(2);

    expect(result).toEqual({ success: true });
    expect(mockDeleteAllUserSessionsFromDb).toHaveBeenCalledWith(2);
    expect(mockDeleteUser).toHaveBeenCalledWith(2);
  });

  it("returns error when deleteUser returns false (not found after pre-checks)", async () => {
    mockGetAuth
      .mockResolvedValueOnce(adminAuthResult)
      .mockResolvedValueOnce(adminAuthResult);
    mockGetUserById.mockResolvedValue(regularUser);
    mockDeleteAllUserSessionsFromDb.mockResolvedValue(undefined);
    mockDeleteUser.mockResolvedValue(false);

    const result = await deleteUserAction(2);

    expect(result).toEqual({ success: false, error: "Failed to delete user" });
  });

  it("allows deleting admin when multiple admins exist", async () => {
    const secondAdmin = { ...adminUser, id: 3, email: "admin2@example.com" };
    mockGetAuth
      .mockResolvedValueOnce(adminAuthResult) // requireAdmin
      .mockResolvedValueOnce(adminAuthResult); // self-check (id:1, deleting id:3)
    mockGetUserById.mockResolvedValue(secondAdmin);
    mockGetAdminCount.mockResolvedValue(2); // 2 admins — safe to delete
    mockDeleteAllUserSessionsFromDb.mockResolvedValue(undefined);
    mockDeleteUser.mockResolvedValue(true);

    const result = await deleteUserAction(3);

    expect(result).toEqual({ success: true });
  });
});

// ============================================================================
// editUserAction
// ============================================================================

describe("editUserAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validEdit = {
    email: "updated@example.com",
    username: "updateduser",
    displayName: "Updated Name",
  };

  it("returns error when not authenticated", async () => {
    mockGetAuth.mockResolvedValue(null);

    const result = await editUserAction(2, validEdit);

    expect(result).toEqual({ success: false, error: "Not authenticated" });
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("returns error when not admin", async () => {
    mockGetAuth.mockResolvedValue(userAuthResult);

    const result = await editUserAction(2, validEdit);

    expect(result).toEqual({ success: false, error: "Admin access required" });
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("returns error when target user not found", async () => {
    mockGetAuth.mockResolvedValue(adminAuthResult);
    mockGetUserById.mockResolvedValue(null);

    const result = await editUserAction(999, validEdit);

    expect(result).toEqual({ success: false, error: "User not found" });
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("returns error when email conflicts with another user", async () => {
    mockGetAuth.mockResolvedValue(adminAuthResult);
    mockGetUserById.mockResolvedValue(regularUser);
    mockIsEmailTaken.mockResolvedValue(true); // email is taken by someone else

    const result = await editUserAction(2, { email: "taken@example.com" });

    expect(result).toEqual({ success: false, error: "Email already in use" });
    expect(mockIsEmailTaken).toHaveBeenCalledWith("taken@example.com", 2);
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("returns error when username conflicts with another user", async () => {
    mockGetAuth.mockResolvedValue(adminAuthResult);
    mockGetUserById.mockResolvedValue(regularUser);
    mockIsEmailTaken.mockResolvedValue(false); // email is fine
    mockIsUsernameTaken.mockResolvedValue(true); // username is taken

    const result = await editUserAction(2, {
      email: "new@example.com",
      username: "takenuser",
    });

    expect(result).toEqual({
      success: false,
      error: "Username already in use",
    });
    expect(mockIsUsernameTaken).toHaveBeenCalledWith("takenuser", 2);
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("successfully edits a regular user", async () => {
    mockGetAuth.mockResolvedValue(adminAuthResult);
    mockGetUserById.mockResolvedValue(regularUser);
    mockIsEmailTaken.mockResolvedValue(false);
    mockIsUsernameTaken.mockResolvedValue(false);
    const updatedUser = {
      ...regularUser,
      email: validEdit.email,
      username: validEdit.username,
      displayName: validEdit.displayName,
    };
    mockUpdateUser.mockResolvedValue(updatedUser);

    const result = await editUserAction(2, validEdit);

    expect(result.success).toBe(true);
    expect(result.user).toEqual(updatedUser);
    expect(mockUpdateUser).toHaveBeenCalledWith(2, {
      email: validEdit.email,
      username: validEdit.username,
      displayName: validEdit.displayName,
    });
  });

  it("successfully edits an admin user", async () => {
    mockGetAuth.mockResolvedValue(adminAuthResult);
    const otherAdmin = { ...adminUser, id: 3, email: "admin2@example.com" };
    mockGetUserById.mockResolvedValue(otherAdmin);
    mockIsEmailTaken.mockResolvedValue(false);
    mockIsUsernameTaken.mockResolvedValue(false);
    const updatedAdmin = { ...otherAdmin, displayName: "New Admin Name" };
    mockUpdateUser.mockResolvedValue(updatedAdmin);

    const result = await editUserAction(3, { displayName: "New Admin Name" });

    expect(result.success).toBe(true);
    expect(result.user).toEqual(updatedAdmin);
    expect(mockUpdateUser).toHaveBeenCalledWith(3, {
      displayName: "New Admin Name",
    });
  });

  it("allows setting displayName to null", async () => {
    mockGetAuth.mockResolvedValue(adminAuthResult);
    mockGetUserById.mockResolvedValue(regularUser);
    const updatedUser = { ...regularUser, displayName: null };
    mockUpdateUser.mockResolvedValue(updatedUser);

    const result = await editUserAction(2, { displayName: null });

    expect(result.success).toBe(true);
    expect(result.user?.displayName).toBeNull();
    expect(mockUpdateUser).toHaveBeenCalledWith(2, { displayName: null });
  });

  it("returns error for invalid email format", async () => {
    mockGetAuth.mockResolvedValue(adminAuthResult);
    mockGetUserById.mockResolvedValue(regularUser);

    const result = await editUserAction(2, { email: "notanemail" });

    expect(result).toEqual({ success: false, error: "Invalid email format" });
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("returns error for invalid username format", async () => {
    mockGetAuth.mockResolvedValue(adminAuthResult);
    mockGetUserById.mockResolvedValue(regularUser);

    const result = await editUserAction(2, { username: "ab" });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Username must be/);
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("returns error when updateUser throws", async () => {
    mockGetAuth.mockResolvedValue(adminAuthResult);
    mockGetUserById.mockResolvedValue(regularUser);
    mockIsEmailTaken.mockResolvedValue(false);
    mockIsUsernameTaken.mockResolvedValue(false);
    mockUpdateUser.mockRejectedValue(new Error("DB failure"));

    const result = await editUserAction(2, validEdit);

    expect(result).toEqual({
      success: false,
      error: "Failed to update user",
    });
  });
});

// ============================================================================
// resetUserPasswordAction
// ============================================================================

describe("resetUserPasswordAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validPassword = "NewSecurePassword123";

  it("returns error when not authenticated", async () => {
    mockGetAuth.mockResolvedValue(null);

    const result = await resetUserPasswordAction(2, validPassword);

    expect(result).toEqual({ success: false, error: "Not authenticated" });
    expect(mockUpdateUserPassword).not.toHaveBeenCalled();
  });

  it("returns error when authenticated as non-admin (user role)", async () => {
    mockGetAuth.mockResolvedValue(userAuthResult);

    const result = await resetUserPasswordAction(2, validPassword);

    expect(result).toEqual({ success: false, error: "Admin access required" });
    expect(mockUpdateUserPassword).not.toHaveBeenCalled();
  });

  it("returns error when authenticated as guest", async () => {
    mockGetAuth.mockResolvedValue(guestAuthResult);

    const result = await resetUserPasswordAction(2, validPassword);

    expect(result).toEqual({ success: false, error: "Admin access required" });
    expect(mockUpdateUserPassword).not.toHaveBeenCalled();
  });

  it("prevents admin from resetting their own password", async () => {
    mockGetAuth
      .mockResolvedValueOnce(adminAuthResult) // requireAdmin
      .mockResolvedValueOnce(adminAuthResult); // self-check

    const result = await resetUserPasswordAction(1, validPassword); // adminUser.id === 1

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Cannot reset your own password/);
    expect(result.error).toMatch(/profile/i);
    expect(mockUpdateUserPassword).not.toHaveBeenCalled();
  });

  it("returns error for password shorter than 8 characters", async () => {
    mockGetAuth
      .mockResolvedValueOnce(adminAuthResult) // requireAdmin
      .mockResolvedValueOnce(adminAuthResult); // self-check

    const result = await resetUserPasswordAction(2, "short");

    expect(result).toEqual({
      success: false,
      error: "Password must be at least 8 characters",
    });
    expect(mockUpdateUserPassword).not.toHaveBeenCalled();
  });

  it("returns error when target user not found", async () => {
    mockGetAuth
      .mockResolvedValueOnce(adminAuthResult)
      .mockResolvedValueOnce(adminAuthResult);
    mockGetUserById.mockResolvedValue(null);

    const result = await resetUserPasswordAction(999, validPassword);

    expect(result).toEqual({ success: false, error: "User not found" });
    expect(mockUpdateUserPassword).not.toHaveBeenCalled();
  });

  it("resets password and invalidates sessions on success", async () => {
    mockGetAuth
      .mockResolvedValueOnce(adminAuthResult)
      .mockResolvedValueOnce(adminAuthResult);
    mockGetUserById.mockResolvedValue(regularUser);
    mockUpdateUserPassword.mockResolvedValue(undefined);
    mockDeleteAllUserSessionsFromDb.mockResolvedValue(undefined);

    const result = await resetUserPasswordAction(2, validPassword);

    expect(result).toEqual({ success: true });
    expect(mockUpdateUserPassword).toHaveBeenCalledWith(2, validPassword);
    expect(mockDeleteAllUserSessionsFromDb).toHaveBeenCalledWith(2);
  });

  it("allows resetting another admin's password", async () => {
    const otherAdmin = { ...adminUser, id: 3, email: "admin2@example.com" };
    mockGetAuth
      .mockResolvedValueOnce(adminAuthResult) // requireAdmin
      .mockResolvedValueOnce(adminAuthResult); // self-check (id:1, resetting id:3)
    mockGetUserById.mockResolvedValue(otherAdmin);
    mockUpdateUserPassword.mockResolvedValue(undefined);
    mockDeleteAllUserSessionsFromDb.mockResolvedValue(undefined);

    const result = await resetUserPasswordAction(3, validPassword);

    expect(result).toEqual({ success: true });
    expect(mockUpdateUserPassword).toHaveBeenCalledWith(3, validPassword);
    expect(mockDeleteAllUserSessionsFromDb).toHaveBeenCalledWith(3);
  });

  it("returns error when updateUserPassword throws", async () => {
    mockGetAuth
      .mockResolvedValueOnce(adminAuthResult)
      .mockResolvedValueOnce(adminAuthResult);
    mockGetUserById.mockResolvedValue(regularUser);
    mockUpdateUserPassword.mockRejectedValue(new Error("DB error"));

    const result = await resetUserPasswordAction(2, validPassword);

    expect(result).toEqual({
      success: false,
      error: "Failed to reset password",
    });
  });
});
