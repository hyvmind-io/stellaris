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

// --- Password ---
const mockVerifyPassword = vi.fn<AnyFn>();

vi.mock("@/lib/auth/password", () => ({
  verifyPassword: (...args: unknown[]) => mockVerifyPassword(...args),
}));

// --- Session ---
const mockDeleteAllUserSessions = vi.fn<AnyFn>();
const mockCreateSession = vi.fn<AnyFn>();

vi.mock("@/lib/auth/session", () => ({
  deleteAllUserSessions: (...args: unknown[]) =>
    mockDeleteAllUserSessions(...args),
  createSession: (...args: unknown[]) => mockCreateSession(...args),
}));

// --- User data layer ---
const mockUpdateUser = vi.fn<AnyFn>();
const mockUpdateUserPassword = vi.fn<AnyFn>();
const mockIsEmailTaken = vi.fn<AnyFn>();
const mockIsUsernameTaken = vi.fn<AnyFn>();
const mockGetUserByEmailWithPassword = vi.fn<AnyFn>();

vi.mock("@/lib/data/users", () => ({
  updateUser: (...args: unknown[]) => mockUpdateUser(...args),
  updateUserPassword: (...args: unknown[]) => mockUpdateUserPassword(...args),
  isEmailTaken: (...args: unknown[]) => mockIsEmailTaken(...args),
  isUsernameTaken: (...args: unknown[]) => mockIsUsernameTaken(...args),
  getUserByEmailWithPassword: (...args: unknown[]) =>
    mockGetUserByEmailWithPassword(...args),
}));

// --- API key data layer ---
const mockCreateUserApiKey = vi.fn<AnyFn>();
const mockGetUserApiKeys = vi.fn<AnyFn>();
const mockDeleteUserApiKey = vi.fn<AnyFn>();
const mockUpdateUserApiKey = vi.fn<AnyFn>();

vi.mock("@/lib/data/api-keys", () => ({
  createUserApiKey: (...args: unknown[]) => mockCreateUserApiKey(...args),
  getUserApiKeys: (...args: unknown[]) => mockGetUserApiKeys(...args),
  deleteUserApiKey: (...args: unknown[]) => mockDeleteUserApiKey(...args),
  updateUserApiKey: (...args: unknown[]) => mockUpdateUserApiKey(...args),
}));

import {
  updateProfileAction,
  changePasswordAction,
  createApiKeyAction,
  listApiKeysAction,
  deleteApiKeyAction,
  updateApiKeyAction,
} from "@/app/actions/profile";

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

const guestUser = {
  id: 3,
  email: "guest@example.com",
  username: "guestuser",
  displayName: "Guest User",
  role: "guest" as const,
  createdAt: NOW,
  updatedAt: NOW,
  lastLoginAt: null,
};

const adminAuthResult = { user: adminUser, sessionId: "session-admin" };
const userAuthResult = { user: regularUser, sessionId: "session-user" };
const guestAuthResult = { user: guestUser, sessionId: "session-guest" };

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
// updateProfileAction
// ============================================================================

