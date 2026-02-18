import type { NextRequest } from "next/server";
import { providerDownloadParams } from "@/lib/validation/registry";
import { notFound, validationError, internalError } from "@/lib/api/errors";
import { binaryResponse } from "@/lib/api/response";
import { getObject } from "@/lib/storage/r2";
import { generateProviderKey } from "@/lib/storage/keys";

/**
 * GET /v1/providers/:namespace/:type/:version/download/:os/:arch/zip
 *
 * Download the actual provider binary zip from R2.
 */
export async function GET(
  _request: NextRequest,
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
    const rawParams = await params;
    const parsed = providerDownloadParams.safeParse(rawParams);

    if (!parsed.success) {
      return validationError(parsed.error.issues);
    }

    const { namespace, type, version, os, arch } = parsed.data;
    const key = generateProviderKey(namespace, type, version, os, arch);

    const object = await getObject(key);
    if (!object) {
      return notFound("Provider binary not found");
    }

    const filename = `terraform-provider-${type}_${version}_${os}_${arch}.zip`;

    return binaryResponse(object.body, "application/zip", filename);
  } catch (error) {
    console.error("Error serving provider zip:", error);
    return internalError();
  }
}
