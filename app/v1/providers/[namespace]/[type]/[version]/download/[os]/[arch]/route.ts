import type { NextRequest } from "next/server";
import { providerDownloadParams } from "@/lib/validation/registry";
import { notFound, validationError, internalError } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { findProviderPackage } from "@/lib/data/providers";
import { requireAuth } from "@/lib/auth/middleware";

/**
 * GET /v1/providers/:namespace/:type/:version/download/:os/:arch
 *
 * Find a provider package -- returns download URL, checksums, and signing keys.
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
    const pkg = await findProviderPackage(namespace, type, version, os, arch);

    if (!pkg) {
      return notFound(
        `Provider ${namespace}/${type} version ${version} for ${os}/${arch} not found`,
      );
    }

    const { provider, platform, gpgKeys } = pkg;

    // Terraform CLI expects this exact response format
    return jsonResponse({
      protocols: provider.protocols,
      os: platform.os,
      arch: platform.arch,
      filename: platform.filename,
      download_url: `/v1/providers/${namespace}/${type}/${version}/download/${os}/${arch}/zip`,
      shasums_url: `/v1/providers/${namespace}/${type}/${version}/sha256sums`,
      shasums_signature_url: `/v1/providers/${namespace}/${type}/${version}/sha256sums.sig`,
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
  } catch (error) {
    console.error("Error finding provider package:", error);
    return internalError();
  }
}
