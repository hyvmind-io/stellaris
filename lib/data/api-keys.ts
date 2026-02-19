import "server-only";

/**
 * User-scoped API Key Data Access Layer
 *
 * Manages API keys associated with a specific user (Profile page).
 * Separate from `lib/auth/api-keys.ts` which handles system-level validation.
 */

import { eq, and, desc, count } from "drizzle-orm";
import { getDb } from "@/db/client";
import { apiKeys } from "@/db/schema";
import { generateApiKey, hashApiKey } from "@/lib/auth/api-keys";
import type { ApiKeyData, CreateApiKeyResult } from "@/types/auth";

// ============================================================================
// Helper: Strip sensitive fields
// ============================================================================

/**
 * Transform a raw API key record into safe client-facing data.
 * Never exposes the key hash.
 */
function toApiKeyData(record: typeof apiKeys.$inferSelect): ApiKeyData {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    createdAt: record.createdAt,
    lastUsedAt: record.lastUsedAt,
    expiresAt: record.expiresAt,
  };
}

// ============================================================================
// Query Operations
// ============================================================================

/**
 * List all API keys owned by a user.
 * Returns metadata only — never returns the key hash.
 *
 * @param userId - Owner user ID
 * @returns Array of API key metadata, newest first
 */
export async function getUserApiKeys(userId: number): Promise<ApiKeyData[]> {
  const db = getDb();
  const records = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.userId, userId))
    .orderBy(desc(apiKeys.createdAt))
    .all();

  return records.map(toApiKeyData);
}

/**
 * Count API keys owned by a user.
 *
 * @param userId - Owner user ID
 * @returns Number of API keys
 */
export async function countUserApiKeys(userId: number): Promise<number> {
  const db = getDb();
  const result = await db
    .select({ count: count() })
    .from(apiKeys)
    .where(eq(apiKeys.userId, userId))
    .get();

  return result?.count ?? 0;
}

// ============================================================================
// Mutation Operations
// ============================================================================

/**
 * Create a new API key for a user.
 * Returns the plaintext key (only available at creation time) and metadata.
 *
 * The key is stored as a SHA-256 hash — the plaintext is never persisted.
 * Permissions default to `["admin"]` so user-created keys work with the
 * existing API auth system.
 *
 * @param userId - Owner user ID
 * @param name - Human-readable key name
 * @returns The API key metadata and the one-time plaintext key
 */
export async function createUserApiKey(
  userId: number,
  name: string,
): Promise<CreateApiKeyResult> {
  const plainKey = generateApiKey();
  const keyHash = await hashApiKey(plainKey);

  const db = getDb();
  const [record] = await db
    .insert(apiKeys)
    .values({
      keyHash,
      name,
      userId,
      permissions: ["admin"],
    })
    .returning();

  // Insert always returns exactly one row on success; failure throws
  return {
    key: toApiKeyData(record!),
    plainTextKey: plainKey,
  };
}

/**
 * Delete an API key, verifying userId ownership.
 * Returns true if deleted, false if not found or not owned by user.
 *
 * @param keyId - API key ID to delete
 * @param userId - Owner user ID (ownership check)
 * @returns true if the key was deleted
 */
export async function deleteUserApiKey(
  keyId: number,
  userId: number,
): Promise<boolean> {
  const db = getDb();
  const result = await db
    .delete(apiKeys)
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId)))
    .returning({ id: apiKeys.id });

  return result.length > 0;
}
