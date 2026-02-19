"use server";

import { count, eq } from "drizzle-orm";
import { getAuth } from "@/lib/auth/get-auth";
import { getDb } from "@/db/client";
import { apiKeys, sessions } from "@/db/schema";
import { isSignupEnabled, setSignupEnabled } from "@/lib/data/settings";
import {
  getAllUsers,
  getUserById,
  updateUserRole,
  getAdminCount,
  getUserByEmail,
  getUserByUsername,
  createUser,
  deleteUser,
} from "@/lib/data/users";
import { deleteAllUserSessionsFromDb } from "@/lib/auth/session";
import type { AuthUser, AuthUserWithCounts, UserRole } from "@/types/auth";

// ============================================================================
// Types
// ============================================================================

export interface ToggleSignupResult {
  success: boolean;
  enabled?: boolean;
  error?: string;
}

export interface ListUsersOptions {
  search?: string;
  role?: UserRole;
  page?: number;
  limit?: number;
}

export interface ListUsersResult {
  success: boolean;
  users?: AuthUser[];
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
  error?: string;
}

export interface UpdateRoleResult {
  success: boolean;
  user?: AuthUser;
  error?: string;
}

export interface UserDetailsResult {
  success: boolean;
  user?: AuthUserWithCounts;
  error?: string;
}

export interface CreateUserResult {
  success: boolean;
  user?: AuthUser;
  error?: string;
}

