import type { User } from "@/db/schema";

/**
 * User roles — lowercase strings matching DB enum.
 */
export type UserRole = "admin" | "user" | "guest";

/**
 * Safe user representation — no passwordHash.
 * Use this in all server actions and client components.
 */
export type AuthUser = Omit<User, "passwordHash">;

/**
 * AuthUser extended with computed counts (for admin user details dialog).
 */
export interface AuthUserWithCounts extends AuthUser {
  apiKeyCount: number;
  sessionCount: number;
}

/**
 * API key data safe for client display — no key hash.
 */
export interface ApiKeyData {
  id: number;
  name: string;
  description: string | null;
  permissions: string[];
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
}

/**
 * Result of creating a new API key (plaintext only returned once).
 */
export interface CreateApiKeyResult {
  key: ApiKeyData;
  plainTextKey: string;
}
