import type { NextRequest } from "next/server";
import { providerGetParams } from "@/lib/validation/registry";
import {
  methodNotAllowed,
  notFound,
  validationError,
  internalError,
} from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { resolveProviderCoordinates } from "@/lib/data/aliases";
import { findProvider, getProviderPlatforms } from "@/lib/data/providers";
import { requireAuth } from "@/lib/auth/middleware";
import { proxyProviderJson } from "@/lib/upstream/proxy";

type RouteParams = {
  params: Promise<{ namespace: string; type: string; version: string }>;
};

/**
 * GET /v1/providers/:namespace/:type/:version
 *
 * Return full metadata for a specific provider version with platforms.
 * Resolution: local -> upstream proxy fallback.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireAuth(request, "providers:read");
    if (auth instanceof Response) return auth;

    const rawParams = await params;
    const parsed = providerGetParams.safeParse(rawParams);
    if (!parsed.success) return validationError(parsed.error.issues);

    const { namespace, type, version } = parsed.data;
    const canonical = await resolveProviderCoordinates(namespace, type);
    const provider = await findProvider(
      canonical.namespace,
      canonical.type,
      version,
    );

    if (provider) {
      const platforms = await getProviderPlatforms(provider.id);

      return jsonResponse({
        id: `${provider.namespace}/${provider.type}/${provider.version}`,
        namespace: provider.namespace,
        type: provider.type,
        version: provider.version,
        protocols: provider.protocols,
        platforms: platforms.map((p) => ({ os: p.os, arch: p.arch })),
        published_at: provider.publishedAt.toISOString(),
      });
    }

    // Upstream fallback
    const upstream = await proxyProviderJson(
      `/v1/providers/${canonical.namespace}/${canonical.type}/${version}`,
    );
    if (upstream) {
      return jsonResponse(upstream.data);
    }

    return notFound(
      `Provider ${namespace}/${type} version ${version} not found`,
    );
  } catch (error) {
    console.error("Error getting provider:", error);
    return internalError();
  }
}

/**
 * POST /v1/providers/:namespace/:type/:version
 *
 * Publish a new provider version.
 * Body: multipart form with:
 *   - `data`: JSON string with protocols, platforms, gpg_public_keys
 *   - One .zip file per platform (field name = filename)
 *   - `SHA256SUMS`: text file
 *   - `SHA256SUMS.sig`: binary signature file
 *
 * Consistency guarantee: R2 uploads + DB insert are made atomic via
 * "upload-then-insert-with-rollback". If the DB insert fails, all
 * R2 objects are deleted to prevent orphaned artifacts.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  void request;
  void params;
  return methodNotAllowed(
    "Provider publish is only available under /v1/admin/providers",
  );
}

/**
 * DELETE /v1/providers/:namespace/:type/:version
 *
 * Delete a provider version with all platforms, GPG keys, and R2 artifacts.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  void request;
  void params;
  return methodNotAllowed(
    "Provider deletes are only available under /v1/admin/providers",
  );
}
