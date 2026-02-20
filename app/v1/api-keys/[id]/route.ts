import type { NextRequest } from "next/server";
import { count, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { apiKeys } from "@/db/schema";
import { requireAuth } from "@/lib/auth/middleware";
import {
  badRequest,
  notFound,
  validationError,
  internalError,
} from "@/lib/api/errors";
import { jsonResponse, noContentResponse } from "@/lib/api/response";
import { updateApiKeyBody } from "@/lib/validation/registry";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * DELETE /v1/api-keys/:id
 *
 * Revoke (permanently delete) an API key by its numeric ID.
 * Requires admin permission.
 *
 * Returns 204 on success, 404 if the key doesn't exist.
 *
 * Self-revocation is allowed unless this is the last admin key — deleting the
 * last admin key is blocked to prevent accidental lockout into bootstrap mode.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireAuth(request, "admin");
    if (auth instanceof Response) return auth;

    const { id: rawId } = await params;
    const parsed = z.coerce.number().int().positive().safeParse(rawId);
    if (!parsed.success) {
      return validationError(parsed.error.issues);
    }

    const db = getDb();

    // Check the key exists before attempting deletion
    const keyToDelete = await db
      .select({ id: apiKeys.id, permissions: apiKeys.permissions })
      .from(apiKeys)
      .where(eq(apiKeys.id, parsed.data))
      .get();

    if (!keyToDelete) {
      return notFound(`API key ${parsed.data} not found`);
    }

    // Prevent deletion of the last admin key to avoid accidental lockout.
    // If the only remaining admin key is deleted, the registry enters bootstrap
    // mode where anyone can create keys without authentication.
    const keyPerms = keyToDelete.permissions ?? [];
    if (keyPerms.includes("admin")) {
      // Count all admin keys (keys where permissions JSON array contains "admin").
      // SQLite json_each() extracts elements from JSON arrays for filtering.
      const adminKeyCount = await db
        .select({ total: count() })
        .from(apiKeys)
        .where(
          sql`EXISTS (
            SELECT 1 FROM json_each(${apiKeys.permissions})
            WHERE json_each.value = 'admin'
          )`,
        );

      const totalAdminKeys = adminKeyCount[0]?.total ?? 0;
      if (totalAdminKeys <= 1) {
        return badRequest(
          "Cannot delete the last admin API key. At least one admin key must exist to prevent lockout.",
        );
      }
    }

    // Perform the actual delete
    await db.delete(apiKeys).where(eq(apiKeys.id, parsed.data));

    return noContentResponse({});
  } catch (error) {
    console.error("Error revoking API key:", error);
    return internalError();
  }
}

/**
 * PATCH /v1/api-keys/:id
 *
 * Update an API key's name and/or permissions.
 * Requires admin permission.
 *
 * Body JSON (at least one field required):
 *   - name: string (optional, 1-255 chars)
 *   - permissions: string[] (optional, min 1 element)
 *
 * Returns the updated key metadata on success, 404 if not found.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireAuth(request, "admin");
    if (auth instanceof Response) return auth;

    const { id: rawId } = await params;
    const parsedId = z.coerce.number().int().positive().safeParse(rawId);
    if (!parsedId.success) {
      return validationError(parsedId.error.issues);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return badRequest("Invalid JSON body");
    }

    const parsed = updateApiKeyBody.safeParse(body);
    if (!parsed.success) {
      return validationError(parsed.error.issues);
    }

    const db = getDb();

    // Check key exists
    const existing = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.id, parsedId.data))
      .get();

    if (!existing) {
      return notFound(`API key ${parsedId.data} not found`);
    }

    // Build update set
    const updateSet: Record<string, unknown> = {};
    if (parsed.data.name !== undefined)
      updateSet.name = parsed.data.name.trim();
    if (parsed.data.permissions !== undefined)
      updateSet.permissions = parsed.data.permissions;

    // Perform update
    const [updated] = await db
      .update(apiKeys)
      .set(updateSet)
      .where(eq(apiKeys.id, parsedId.data))
      .returning();

    return jsonResponse({
      id: updated!.id,
      name: updated!.name,
      description: updated!.description,
      permissions: updated!.permissions,
      created_at: updated!.createdAt.toISOString(),
      last_used_at: updated!.lastUsedAt?.toISOString() ?? null,
      expires_at: updated!.expiresAt?.toISOString() ?? null,
    });
  } catch (error) {
    console.error("Error updating API key:", error);
    return internalError();
  }
}
