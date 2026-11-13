import type { NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { apiKeys } from "@/db/schema";
import { generateApiKey, hashApiKey } from "@/lib/auth/api-keys";
import { requireAuth } from "@/lib/auth/middleware";
import { badRequest, internalError, validationError } from "@/lib/api/errors";
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
 * Create a new API key. Requires an `admin` key; seed the first admin with
 * `pnpm db:seed-admin` or `pnpm db:create-key`. Rate limit at the edge
 * (see docs/RATE_LIMITING.md).
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, "admin");
    if (auth instanceof Response) return auth;

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
    const newKey = generateApiKey();

    const record = await getDb()
      .insert(apiKeys)
      .values({
        keyHash: await hashApiKey(newKey),
        name: name.trim(),
        description: description ?? null,
        permissions: permissions ?? null,
        createdAt: new Date(),
        expiresAt: expires_at ? new Date(expires_at) : null,
      })
      .returning()
      .get();

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
