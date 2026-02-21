import type { NextRequest } from "next/server";
import { moduleListQuery } from "@/lib/validation/registry";
import { validationError, internalError } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { findAllModules, resolveModuleTags } from "@/lib/data/modules";
import { requireAuth } from "@/lib/auth/middleware";

/**
 * GET /v1/modules?namespace=...&provider=...&q=...&offset=0&limit=15
 *
 * List/search modules with pagination and optional filters.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, "modules:read");
    if (auth instanceof Response) return auth;

    const searchParams = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = moduleListQuery.safeParse(searchParams);
    if (!parsed.success) return validationError(parsed.error.issues);

    const { offset, limit, q, namespace, provider } = parsed.data;
    const result = await findAllModules({
      namespace,
      provider,
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
      modules: result.modules.map((m) => ({
        id: `${m.namespace}/${m.name}/${m.provider}/${m.version}`,
        namespace: m.namespace,
        name: m.name,
        provider: m.provider,
        version: m.version,
        owner: m.owner,
        description: m.description,
        source: m.source,
        published_at: m.publishedAt.toISOString(),
        downloads: m.downloads,
        tags: resolveModuleTags(m),
      })),
    });
  } catch (error) {
    console.error("Error listing modules:", error);
    return internalError();
  }
}
