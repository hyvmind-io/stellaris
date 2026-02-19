import "server-only";
import { redirect } from "next/navigation";
import type { AuthUser } from "@/types/auth";
import {
  getSessionToken,
  verifySessionToken,
  getSessionWithUser,
} from "./session";

export interface AuthResult {
  user: AuthUser;
  sessionId: string;
}

/**
 * Read the session cookie, verify the JWT, and look up the session + user in D1.
 * Returns { user, sessionId } or null if unauthenticated.
 *
 * The returned user object never contains passwordHash — it is stripped
 * before returning to prevent accidental leakage.
 *
 * Use in Server Components and Server Actions.
 */
export async function getAuth(): Promise<AuthResult | null> {
  try {
    const token = await getSessionToken();
    if (!token) return null;

    const sessionId = await verifySessionToken(token);
    if (!sessionId) return null;

    const result = await getSessionWithUser(sessionId);
    if (!result) return null;

    // Strip passwordHash before returning
    const { passwordHash: _, ...safeUser } = result.user;
    return { user: safeUser, sessionId };
  } catch (error) {
    console.error("getAuth() failed:", error);
    return null;
  }
}

/**
 * Like getAuth() but redirects to /login if not authenticated.
 * Use in Server Components that require authentication.
 */
export async function requireUser(): Promise<AuthResult> {
  const auth = await getAuth();
  if (!auth) {
    redirect("/login");
  }
  return auth;
}

/**
 * Like requireUser() but also enforces admin role.
 * Redirects to /unauthorized if authenticated but not admin.
 * Redirects to /login if not authenticated.
 */
export async function requireAdmin(): Promise<AuthResult> {
  const auth = await getAuth();
  if (!auth) {
    redirect("/login");
  }
  if (auth.user.role !== "admin") {
    redirect("/unauthorized");
  }
  return auth;
}
