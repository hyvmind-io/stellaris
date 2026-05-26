import "server-only";

/**
 * User Data Access Layer
 *
 * CRUD operations for user management using Drizzle ORM.
 * All password handling uses the password utilities from auth module.
 */

import { eq, and, or, like, desc, count, not } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import type { User } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import type { AuthUser, UserRole } from "@/types/auth";

// ============================================================================
// Helper: Transform DB User to AuthUser
// ============================================================================

/**
 * Strip `passwordHash` from a full User record, returning a safe AuthUser.
 */
function toAuthUser(user: User): AuthUser {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash, ...authUser } = user;
  return authUser;
}

// ============================================================================
// User Query Operations
// ============================================================================

/**
 * Get a user by their ID.
 *
 * @param id - User ID (integer)
 * @returns User data without password hash, or null if not found
 */
export async function getUserById(id: number): Promise<AuthUser | null> {
  const db = getDb();
  const user = await db.select().from(users).where(eq(users.id, id)).get();

  return user ? toAuthUser(user) : null;
}

/**
 * Get a user by their email address.
 *
 * @param email - User email (case-insensitive lookup)
 * @returns User data without password hash, or null if not found
 */
export async function getUserByEmail(email: string): Promise<AuthUser | null> {
  const db = getDb();
  const user = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .get();

  return user ? toAuthUser(user) : null;
}

/**
 * Get a user by their email with password hash (for authentication).
 *
 * @param email - User email
 * @returns Full user data including password hash, or null if not found
 * @internal Should only be used by the auth module
 */
export async function getUserByEmailWithPassword(
  email: string,
): Promise<User | null> {
  const db = getDb();
  const user = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .get();

  return user ?? null;
}

/**
 * Get a user by their username.
 *
 * @param username - Username (case-sensitive)
 * @returns User data without password hash, or null if not found
 */
export async function getUserByUsername(
  username: string,
): Promise<AuthUser | null> {
  const db = getDb();
  const user = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .get();

  return user ? toAuthUser(user) : null;
}

// ============================================================================
// User List Operations
// ============================================================================

/**
 * Filter options for user queries.
 */
export interface UserFilters {
  role?: UserRole;
  search?: string;
}

/**
 * Pagination options.
 */
export interface PaginationOptions {
  page?: number;
  limit?: number;
}

/**
 * Get all users with optional filtering and pagination.
 *
 * Runs data + count queries in parallel via `Promise.all`.
 * Search matches against both email and username (OR).
 *
 * @param filters - Optional filters for role and text search
 * @param pagination - Optional pagination (default: page 1, limit 20)
 * @returns Array of users (without password hash) and total count
 */
export async function getAllUsers(
  filters?: UserFilters,
  pagination?: PaginationOptions,
): Promise<{ users: AuthUser[]; total: number }> {
  const page = pagination?.page || 1;
  const limit = pagination?.limit || 20;
  const offset = (page - 1) * limit;

  const db = getDb();

  // Build WHERE conditions
  const conditions: SQL[] = [];

  if (filters?.role) {
    conditions.push(eq(users.role, filters.role));
  }

  if (filters?.search) {
    const pattern = `%${filters.search}%`;
    const searchCondition = or(
      like(users.email, pattern),
      like(users.username, pattern),
    );
    if (searchCondition) {
      conditions.push(searchCondition);
    }
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Execute data + count queries in parallel
  const [userList, countResult] = await Promise.all([
    db
      .select()
      .from(users)
      .where(whereClause)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset)
      .all(),
    db.select({ count: count() }).from(users).where(whereClause).get(),
  ]);

  return {
    users: userList.map(toAuthUser),
    total: countResult?.count ?? 0,
  };
}

// ============================================================================
// User Mutation Operations
// ============================================================================

/**
 * Create a new user.
 *
 * @param params - User creation input
 * @returns Created user data (without password hash)
 * @throws Error if email or username already exists (unique constraint)
 */
export async function createUser(params: {
  email: string;
  username: string;
  password: string;
  displayName?: string;
  role?: UserRole;
}): Promise<AuthUser> {
  const passwordHash = await hashPassword(params.password);

  const db = getDb();
  const [user] = await db
    .insert(users)
    .values({
      email: params.email.toLowerCase(),
      username: params.username.trim(),
      displayName: params.displayName || null,
      passwordHash,
      role: params.role || "guest",
    })
    .returning();

  // Insert always returns exactly one row on success; failure throws
  return toAuthUser(user!);
}