describe("updateProfileAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns error when not authenticated", async () => {
    mockGetAuth.mockResolvedValue(null);

    const result = await updateProfileAction({ displayName: "New Name" });

    expect(result).toEqual({ success: false, error: "Not authenticated" });
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("returns validation error for invalid displayName (too long)", async () => {
    mockGetAuth.mockResolvedValue(userAuthResult);

    const result = await updateProfileAction({ displayName: "x".repeat(51) });

    expect(result.success).toBe(false);
    // The Zod error will be something about max length
    expect(result.error).toBeTruthy();
  });

  it("returns validation error for invalid username", async () => {
    mockGetAuth.mockResolvedValue(userAuthResult);

    const result = await updateProfileAction({ username: "ab" }); // too short

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/3 characters/);
  });

  it("returns error when non-admin tries to change email", async () => {
    mockGetAuth.mockResolvedValue(userAuthResult);

    const result = await updateProfileAction({ email: "new@example.com" });

    expect(result).toEqual({
      success: false,
      error: "Only administrators can change their email address",
    });
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("returns error when username is already taken", async () => {
    mockGetAuth.mockResolvedValue(userAuthResult);
    mockIsUsernameTaken.mockResolvedValue(true);

    const result = await updateProfileAction({ username: "takenname" });

    expect(result).toEqual({ success: false, error: "Username already taken" });
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("returns error when email is already in use (admin updating email)", async () => {
    mockGetAuth.mockResolvedValue(adminAuthResult);
    mockIsEmailTaken.mockResolvedValue(true);

    const result = await updateProfileAction({ email: "taken@example.com" });

    expect(result).toEqual({ success: false, error: "Email already in use" });
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("updates profile successfully for regular user", async () => {
    mockGetAuth.mockResolvedValue(userAuthResult);
    mockIsUsernameTaken.mockResolvedValue(false);
    const updatedUser = { ...regularUser, displayName: "Updated Name" };
    mockUpdateUser.mockResolvedValue(updatedUser);

    const result = await updateProfileAction({
      displayName: "Updated Name",
      username: "newusername",
    });

    expect(result.success).toBe(true);
    expect(result.user).toEqual(updatedUser);
  });

  it("allows admin to update email", async () => {
    mockGetAuth.mockResolvedValue(adminAuthResult);
    mockIsEmailTaken.mockResolvedValue(false);
    const updatedAdmin = { ...adminUser, email: "newemail@example.com" };
    mockUpdateUser.mockResolvedValue(updatedAdmin);

    const result = await updateProfileAction({ email: "newemail@example.com" });

    expect(result.success).toBe(true);
    expect(mockUpdateUser).toHaveBeenCalledWith(
      adminUser.id,
      expect.objectContaining({ email: "newemail@example.com" }),
    );
  });

  it("skips username uniqueness check when username is unchanged", async () => {
    mockGetAuth.mockResolvedValue(userAuthResult);
    mockUpdateUser.mockResolvedValue(regularUser);

    // Same username as current
    const result = await updateProfileAction({
      username: regularUser.username,
    });

    expect(mockIsUsernameTaken).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it("returns error when updateUser throws", async () => {
    mockGetAuth.mockResolvedValue(userAuthResult);
    mockIsUsernameTaken.mockResolvedValue(false);
    mockUpdateUser.mockRejectedValue(new Error("DB error"));

    const result = await updateProfileAction({ username: "newname" });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Failed to update profile/);
  });
});

// ============================================================================
// changePasswordAction
// ============================================================================

describe("changePasswordAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validInput = {
    currentPassword: "OldPassword123",
    newPassword: "NewPassword456",
  };

  it("returns error when not authenticated", async () => {
    mockGetAuth.mockResolvedValue(null);

    const result = await changePasswordAction(validInput);

    expect(result).toEqual({ success: false, error: "Not authenticated" });
    expect(mockVerifyPassword).not.toHaveBeenCalled();
  });

  it("returns validation error for empty current password", async () => {
    mockGetAuth.mockResolvedValue(userAuthResult);

    const result = await changePasswordAction({
      currentPassword: "",
      newPassword: "NewPassword456",
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Current password is required/);
  });

  it("returns validation error for new password shorter than 8 chars", async () => {
    mockGetAuth.mockResolvedValue(userAuthResult);

    const result = await changePasswordAction({
      currentPassword: "OldPassword123",
      newPassword: "short",
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/8 characters/);
  });

  it("returns error when current password is incorrect", async () => {
    mockGetAuth.mockResolvedValue(userAuthResult);
    const dbUser = { ...regularUser, passwordHash: "existing_hash" };
    mockGetUserByEmailWithPassword.mockResolvedValue(dbUser);
    mockVerifyPassword.mockResolvedValue(false);

    const result = await changePasswordAction(validInput);

    expect(result).toEqual({
      success: false,
      error: "Current password is incorrect",
    });
    expect(mockUpdateUserPassword).not.toHaveBeenCalled();
  });

  it("updates password, invalidates all sessions, creates new session on success", async () => {
    mockGetAuth.mockResolvedValue(userAuthResult);
    const dbUser = { ...regularUser, passwordHash: "existing_hash" };
    mockGetUserByEmailWithPassword.mockResolvedValue(dbUser);
    mockVerifyPassword.mockResolvedValue(true);
    mockUpdateUserPassword.mockResolvedValue(undefined);
    mockDeleteAllUserSessions.mockResolvedValue(undefined);
    mockCreateSession.mockResolvedValue(undefined);

    const result = await changePasswordAction(validInput);

    expect(result.success).toBe(true);
    expect(mockUpdateUserPassword).toHaveBeenCalledWith(
      regularUser.id,
      validInput.newPassword,
    );
    expect(mockDeleteAllUserSessions).toHaveBeenCalledWith(regularUser.id);
    expect(mockCreateSession).toHaveBeenCalledWith(regularUser.id);
  });

  it("returns the current auth user on success", async () => {
    mockGetAuth.mockResolvedValue(userAuthResult);
    const dbUser = { ...regularUser, passwordHash: "existing_hash" };
    mockGetUserByEmailWithPassword.mockResolvedValue(dbUser);
    mockVerifyPassword.mockResolvedValue(true);
    mockUpdateUserPassword.mockResolvedValue(undefined);
    mockDeleteAllUserSessions.mockResolvedValue(undefined);
    mockCreateSession.mockResolvedValue(undefined);

    const result = await changePasswordAction(validInput);

    expect(result.user).toEqual(regularUser);
  });

  it("returns error when updateUserPassword throws", async () => {
    mockGetAuth.mockResolvedValue(userAuthResult);
    const dbUser = { ...regularUser, passwordHash: "existing_hash" };
    mockGetUserByEmailWithPassword.mockResolvedValue(dbUser);
    mockVerifyPassword.mockResolvedValue(true);
    mockUpdateUserPassword.mockRejectedValue(new Error("DB error"));

    const result = await changePasswordAction(validInput);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Failed to change password/);
  });
});

// ============================================================================
// createApiKeyAction
// ============================================================================

describe("createApiKeyAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns error when not authenticated", async () => {
    mockGetAuth.mockResolvedValue(null);

    const result = await createApiKeyAction({ name: "my-key" });

    expect(result).toEqual({ success: false, error: "Not authenticated" });
    expect(mockCreateUserApiKey).not.toHaveBeenCalled();
  });

  it("returns error when user is a guest", async () => {
    mockGetAuth.mockResolvedValue(guestAuthResult);

    const result = await createApiKeyAction({ name: "my-key" });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Guests cannot create API keys/);
    expect(mockCreateUserApiKey).not.toHaveBeenCalled();
  });

  it("returns validation error for empty name", async () => {
    mockGetAuth.mockResolvedValue(userAuthResult);

    const result = await createApiKeyAction({ name: "" });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Key name is required/);
    expect(mockCreateUserApiKey).not.toHaveBeenCalled();
  });

  it("returns validation error for name exceeding 100 characters", async () => {
    mockGetAuth.mockResolvedValue(userAuthResult);

    const result = await createApiKeyAction({ name: "x".repeat(101) });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/100 characters/);
    expect(mockCreateUserApiKey).not.toHaveBeenCalled();
  });

  it("creates API key and returns key data + plainTextKey on success", async () => {
    mockGetAuth.mockResolvedValue(userAuthResult);
    mockCreateUserApiKey.mockResolvedValue({
      key: apiKeyData,
      plainTextKey: "stlr_abc123",
    });

    const result = await createApiKeyAction({ name: "my-key" });

    expect(result.success).toBe(true);
    expect(result.key).toEqual(apiKeyData);
    expect(result.plainTextKey).toBe("stlr_abc123");
    expect(mockCreateUserApiKey).toHaveBeenCalledWith(
      regularUser.id,
      "my-key",
      undefined,
    );
  });

  it("allows non-guest authenticated users (admin) to create keys", async () => {
    mockGetAuth.mockResolvedValue(adminAuthResult);
    mockCreateUserApiKey.mockResolvedValue({
      key: apiKeyData,
      plainTextKey: "stlr_admin_key",
    });

    const result = await createApiKeyAction({ name: "admin-key" });

    expect(result.success).toBe(true);
    expect(mockCreateUserApiKey).toHaveBeenCalledWith(
      adminUser.id,
      "admin-key",
      undefined,
    );
  });

  it("passes custom permissions to createUserApiKey", async () => {
    mockGetAuth.mockResolvedValue(userAuthResult);
    const customKeyData = {
      ...apiKeyData,
      permissions: ["modules:read", "providers:read"],
    };
    mockCreateUserApiKey.mockResolvedValue({
      key: customKeyData,
      plainTextKey: "stlr_custom",
    });

    const result = await createApiKeyAction({
      name: "read-only",
      permissions: ["modules:read", "providers:read"],
    });

    expect(result.success).toBe(true);
    expect(mockCreateUserApiKey).toHaveBeenCalledWith(
      regularUser.id,
      "read-only",
      ["modules:read", "providers:read"],
    );
  });

  it("returns error when createUserApiKey throws", async () => {
    mockGetAuth.mockResolvedValue(userAuthResult);
    mockCreateUserApiKey.mockRejectedValue(new Error("DB error"));

    const result = await createApiKeyAction({ name: "my-key" });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Failed to create API key/);
  });
});

