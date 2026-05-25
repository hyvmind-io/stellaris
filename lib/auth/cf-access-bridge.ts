import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import type { User } from "@/db/schema";
import { updateLastLogin } from "@/lib/data/users";
import { createSession } from "@/lib/auth/session";
import type { CfAccessVerifyResult } from "@/lib/auth/cf-access";

/**
 * Empty-string sentinel for accounts that cannot log in with a password.
 * `passwordHash` is `notNull()` in the schema; we keep it as `""` so the
 * password verifier rejects any attempt to login locally for CF Access users.
 *
 * NOTE: lib/auth/password.ts's verifyPassword treats empty/invalid hashes as
 * failed verification, so this is safe.
 */
const CF_ACCESS_PASSWORD_SENTINEL = "";

function localPartFromEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return email;
  return email.slice(0, at);
}

/**
 * Normalize an email local-part into a candidate username:
 * lowercase, replace disallowed chars with "-", strip leading/trailing "-".
 */
function deriveBaseUsername(email: string): string {
  const local = localPartFromEmail(email).toLowerCase();
  const cleaned = local.replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned.length > 0 ? cleaned : "user";
}

/**
 * Find an unused username given a base, by appending numeric suffixes on
 * collision. Caps suffix attempts at 50 before falling back to a random suffix.
 */
async function findAvailableUsername(base: string): Promise<string> {
  const db = getDb();

  const exists = async (candidate: string): Promise<boolean> => {
    const row = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, candidate))
      .get();
    return row !== undefined;
  };

  if (!(await exists(base))) return base;
  for (let suffix = 2; suffix <= 50; suffix++) {
    const candidate = `${base}-${suffix}`;
    if (!(await exists(candidate))) return candidate;
  }
  // Highly unlikely fallback — append a short random suffix.
  const rand = Math.random().toString(36).slice(2, 8);
  return `${base}-${rand}`;
}

/**
 * Find or provision a user for a verified CF Access identity.
 *
 * - Existing user (by email): touch lastLoginAt, return.
 * - Missing user: insert with role="user" (standard authenticated role) and an
 *   empty password hash sentinel so local login can never succeed for this
 *   account. CF Access already gates network access, so provisioned identities
 *   are trusted as standard users rather than guests.
 */
export async function findOrProvisionCfAccessUser(
  claims: CfAccessVerifyResult,
): Promise<User> {
  const db = getDb();
  const email = claims.email.toLowerCase().trim();

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .get();

  if (existing) {
    try {
      await updateLastLogin(existing.id);
    } catch (error) {
      // Non-critical: lastLoginAt is best-effort.
      console.warn("[cf-access] failed to update lastLoginAt", error);
    }
    return existing;
  }

  const baseUsername = deriveBaseUsername(email);
  const username = await findAvailableUsername(baseUsername);
  const displayName = claims.name?.trim() || localPartFromEmail(email);

  const now = new Date();
  const [created] = await db
    .insert(users)
    .values({
      email,
      username,
      displayName,
      passwordHash: CF_ACCESS_PASSWORD_SENTINEL,
      role: "user", // CF Access-provisioned users start as standard authenticated users
      lastLoginAt: now,
    })
    .returning();

  return created!;
}

/**
 * Mint the app's session cookie for a CF Access-provisioned user.
 * Reuses the existing JWT cookie session — no changes to downstream auth.
 *
 * NOTE: Calling this only fully logs the user out of the app (cookie path).
 * CF Access itself maintains a separate session at the edge; to fully sign
 * out the user must hit `/cdn-cgi/access/logout` on the host. We do NOT
 * chain that automatically to avoid surprising users with a global signout.
 */
export async function bridgeCfAccessSession(
  claims: CfAccessVerifyResult,
): Promise<User> {
  const user = await findOrProvisionCfAccessUser(claims);
  await createSession(user.id);
  return user;
}
