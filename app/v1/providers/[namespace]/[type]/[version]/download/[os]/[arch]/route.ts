import type { NextRequest } from "next/server";
import { providerDownloadParams } from "@/lib/validation/registry";
import { notFound, validationError, internalError } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { resolveProviderCoordinates } from "@/lib/data/aliases";
import { findProviderPackage } from "@/lib/data/providers";
import { requireAuth } from "@/lib/auth/middleware";
import { proxyProviderJson } from "@/lib/upstream/proxy";
import { artifactUrl, isWorkersFreeTier } from "@/lib/storage/artifact-url";
import { generateProviderKey } from "@/lib/storage/keys";

/**
 * GET /v1/providers/:namespace/:type/:version/download/:os/:arch
 *
 * Find a provider package -- returns download URL, checksums, and signing keys.
 * Resolution: local -> upstream proxy fallback.
 *
 * ref: https://developer.hashicorp.com/terraform/internals/provider-registry-protocol#find-a-provider-package
 */
export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      namespace: string;
      type: string;
      version: string;
      os: string;
      arch: string;
    }>;
  },
) {
  try {
    const auth = await requireAuth(request, "providers:read");
    if (auth instanceof Response) return auth;

    const rawParams = await params;
    const parsed = providerDownloadParams.safeParse(rawParams);

    if (!parsed.success) {
      return validationError(parsed.error.issues);
    }

    const { namespace, type, version, os, arch } = parsed.data;
    const canonical = await resolveProviderCoordinates(namespace, type);
    const pkg = await findProviderPackage(
      canonical.namespace,
      canonical.type,
      version,
      os,
      arch,
    );

    if (pkg) {
      const { provider, platform, gpgKeys } = pkg;
      const base = `/v1/providers/${namespace}/${type}/${version}`;
      const objectBase = `providers/${canonical.namespace}/${canonical.type}/${version}`;
      // Free tier: hand the CLI R2 URLs directly so no bytes cross the Worker
      // and the artifact routes can require a Bearer token.
      const free = isWorkersFreeTier();
      const [zipUrl, sumsUrl, sigUrl] = free
        ? await Promise.all([
            artifactUrl(generateProviderKey(canonical.namespace, canonical.type, version, os, arch)),
            artifactUrl(`${objectBase}/SHA256SUMS`),
            artifactUrl(`${objectBase}/SHA256SUMS.sig`),
          ])
        : [null, null, null];

      // Terraform CLI expects this exact response format
      return jsonResponse({
        protocols: provider.protocols,
        os: platform.os,
        arch: platform.arch,
        filename: platform.filename,
        download_url: zipUrl ?? `${base}/download/${os}/${arch}/zip`,
        shasums_url: sumsUrl ?? `${base}/sha256sums`,
        shasums_signature_url: sigUrl ?? `${base}/sha256sums.sig`,
        shasum: platform.shasum,
        signing_keys: {
          gpg_public_keys: gpgKeys.map((key) => ({
            key_id: key.keyId,
            ascii_armor: key.asciiArmor,
            source: key.source,
            source_url: key.sourceUrl,
          })),
        },
      });
    }

    // Upstream fallback
    const upstream = await proxyProviderJson(
      `/v1/providers/${canonical.namespace}/${canonical.type}/${version}/download/${os}/${arch}`,
    );
    if (upstream) {
      return jsonResponse(upstream.data);
    }

    return notFound(
      `Provider ${namespace}/${type} version ${version} for ${os}/${arch} not found`,
    );
  } catch (error) {
    console.error("Error finding provider package:", error);
    return internalError();
  }
}