// ============================================================================
// listApiKeysAction
// ============================================================================

describe("listApiKeysAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns error when not authenticated", async () => {
    mockGetAuth.mockResolvedValue(null);

    const result = await listApiKeysAction();

    expect(result).toEqual({ success: false, error: "Not authenticated" });
    expect(mockGetUserApiKeys).not.toHaveBeenCalled();
  });

  it("returns list of API keys on success", async () => {
    mockGetAuth.mockResolvedValue(userAuthResult);
    mockGetUserApiKeys.mockResolvedValue([apiKeyData]);

    const result = await listApiKeysAction();

    expect(result.success).toBe(true);
    expect(result.keys).toEqual([apiKeyData]);
    expect(mockGetUserApiKeys).toHaveBeenCalledWith(regularUser.id);
  });

  it("returns empty keys array when user has no keys", async () => {
    mockGetAuth.mockResolvedValue(userAuthResult);
    mockGetUserApiKeys.mockResolvedValue([]);

    const result = await listApiKeysAction();

    expect(result.success).toBe(true);
    expect(result.keys).toEqual([]);
  });

  it("returns error when getUserApiKeys throws", async () => {
    mockGetAuth.mockResolvedValue(userAuthResult);
    mockGetUserApiKeys.mockRejectedValue(new Error("DB error"));

    const result = await listApiKeysAction();

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Failed to load API keys/);
  });
});

