/**
 * Detect if a thrown error is a SQLite/D1 unique constraint violation.
 * D1 surfaces SQLite errors with messages like:
 *   "D1_ERROR: UNIQUE constraint failed: modules.namespace, ..."
 *   "UNIQUE constraint failed: ..."
 *
 * Used to convert DB-level constraint violations into 409 Conflict responses
 * without leaking internal error details.
 */
export function isUniqueConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("UNIQUE constraint failed");
}