export interface DeleteUserResult {
  success: boolean;
  error?: string;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Verify the caller is an admin. Returns an error string if not.
 */
async function requireAdmin(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const auth = await getAuth();
  if (!auth) return { ok: false, error: "Not authenticated" };
  if (auth.user.role !== "admin") {
    return { ok: false, error: "Admin access required" };
  }
  return { ok: true };
}

// ============================================================================
// Signup Toggle Actions
// ============================================================================

/**
 * Get the current signup enabled/disabled state.
 * Does NOT require admin — safe to call from any server context.
 */
export async function getSignupStatusAction(): Promise<boolean> {
  try {
    return await isSignupEnabled();
  } catch (error) {
    console.error("[Admin] getSignupStatusAction error:", error);
    return true; // fail-open
  }
}

/**
 * Toggle public signup on or off. Requires admin role.
 */
export async function toggleSignupAction(
  enabled: boolean,
): Promise<ToggleSignupResult> {
  const check = await requireAdmin();
  if (!check.ok) {
    return { success: false, error: check.error };
  }

  try {
    await setSignupEnabled(enabled);
    return { success: true, enabled };
  } catch (error) {
    console.error("[Admin] toggleSignupAction error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to update signup setting",
    };
  }
}

// ============================================================================
// User Management Actions
// ============================================================================

/**
 * List all users with optional filtering and pagination. Requires admin role.
 */
export async function listUsersAction(
  options?: ListUsersOptions,
): Promise<ListUsersResult> {
  const check = await requireAdmin();
  if (!check.ok) {
    return { success: false, error: check.error };
  }

  const page = options?.page ?? 1;
  const limit = options?.limit ?? 10;

  try {
    const { users, total } = await getAllUsers(
      { search: options?.search, role: options?.role },
      { page, limit },
    );

    const totalPages = Math.ceil(total / limit);

    return { success: true, users, total, page, limit, totalPages };
  } catch (error) {
    console.error("[Admin] listUsersAction error:", error);
    return { success: false, error: "Failed to list users" };
  }
}

/**
 * Update a user's role. Requires admin role.
 * Prevents demoting the last admin.
 * Forces the target user to re-login by clearing their sessions.
 */
export async function updateUserRoleAction(
  userId: number,
  newRole: UserRole,
): Promise<UpdateRoleResult> {
  const check = await requireAdmin();
  if (!check.ok) {
    return { success: false, error: check.error };
  }

  try {
    // Verify the target user exists
    const targetUser = await getUserById(userId);
    if (!targetUser) {
      return { success: false, error: "User not found" };
    }

    // Prevent demoting the last admin
    if (targetUser.role === "admin" && newRole !== "admin") {
      const adminCount = await getAdminCount();
      if (adminCount <= 1) {
        return {
          success: false,
          error: "Cannot demote the last admin",
        };
      }
    }

    const updatedUser = await updateUserRole(userId, newRole);

    // Force target user to re-login with new role (cookie-safe version)
    await deleteAllUserSessionsFromDb(userId);

    return { success: true, user: updatedUser };
  } catch (error) {
    console.error("[Admin] updateUserRoleAction error:", error);
    return { success: false, error: "Failed to update user role" };
  }
}

/**
 * Get detailed user information including API key and session counts.
 * Requires admin role.
 */
export async function getUserDetailsAction(
  userId: number,
): Promise<UserDetailsResult> {
  const check = await requireAdmin();
  if (!check.ok) {
    return { success: false, error: check.error };
  }

  try {
    const user = await getUserById(userId);
    if (!user) {
      return { success: false, error: "User not found" };
    }

    const db = getDb();

    const [apiKeyResult, sessionResult] = await Promise.all([
      db
        .select({ count: count() })
        .from(apiKeys)
        .where(eq(apiKeys.userId, userId))
        .get(),
      db
        .select({ count: count() })
        .from(sessions)
        .where(eq(sessions.userId, userId))
        .get(),
    ]);

    const apiKeyCount = apiKeyResult?.count ?? 0;
    const sessionCount = sessionResult?.count ?? 0;

    const userWithCounts: AuthUserWithCounts = {
      ...user,
      apiKeyCount,
      sessionCount,
    };

    return { success: true, user: userWithCounts };
  } catch (error) {
    console.error("[Admin] getUserDetailsAction error:", error);
    return { success: false, error: "Failed to get user details" };
  }
}

/**
 * Create a new user. Requires admin role.
 * Validates input, checks email/username uniqueness.
 */
export async function createUserAction(data: {
  email: string;
  username: string;
  displayName?: string;
  password: string;
  role: UserRole;
}): Promise<CreateUserResult> {
  const check = await requireAdmin();
  if (!check.ok) {
    return { success: false, error: check.error };
  }

  try {
    // Basic validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email)) {
      return { success: false, error: "Invalid email format" };
    }

    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
    if (!usernameRegex.test(data.username)) {
      return {
        success: false,
        error:
          "Username must be 3-20 characters, alphanumeric and underscores only",
      };
    }

    if (data.password.length < 8) {
      return {
        success: false,
        error: "Password must be at least 8 characters",
      };
    }

    const validRoles: UserRole[] = ["admin", "user", "guest"];
    if (!validRoles.includes(data.role)) {
      return { success: false, error: "Invalid role" };
    }

    // Check uniqueness
    const existingEmail = await getUserByEmail(data.email);
    if (existingEmail) {
      return { success: false, error: "Email already in use" };
    }

    const existingUsername = await getUserByUsername(data.username);
    if (existingUsername) {
      return { success: false, error: "Username already in use" };
    }

    const user = await createUser({
      email: data.email,
      username: data.username,
      displayName: data.displayName,
      password: data.password,
      role: data.role,
    });

    return { success: true, user };
  } catch (error) {
    console.error("[Admin] createUserAction error:", error);
    return { success: false, error: "Failed to create user" };
  }
}

/**
 * Delete a user. Requires admin role.
 * Prevents self-deletion and deleting the last admin.
 */
export async function deleteUserAction(
  userId: number,
): Promise<DeleteUserResult> {
  const check = await requireAdmin();
  if (!check.ok) {
    return { success: false, error: check.error };
  }

  try {
    // Prevent self-deletion
    const auth = await getAuth();
    if (auth && userId === auth.user.id) {
      return { success: false, error: "Cannot delete your own account" };
    }

    // Verify the target user exists
    const targetUser = await getUserById(userId);
    if (!targetUser) {
      return { success: false, error: "User not found" };
    }

    // Prevent deleting the last admin
    if (targetUser.role === "admin") {
      const adminCount = await getAdminCount();
      if (adminCount <= 1) {
        return { success: false, error: "Cannot delete the last admin" };
      }
    }

    // Invalidate all sessions for the target user
    await deleteAllUserSessionsFromDb(userId);

    const deleted = await deleteUser(userId);
    if (!deleted) {
      return { success: false, error: "Failed to delete user" };
    }

    return { success: true };
  } catch (error) {
    console.error("[Admin] deleteUserAction error:", error);
    return { success: false, error: "Failed to delete user" };
  }
}
