"use server";

import { z } from "zod";
import { getAuth } from "@/lib/auth/get-auth";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, deleteAllUserSessions } from "@/lib/auth/session";
import {
  updateUser,
  updateUserPassword,
  isEmailTaken,
  isUsernameTaken,
  getUserByEmailWithPassword,
} from "@/lib/data/users";
import {
  createUserApiKey,
  getUserApiKeys,
  deleteUserApiKey,
  updateUserApiKey,
} from "@/lib/data/api-keys";
import type { AuthUser, ApiKeyData } from "@/types/auth";

// ============================================================================
// Action Result Types
// ============================================================================

export interface ProfileActionResult {
  success: boolean;
  error?: string;
  user?: AuthUser;
}

export interface ApiKeyActionResult {
  success: boolean;
  error?: string;
  key?: ApiKeyData;
  plainTextKey?: string;
}

export interface ApiKeyListResult {
  success: boolean;
  error?: string;
  keys?: ApiKeyData[];
}

// ============================================================================
// Validation Schemas
// ============================================================================

const updateProfileSchema = z.object({
  displayName: z.string().max(50).optional().nullable(),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(20, "Username must be at most 20 characters")
    .regex(
      /^[a-zA-Z0-9_]+$/,
      "Username can only contain letters, numbers, and underscores",
    )
    .optional(),
  email: z.string().email("Invalid email address").optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

const createKeySchema = z.object({
  name: z
    .string()
    .min(1, "Key name is required")
    .max(100, "Key name must be at most 100 characters"),
  permissions: z
    .array(z.string().min(1))
    .min(1, "At least one permission must be selected")
    .optional(),
});

const updateKeySchema = z
  .object({
    name: z
      .string()
      .min(1, "Key name is required")
      .max(100, "Key name must be at most 100 characters")
      .optional(),
    permissions: z
      .array(z.string().min(1))
      .min(1, "At least one permission must be selected")
      .optional(),
  })
  .refine((data) => data.name !== undefined || data.permissions !== undefined, {
    message: "At least one field must be provided",
  });

// ============================================================================
// Profile Actions
// ============================================================================

/**
 * Update the current user's profile information.
 * Only admin users can change their email address.
 */
export async function updateProfileAction(data: {
  displayName?: string | null;
  username?: string;
  email?: string;
}): Promise<ProfileActionResult> {
  try {
    const auth = await getAuth();
    if (!auth) {
      return { success: false, error: "Not authenticated" };
    }

    // Validate input
    const validated = updateProfileSchema.safeParse(data);
    if (!validated.success) {
      return {
        success: false,
        error: validated.error.issues[0]?.message || "Invalid input",
      };
    }

    const { displayName, username, email } = validated.data;
    const currentUser = auth.user;

    // Only admin can change email
    if (email && currentUser.role !== "admin") {
      return {
        success: false,
        error: "Only administrators can change their email address",
      };
    }

    // Check username uniqueness (if changed)
    if (username && username !== currentUser.username) {
      const taken = await isUsernameTaken(username, currentUser.id);
      if (taken) {
        return { success: false, error: "Username already taken" };
      }
    }

    // Check email uniqueness (admin only, if changed)
    if (email && email.toLowerCase() !== currentUser.email.toLowerCase()) {
      const taken = await isEmailTaken(email, currentUser.id);
      if (taken) {
        return { success: false, error: "Email already in use" };
      }
    }

    // Build update object
    const updateData: {
      displayName?: string | null;
      username?: string;
      email?: string;
    } = {};

    if (displayName !== undefined) {
      updateData.displayName = displayName;
    }
    if (username) {
      updateData.username = username;
    }
    if (email && currentUser.role === "admin") {
      updateData.email = email;
    }

    const updatedUser = await updateUser(currentUser.id, updateData);

    return { success: true, user: updatedUser };
  } catch (error) {
    console.error("[Profile] Update profile error:", error);
    return {
      success: false,
      error: "Failed to update profile. Please try again.",
    };
  }
}

/**
 * Change the current user's password.
 * Verifies the current password, then invalidates all sessions
 * and creates a fresh one so the user stays logged in.
 */
export async function changePasswordAction(data: {
  currentPassword: string;
  newPassword: string;
}): Promise<ProfileActionResult> {
  try {
    const auth = await getAuth();
    if (!auth) {
      return { success: false, error: "Not authenticated" };
    }

    // Validate input
    const validated = changePasswordSchema.safeParse(data);
    if (!validated.success) {
      return {
        success: false,
        error: validated.error.issues[0]?.message || "Invalid input",
      };
    }

    const { currentPassword, newPassword } = validated.data;

    // Get user with password hash for verification
    const user = await getUserByEmailWithPassword(auth.user.email);
    if (!user) {
      return { success: false, error: "User not found" };
    }

    // Verify current password
    const isValid = await verifyPassword(currentPassword, user.passwordHash);
    if (!isValid) {
      return { success: false, error: "Current password is incorrect" };
    }

    // Update password
    await updateUserPassword(user.id, newPassword);

    // Invalidate ALL sessions (including other devices), then
    // create a fresh session so the current user stays logged in
    await deleteAllUserSessions(user.id);
    await createSession(user.id);

    return { success: true, user: auth.user };
  } catch (error) {
    console.error("[Profile] Change password error:", error);
    return {
      success: false,
      error: "Failed to change password. Please try again.",
    };
  }
}

// ============================================================================
// API Key Actions
// ============================================================================

/**
 * Create a new API key for the current user.
 * Guests cannot create API keys.
 */
export async function createApiKeyAction(data: {
  name: string;
  permissions?: string[];
}): Promise<ApiKeyActionResult> {
  try {
    const auth = await getAuth();
    if (!auth) {
      return { success: false, error: "Not authenticated" };
    }

    // Guests cannot create API keys
    if (auth.user.role === "guest") {
      return {
        success: false,
        error:
          "Guests cannot create API keys. Please upgrade your account to access API features.",
      };
    }

    // Validate input
    const validated = createKeySchema.safeParse(data);
    if (!validated.success) {
      return {
        success: false,
        error: validated.error.issues[0]?.message || "Invalid input",
      };
    }

    const result = await createUserApiKey(
      auth.user.id,
      validated.data.name,
      validated.data.permissions,
    );

    return {
      success: true,
      key: result.key,
      plainTextKey: result.plainTextKey,
    };
  } catch (error) {
    console.error("[Profile] Create API key error:", error);
    return {
      success: false,
      error: "Failed to create API key. Please try again.",
    };
  }
}

/**
 * List all API keys for the current user (metadata only, no hashes).
 */
export async function listApiKeysAction(): Promise<ApiKeyListResult> {
  try {
    const auth = await getAuth();
    if (!auth) {
      return { success: false, error: "Not authenticated" };
    }

    const keys = await getUserApiKeys(auth.user.id);

    return { success: true, keys };
  } catch (error) {
    console.error("[Profile] List API keys error:", error);
    return {
      success: false,
      error: "Failed to load API keys. Please try again.",
    };
  }
}

/**
 * Delete an API key owned by the current user.
 * Ownership is verified in the data layer.
 */
export async function deleteApiKeyAction(
  keyId: number,
): Promise<ApiKeyActionResult> {
  try {
    const auth = await getAuth();
    if (!auth) {
      return { success: false, error: "Not authenticated" };
    }

    // Validate keyId
    if (!keyId || typeof keyId !== "number") {
      return { success: false, error: "Invalid key ID" };
    }

    // Delete key (ownership verified in data layer)
    const deleted = await deleteUserApiKey(keyId, auth.user.id);

    if (!deleted) {
      return {
        success: false,
        error: "Key not found or you do not have permission to delete it",
      };
    }

    return { success: true };
  } catch (error) {
    console.error("[Profile] Delete API key error:", error);
    return {
      success: false,
      error: "Failed to delete API key. Please try again.",
    };
  }
}

// ============================================================================
// API Key Update
// ============================================================================

/**
 * Update an existing API key's name and/or permissions.
 * Ownership is verified in the data layer.
 */
export async function updateApiKeyAction(
  keyId: number,
  data: { name?: string; permissions?: string[] },
): Promise<ApiKeyActionResult> {
  try {
    const auth = await getAuth();
    if (!auth) {
      return { success: false, error: "Not authenticated" };
    }

    // Validate keyId
    if (!keyId || typeof keyId !== "number") {
      return { success: false, error: "Invalid key ID" };
    }

    // Validate input
    const validated = updateKeySchema.safeParse(data);
    if (!validated.success) {
      return {
        success: false,
        error: validated.error.issues[0]?.message || "Invalid input",
      };
    }

    const updatedKey = await updateUserApiKey(
      keyId,
      auth.user.id,
      validated.data,
    );

    if (!updatedKey) {
      return {
        success: false,
        error: "Key not found or you do not have permission to edit it",
      };
    }

    return { success: true, key: updatedKey };
  } catch (error) {
    console.error("[Profile] Update API key error:", error);
    return {
      success: false,
      error: "Failed to update API key. Please try again.",
    };
  }
}