// ============================================================================
// deleteApiKeyAction
// ============================================================================

describe("deleteApiKeyAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns error when not authenticated", async () => {
    mockGetAuth.mockResolvedValue(null);

    const result = await deleteApiKeyAction(10);

    expect(result).toEqual({ success: false, error: "Not authenticated" });
    expect(mockDeleteUserApiKey).not.toHaveBeenCalled();
  });

  it("returns error when key not found or not owned by user", async () => {
    mockGetAuth.mockResolvedValue(userAuthResult);
    mockDeleteUserApiKey.mockResolvedValue(false);

    const result = await deleteApiKeyAction(999);

    expect(result).toEqual({
      success: false,
      error: "Key not found or you do not have permission to delete it",
    });
  });

  it("deletes key and returns success", async () => {
    mockGetAuth.mockResolvedValue(userAuthResult);
    mockDeleteUserApiKey.mockResolvedValue(true);

    const result = await deleteApiKeyAction(10);

    expect(result).toEqual({ success: true });
    expect(mockDeleteUserApiKey).toHaveBeenCalledWith(10, regularUser.id);
  });

  it("returns error when deleteUserApiKey throws", async () => {
    mockGetAuth.mockResolvedValue(userAuthResult);
    mockDeleteUserApiKey.mockRejectedValue(new Error("DB error"));

    const result = await deleteApiKeyAction(10);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Failed to delete API key/);
  });

  it("verifies ownership by passing userId to deleteUserApiKey", async () => {
    mockGetAuth.mockResolvedValue(adminAuthResult);
    mockDeleteUserApiKey.mockResolvedValue(true);

    await deleteApiKeyAction(10);

    expect(mockDeleteUserApiKey).toHaveBeenCalledWith(10, adminUser.id);
  });
});

