import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { apiKeys } from "@/db/schema";
import { requireAuth } from "@/lib/auth/middleware";
import { notFound, validationError, internalError } from "@/lib/api/errors";
import { noContentResponse } from "@/lib/api/response";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * DELETE /v1/api-keys/:id
 *
 * Revoke (permanently delete) an API key by its numeric ID.
 * Requires admin permission.
 *
 * Returns 204 on success, 404 if the key doesn't exist.
 *
 * Self-revocation is allowed: if an admin deletes their own key and it's the
 * last key, the registry enters bootstrap mode (unauthenticated key creation).
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
    const deleted = await db
      .delete(apiKeys)
      .where(eq(apiKeys.id, parsed.data))
      .returning({ id: apiKeys.id });

    if (deleted.length === 0) {
      return notFound(`API key ${parsed.data} not found`);
    }

    return noContentResponse({});
  } catch (error) {
    console.error("Error revoking API key:", error);
    return internalError();
  }
}
