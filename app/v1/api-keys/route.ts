import type { NextRequest } from "next/server";
import { count, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { apiKeys } from "@/db/schema";
import type { ApiKey } from "@/db/schema";
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

    // Generate new key outside transaction (crypto only)
    const newKey = generateApiKey();
    const newKeyHash = await hashApiKey(newKey);

    // Atomic transaction: COUNT → auth check → INSERT
    // Prevents bootstrap race condition (SEC-004) where two simultaneous
    // requests to an empty registry both see count === 0 and both create
    // keys without authentication.
    type TxResult =
      | { ok: true; record: ApiKey }
      | { ok: false; status: "unauthorized" | "forbidden" };

    const txResult = await db.transaction(async (tx): Promise<TxResult> => {
      const [{ total }] = await tx.select({ total: count() }).from(apiKeys);

      if (total > 0) {
        // Non-bootstrap: require admin auth inline (cannot use requireAuth
        // because it queries the DB outside this transaction context)
        if (!tokenHash) {
          return { ok: false, status: "unauthorized" };
        }

        const existing = await tx
          .select()
          .from(apiKeys)
          .where(eq(apiKeys.keyHash, tokenHash))
          .get();

        if (
          !existing ||
          (existing.expiresAt && existing.expiresAt < new Date())
        ) {
          return { ok: false, status: "unauthorized" };
        }

        const perms = existing.permissions ?? [];
        if (!perms.includes("admin")) {
          return { ok: false, status: "forbidden" };
        }
      }

      // Bootstrap (total === 0) or authenticated admin — create key
      const [record] = await tx
        .insert(apiKeys)
        .values({
          keyHash: newKeyHash,
          name: name.trim(),
          description: description ?? null,
          permissions: permissions ?? null,
          expiresAt: expiresAt ?? null,
        })
        .returning();

      return { ok: true, record: record! };
    });

    if (!txResult.ok) {
      return txResult.status === "forbidden"
        ? forbidden("Admin permission required to create API keys")
        : unauthorized("Invalid or expired API key");
    }

    return jsonResponse(
      {
        key: newKey, // Plaintext key — only returned on creation!
        id: txResult.record.id,
        name: txResult.record.name,
        description: txResult.record.description,
        permissions: txResult.record.permissions,
        created_at: txResult.record.createdAt.toISOString(),
        expires_at: txResult.record.expiresAt?.toISOString() ?? null,
      },
      201,
    );
  } catch (error) {
    console.error("Error creating API key:", error);
    return internalError();
  }
}