/**
 * Update a user's profile information.
 *
 * @param id - User ID to update
 * @param data - Fields to update
 * @returns Updated user data
 * @throws Error if user not found or email/username conflict
 */
export async function updateUser(
  id: number,
  data: {
    displayName?: string | null;
    username?: string;
    email?: string;
  },
): Promise<AuthUser> {
  const db = getDb();
  const updateData: Partial<{
    displayName: string | null;
    username: string;
    email: string;
    updatedAt: Date;
  }> = { updatedAt: new Date() };

  if (data.displayName !== undefined) {
    updateData.displayName = data.displayName;
  }

  if (data.username !== undefined) {
    updateData.username = data.username;
  }

  if (data.email !== undefined) {
    updateData.email = data.email.toLowerCase();
  }

  const [user] = await db
    .update(users)
    .set(updateData)
    .where(eq(users.id, id))
    .returning();

  // Update always returns exactly one row if the user exists; caller should check first
  return toAuthUser(user!);
}

/**
 * Update a user's role.
 *
 * @param id - User ID to update
 * @param role - New role to assign
 * @returns Updated user data
 * @throws Error if user not found
 */
export async function updateUserRole(
  id: number,
  role: UserRole,
): Promise<AuthUser> {
  const db = getDb();
  const [user] = await db
    .update(users)
    .set({ role, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning();

  return toAuthUser(user!);
}

/**
 * Update a user's theme preference (PRD-02).
 *
 * @param id - User ID
 * @param theme - A manifest theme name, or null to follow the system default.
 * @returns Updated user data without password hash.
 */
export async function setUserTheme(
  id: number,
  theme: string | null,
): Promise<AuthUser> {
  const db = getDb();
  const [user] = await db
    .update(users)
    .set({ theme, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning();

  return toAuthUser(user!);
}

/**
 * Update a user's password.
 *
 * @param id - User ID
 * @param newPassword - New password (will be hashed)
 */
export async function updateUserPassword(
  id: number,
  newPassword: string,
): Promise<void> {
  const passwordHash = await hashPassword(newPassword);

  const db = getDb();
  await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, id));
}

/**
 * Update user's last login timestamp.
 *
 * @param id - User ID
 */
export async function updateLastLogin(id: number): Promise<void> {
  const db = getDb();
  await db
    .update(users)
    .set({ lastLoginAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, id));
}

/**
 * Delete a user and all their associated data (cascades via FK).
 *
 * @param id - User ID to delete
 * @returns true if deleted, false if not found
 */
export async function deleteUser(id: number): Promise<boolean> {
  const db = getDb();
  const result = await db
    .delete(users)
    .where(eq(users.id, id))
    .returning({ id: users.id });

  return result.length > 0;
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Check if an email is already in use.
 *
 * @param email - Email to check (case-insensitive)
 * @param excludeUserId - Optional user ID to exclude (for update operations)
 * @returns true if email is taken
 */
export async function isEmailTaken(
  email: string,
  excludeUserId?: number,
): Promise<boolean> {
  const db = getDb();

  const conditions: SQL[] = [eq(users.email, email.toLowerCase())];
  if (excludeUserId !== undefined) {
    conditions.push(not(eq(users.id, excludeUserId)));
  }

  const user = await db
    .select({ id: users.id })
    .from(users)
    .where(and(...conditions))
    .get();

  return !!user;
}

/**
 * Check if a username is already in use.
 *
 * @param username - Username to check (case-sensitive)
 * @param excludeUserId - Optional user ID to exclude (for update operations)
 * @returns true if username is taken
 */
export async function isUsernameTaken(
  username: string,
  excludeUserId?: number,
): Promise<boolean> {
  const db = getDb();

  const conditions: SQL[] = [eq(users.username, username)];
  if (excludeUserId !== undefined) {
    conditions.push(not(eq(users.id, excludeUserId)));
  }

  const user = await db
    .select({ id: users.id })
    .from(users)
    .where(and(...conditions))
    .get();

  return !!user;
}

/**
 * Get count of admin users.
 *
 * @returns Number of users with "admin" role
 */
export async function getAdminCount(): Promise<number> {
  const db = getDb();
  const result = await db
    .select({ count: count() })
    .from(users)
    .where(eq(users.role, "admin"))
    .get();

  return result?.count ?? 0;
}