// ============================================================================
// updateApiKeyAction
// ============================================================================

describe("updateApiKeyAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns error when not authenticated", async () => {
    mockGetAuth.mockResolvedValue(null);

    const result = await updateApiKeyAction(10, { name: "updated" });

    expect(result).toEqual({ success: false, error: "Not authenticated" });
    expect(mockUpdateUserApiKey).not.toHaveBeenCalled();
  });

  it("returns error for invalid key ID", async () => {
    mockGetAuth.mockResolvedValue(userAuthResult);

    const result = await updateApiKeyAction(0, { name: "updated" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Invalid key ID");
    expect(mockUpdateUserApiKey).not.toHaveBeenCalled();
  });

  it("returns validation error when no fields provided", async () => {
    mockGetAuth.mockResolvedValue(userAuthResult);

    const result = await updateApiKeyAction(10, {});

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(mockUpdateUserApiKey).not.toHaveBeenCalled();
  });

  it("updates name successfully", async () => {
    mockGetAuth.mockResolvedValue(userAuthResult);
    const updated = { ...apiKeyData, name: "renamed" };
    mockUpdateUserApiKey.mockResolvedValue(updated);

    const result = await updateApiKeyAction(10, { name: "renamed" });

    expect(result.success).toBe(true);
    expect(result.key).toEqual(updated);
    expect(mockUpdateUserApiKey).toHaveBeenCalledWith(10, regularUser.id, {
      name: "renamed",
    });
  });

  it("updates permissions successfully", async () => {
    mockGetAuth.mockResolvedValue(userAuthResult);
    const updated = {
      ...apiKeyData,
      permissions: ["modules:read", "modules:write"],
    };
    mockUpdateUserApiKey.mockResolvedValue(updated);

    const result = await updateApiKeyAction(10, {
      permissions: ["modules:read", "modules:write"],
    });

    expect(result.success).toBe(true);
    expect(result.key!.permissions).toEqual(["modules:read", "modules:write"]);
    expect(mockUpdateUserApiKey).toHaveBeenCalledWith(10, regularUser.id, {
      permissions: ["modules:read", "modules:write"],
    });
  });

  it("updates both name and permissions", async () => {
    mockGetAuth.mockResolvedValue(userAuthResult);
    const updated = {
      ...apiKeyData,
      name: "new-name",
      permissions: ["providers:read"],
    };
    mockUpdateUserApiKey.mockResolvedValue(updated);

    const result = await updateApiKeyAction(10, {
      name: "new-name",
      permissions: ["providers:read"],
    });

    expect(result.success).toBe(true);
    expect(mockUpdateUserApiKey).toHaveBeenCalledWith(10, regularUser.id, {
      name: "new-name",
      permissions: ["providers:read"],
    });
  });

  it("returns error when key not found or not owned", async () => {
    mockGetAuth.mockResolvedValue(userAuthResult);
    mockUpdateUserApiKey.mockResolvedValue(null);

    const result = await updateApiKeyAction(999, { name: "test" });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Key not found or you do not have permission/);
  });

  it("returns error when updateUserApiKey throws", async () => {
    mockGetAuth.mockResolvedValue(userAuthResult);
    mockUpdateUserApiKey.mockRejectedValue(new Error("DB error"));

    const result = await updateApiKeyAction(10, { name: "test" });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Failed to update API key/);
  });

  it("returns validation error for empty permissions array", async () => {
    mockGetAuth.mockResolvedValue(userAuthResult);

    const result = await updateApiKeyAction(10, { permissions: [] });

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(mockUpdateUserApiKey).not.toHaveBeenCalled();
  });
});
