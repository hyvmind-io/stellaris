import type { NextRequest } from "next/server";
import { count, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { apiKeys } from "@/db/schema";
import { generateApiKey, hashApiKey } from "@/lib/auth/api-keys";
import { requireAuth } from "@/lib/auth/middleware";
import {
  badRequest,
  forbidden,
  internalError,
  unauthorized,
  validationError,
} from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { createApiKeyBody } from "@/lib/validation/registry";

/**
 * GET /v1/api-keys
 *
 * List all API keys (metadata only — NEVER returns hashes or plaintext keys).
 * Requires authentication.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, "admin");
    if (auth instanceof Response) return auth;

    const db = getDb();
    const keys = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        description: apiKeys.description,
        permissions: apiKeys.permissions,
        createdAt: apiKeys.createdAt,
        lastUsedAt: apiKeys.lastUsedAt,
        expiresAt: apiKeys.expiresAt,
      })
      .from(apiKeys);

    return jsonResponse({
      keys: keys.map((k) => ({
        id: k.id,
        name: k.name,
        description: k.description,
        permissions: k.permissions,
        created_at: k.createdAt.toISOString(),
        last_used_at: k.lastUsedAt?.toISOString() ?? null,
        expires_at: k.expiresAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    console.error("Error listing API keys:", error);
    return internalError();
  }
}

/**
 * POST /v1/api-keys
 *
 * Create a new API key.
 *
 * ⚠️ RATE LIMITING NOTE:
 * This endpoint is NOT rate-limited at the application level.
 * Rate limiting MUST be configured at the Cloudflare edge layer using one of:
 *
 *   1. Cloudflare Rate Limiting rules (recommended):
 *      - Dashboard → Security → WAF → Rate Limiting Rules
 *      - Rule: POST /v1/api-keys → max 10 req/min per IP
 *      - Docs: https://developers.cloudflare.com/waf/rate-limiting-rules/
 *
 *   2. Cloudflare Workers Rate Limiting API (in-Worker):
 *      - Uses `RateLimit` binding in wrangler.jsonc
 *      - Docs: https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
 *
 * Application-level rate limiting (in-memory counters) is ineffective for
 * Cloudflare Workers because each request may be handled by a different
 * Worker instance with no shared state.
 *
 * The bootstrap mechanism (unauthenticated first-key creation) is an additional
 * attack surface — restrict to trusted IPs via Cloudflare Access if possible.
 *
 * Bootstrap mechanism: If the apiKeys table is empty (no keys exist),
 * creation is allowed without authentication. Once at least one key
 * exists, all subsequent creations require a valid API key.
 *
 * Body JSON:
 *   - name: string (required, 1-255 chars)
 *   - description: string (optional, max 1000 chars)
 *   - permissions: string[] (optional)
 *   - expires_at: ISO 8601 string (optional)
 */
export async function POST(request: NextRequest) {
  try {
    const db = getDb();

    // Pre-read auth header (pure parsing, no I/O)
    const authHeader = request.headers.get("Authorization");
    const rawToken = authHeader
      ? authHeader.startsWith("Bearer ")
        ? authHeader.slice(7).trim()
        : authHeader.trim()
      : null;

    // Pre-compute token hash (crypto I/O only, not DB)
    const tokenHash = rawToken ? await hashApiKey(rawToken) : null;

    // Parse and validate body before entering the transaction
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return badRequest("Invalid JSON body");
    }

    const parsed = createApiKeyBody.safeParse(body);
    if (!parsed.success) {
      return validationError(parsed.error.issues);
    }

    const { name, description, permissions, expires_at } = parsed.data;
    const expiresAt = expires_at ? new Date(expires_at) : undefined;

    // Generate new key (crypto only)
    const newKey = generateApiKey();
    const newKeyHash = await hashApiKey(newKey);

    // Cloudflare D1 forbids interactive SQL transactions, so the original
    // COUNT → auth → INSERT transaction is reimplemented with D1-native atomic
    // primitives while PRESERVING the SEC-004 bootstrap-race guarantee.
    //
    // Authorization branching (unauthorized vs forbidden vs allowed) is decided
    // from non-atomic reads — these only choose which error to return and never
    // grant access on their own. The actual write is a SINGLE atomic conditional
    // INSERT (`INSERT ... SELECT ... WHERE <guard>`). The guard re-evaluates the
    // authority condition at write time inside one statement:
    //
    //   - Bootstrap path: WHERE (SELECT COUNT(*) FROM api_keys) = 0
    //   - Admin path:     WHERE EXISTS (valid, non-expired admin key = tokenHash)
    //
    // Because the bootstrap guard is part of the same atomic INSERT, two
    // concurrent empty-registry requests cannot both insert: only the first sees
    // COUNT(*) = 0; the second's guard fails and inserts 0 rows (SEC-004 holds).
    const now = new Date();

    // Read current authorization state — used ONLY to select the right rejection
    // status, not to authorize the write (the SQL guard below authorizes it).
    const countResult = await db.select({ total: count() }).from(apiKeys);
    const total = countResult[0]?.total ?? 0;

    if (total > 0) {
      // Non-bootstrap: a valid admin key is required.
      if (!tokenHash) {
        return unauthorized("Invalid or expired API key");
      }
      const existing = await db
        .select()
        .from(apiKeys)
        .where(eq(apiKeys.keyHash, tokenHash))
        .get();

      if (!existing || (existing.expiresAt && existing.expiresAt < now)) {
        return unauthorized("Invalid or expired API key");
      }
      const perms = existing.permissions ?? [];
      if (!perms.includes("admin")) {
        return forbidden("Admin permission required to create API keys");
      }
    }

    // Atomic guarded INSERT — a single FROM-less `INSERT INTO api_keys SELECT
    // <constants> WHERE <guard>`. A FROM-less SELECT yields exactly one candidate
    // row, gated by the WHERE: it inserts that row only when the write-time
    // authority guard holds, otherwise it inserts 0 rows. The whole statement is
    // atomic, so it both authorizes and writes in one step:
    //   - bootstrap: NOT EXISTS (any api_keys row)  ← closes the SEC-004 race
    //   - admin:     EXISTS (valid, non-expired admin key matching tokenHash)
    // SQLite has no boolean type; permissions is a JSON-encoded string array, so
    // `permissions LIKE '%"admin"%'` matches an array that contains "admin".
    const nowEpoch = Math.floor(now.getTime() / 1000);
    const expiresEpoch = expiresAt ? Math.floor(expiresAt.getTime() / 1000) : null;
    const permsJson = permissions ? JSON.stringify(permissions) : null;

    const adminClause = tokenHash
      ? sql` OR EXISTS (
          SELECT 1 FROM ${apiKeys}
          WHERE ${apiKeys.keyHash} = ${tokenHash}
            AND (${apiKeys.expiresAt} IS NULL OR ${apiKeys.expiresAt} > ${nowEpoch})
            AND ${apiKeys.permissions} LIKE '%"admin"%'
        )`
      : sql``;

    // The SELECT columns must match the api_keys column order exactly (drizzle's
    // insert-select contract). Columns: id, key_hash, name, description,
    // permissions, created_at, last_used_at, expires_at, user_id. `id` is left
    // NULL so SQLite assigns the autoincrement value.
    const insertSelect = sql`
      SELECT
        NULL AS id,
        ${newKeyHash} AS key_hash,
        ${name.trim()} AS name,
        ${description ?? null} AS description,
        ${permsJson} AS permissions,
        ${nowEpoch} AS created_at,
        NULL AS last_used_at,
        ${expiresEpoch} AS expires_at,
        NULL AS user_id
      WHERE (NOT EXISTS (SELECT 1 FROM ${apiKeys}))${adminClause}
    `;

    const inserted = await db.insert(apiKeys).select(insertSelect).returning();

    const record = inserted[0];

    if (!record) {
      // Guard failed at write time despite the pre-read authority check: another
      // concurrent request won the bootstrap race, or auth was insufficient.
      return total > 0
        ? unauthorized("Invalid or expired API key")
        : unauthorized("Bootstrap unavailable — registry already initialized");
    }

    return jsonResponse(
      {
        key: newKey, // Plaintext key — only returned on creation!
        id: record.id,
        name: record.name,
        description: record.description,
        permissions: record.permissions,
        created_at: record.createdAt.toISOString(),
        expires_at: record.expiresAt?.toISOString() ?? null,
      },
      201,
    );
  } catch (error) {
    console.error("Error creating API key:", error);
    return internalError();
  }
}
