/**
 * Shared auth constants used by both middleware (Edge) and server-side code.
 *
 * IMPORTANT: This file must NOT import "server-only" because middleware
 * runs in the Edge Runtime and cannot use server-only modules.
 */

export const SESSION_COOKIE_NAME = "stlr_session";

/**
 * Fallback secret for local development ONLY.
 * In production, AUTH_SESSION_SECRET must be set as an environment variable.
 */
export const DEV_SESSION_SECRET =
  "dev-secret-change-in-production-minimum-32-chars!!";

/**
 * Get the JWT signing/verification secret.
 * Uses AUTH_SESSION_SECRET env var, falling back to DEV_SESSION_SECRET for local dev.
 */
export function getSessionSecret(): Uint8Array {
  const secret = process.env.AUTH_SESSION_SECRET ?? DEV_SESSION_SECRET;
  return new TextEncoder().encode(secret);
}
