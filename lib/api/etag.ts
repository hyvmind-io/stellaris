import type { NextRequest } from "next/server";

export type IfMatchErrorReason = "missing" | "invalid";

export type IfMatchResult =
  | { ok: true; revision: number }
  | { ok: false; reason: IfMatchErrorReason };

// ============================================================================
// ETag Generation
// ============================================================================

/**
 * Build a weak ETag string from a revision number.
 *
 * Format: `W/"<revision>"` — weak ETags are appropriate because the JSON
 * representation may vary (field order, whitespace) even for the same revision.
 *
 * @example makeEtag(3) → 'W/"3"'
 */
export function makeEtag(revision: number): string {
  return `W/"${revision}"`;
}

function parseRevisionHeaderValue(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "*") {
    return null;
  }

  if (trimmed.includes(",")) {
    return null;
  }

  const cleaned = trimmed.replace(/^W\//, "").replace(/^"|"$/g, "").trim();
  const parsed = Number(cleaned);

  if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
    return null;
  }

  return parsed;
}

// ============================================================================
// If-Match Parsing
// ============================================================================

/**
 * Extract the expected revision from an `If-Match` request header.
 *
 * Accepts:
 *   - `W/"3"` → 3
 *   - `"3"`   → 3
 *   - `3`     → 3 (lenient, for curl convenience)
 *
 * Returns `null` if the header is missing or unparseable, letting callers
 * decide whether to reject (412) or proceed without concurrency checks.
 */
export function parseIfMatch(request: NextRequest): number | null {
  const header = request.headers.get("If-Match");
  if (!header) return null;

  return parseRevisionHeaderValue(header);
}

/**
 * Parse a required `If-Match` header for mutable admin writes.
 *
 * Returns a discriminated result so route handlers can standardize behavior:
 * - missing header -> `428 Precondition Required`
 * - invalid header -> `400 Bad Request`
 */
export function parseRequiredIfMatch(request: NextRequest): IfMatchResult {
  const header = request.headers.get("If-Match");
  if (!header) {
    return { ok: false, reason: "missing" };
  }

  const revision = parseRevisionHeaderValue(header);
  if (revision === null) {
    return { ok: false, reason: "invalid" };
  }

  return { ok: true, revision };
}

// ============================================================================
// If-None-Match Parsing (for conditional GETs — future use)
// ============================================================================

/**
 * Extract the revision from an `If-None-Match` request header.
 * Used for conditional GETs: if the client's cached revision matches,
 * the server can return 304 Not Modified.
 *
 * Same parsing rules as `parseIfMatch`.
 */
export function parseIfNoneMatch(request: NextRequest): number | null {
  const header = request.headers.get("If-None-Match");
  if (!header) return null;

  return parseRevisionHeaderValue(header);
}
