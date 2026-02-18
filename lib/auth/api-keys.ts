import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { apiKeys } from "@/db/schema";
import type { ApiKey } from "@/db/schema";

// ============================================================================
// Hashing (Web Crypto API — compatible with Cloudflare Workers)
// ============================================================================

/**
 * Hash an API key using SHA-256 via the Web Crypto API.
 * Returns a lowercase hex-encoded string.
 */
export async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ============================================================================
// Key Generation
// ============================================================================

/**
 * Generate a random API key in format: `stlr_` + 40 random hex characters.
 * Uses Web Crypto `crypto.getRandomValues` (available in Workers runtime).
 */
export function generateApiKey(): string {
  const bytes = new Uint8Array(20); // 20 bytes = 40 hex chars
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `stlr_${hex}`;
}

// ============================================================================
// Timing-Safe Comparison Helpers (private)
// ============================================================================

/**
 * Constant-time comparison of two byte arrays using XOR accumulator.
 * Always iterates the full length to prevent timing side-channels.
 */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

/**
 * Convert a hex-encoded string to a Uint8Array.
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate an API key by hashing it and looking it up in the database.
 * Checks expiration and updates `lastUsedAt` on success.
 *
 * Uses a timing-safe comparison as defense-in-depth — even though the DB
 * lookup uses the hash for filtering, we re-verify with constant-time
 * XOR to guard against any DB-level comparison leaks.
 *
 * @returns The ApiKey record if valid, or null if invalid/expired.
 */
export async function validateApiKey(key: string): Promise<ApiKey | null> {
  // Compute hash as both Uint8Array (for timing-safe compare) and hex (for DB lookup)
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const computedBytes = new Uint8Array(hashBuffer);
  const hashHex = Array.from(computedBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const db = getDb();

  const record = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, hashHex))
    .get();

  if (!record) return null;

  // Defense-in-depth: timing-safe comparison of computed hash vs stored hash
  const storedBytes = hexToBytes(record.keyHash);
  if (!timingSafeEqual(computedBytes, storedBytes)) {
    return null;
  }

  // Check expiration
  if (record.expiresAt && record.expiresAt < new Date()) {
    return null;
  }

  // Update lastUsedAt (best-effort, don't fail the request)
  try {
    await db
      .update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, record.id));
  } catch {
    // Non-critical — don't block authentication on analytics update
  }

  return record;
}

// ============================================================================
// Key Creation
// ============================================================================

/**
 * Create a new API key, hash it, and store the record in the database.
 *
 * @returns The plaintext key (only returned once!) and the database record.
 */
export async function createApiKey(params: {
  name: string;
  description?: string;
  permissions?: string[];
  expiresAt?: Date;
}): Promise<{ key: string; record: ApiKey }> {
  const key = generateApiKey();
  const hash = await hashApiKey(key);
  const db = getDb();

  const [record] = await db
    .insert(apiKeys)
    .values({
      keyHash: hash,
      name: params.name,
      description: params.description ?? null,
      permissions: params.permissions ?? null,
      expiresAt: params.expiresAt ?? null,
    })
    .returning();

  return { key, record };
}
