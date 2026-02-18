import type { NextRequest } from "next/server";
import { providerListQuery } from "@/lib/validation/registry";
import { validationError, internalError } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { findAllProviders } from "@/lib/data/providers";
import { requireAuth } from "@/lib/auth/middleware";

/**
 * GET /v1/providers?namespace=...&type=...&q=...&offset=0&limit=15
 *
 * List/search providers with pagination and optional filters.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, "providers:read");
    if (auth instanceof Response) return auth;

    const searchParams = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = providerListQuery.safeParse(searchParams);
    if (!parsed.success) return validationError(parsed.error.issues);

    const { offset, limit, q, namespace, type } = parsed.data;
    const result = await findAllProviders({
      namespace,
      type,
      q,
      offset,
      limit,
    });

    return jsonResponse({
      meta: {
        limit: result.meta.limit,
        current_offset: result.meta.offset,
        next_offset:
          result.meta.offset + result.meta.limit < result.meta.total
            ? result.meta.offset + result.meta.limit
            : null,
        total: result.meta.total,
      },
      providers: result.providers.map((p) => ({
        id: `${p.namespace}/${p.type}/${p.version}`,
        namespace: p.namespace,
        type: p.type,
        version: p.version,
        protocols: p.protocols,
        published_at: p.publishedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Error listing providers:", error);
    return internalError();
  }
}
