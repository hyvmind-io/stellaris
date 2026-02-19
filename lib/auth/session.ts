import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { eq, and, gt } from "drizzle-orm";
import { getDb } from "@/db/client";
import { sessions, users } from "@/db/schema";
import type { User } from "@/db/schema";
import { SESSION_COOKIE_NAME, getSessionSecret } from "@/lib/auth/constants";

const SESSION_EXPIRY_DAYS = 30;

/**
 * Create a new session in the DB and set the JWT cookie.
 */
export async function createSession(userId: number): Promise<void> {
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(
    Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
  );

  const db = getDb();
  await db.insert(sessions).values({ id: sessionId, userId, expiresAt });

  const token = await new SignJWT({ sub: sessionId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_EXPIRY_DAYS}d`)
    .sign(getSessionSecret());

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/**
 * Verify a JWT token. Returns the sessionId or null.
 * Edge-layer check — no DB access.
 */
export async function verifySessionToken(
  token: string,
): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getSessionSecret());
    return (payload.sub as string) ?? null;
  } catch {
    return null;
  }
}

/**
 * Get the JWT from the session cookie.
 */
export async function getSessionToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
}

/**
 * Look up a session by ID, verifying it hasn't expired.
 * Returns the session record with joined user, or null.
 */
export async function getSessionWithUser(
  sessionId: string,
): Promise<{ session: typeof sessions.$inferSelect; user: User } | null> {
  const db = getDb();
  const result = await db
    .select()
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, new Date())))
    .get();

  if (!result) return null;
  return { session: result.sessions, user: result.users };
}

/**
 * Delete a specific session and clear the cookie.
 */
export async function deleteSession(sessionId: string): Promise<void> {
  const db = getDb();
  await db.delete(sessions).where(eq(sessions.id, sessionId));
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * Delete ALL sessions for a user (logout everywhere).
 */
export async function deleteAllUserSessions(userId: number): Promise<void> {
  const db = getDb();
  await db.delete(sessions).where(eq(sessions.userId, userId));
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * Delete all DB sessions for a user WITHOUT clearing the current cookie.
 * Use for admin operations on other users (e.g., role change, user deletion).
 */
export async function deleteAllUserSessionsFromDb(
  userId: number,
): Promise<void> {
  const db = getDb();
  await db.delete(sessions).where(eq(sessions.userId, userId));
}
