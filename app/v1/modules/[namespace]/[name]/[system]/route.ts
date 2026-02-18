import type { NextRequest } from "next/server";
import { moduleLatestParams } from "@/lib/validation/registry";
import { notFound, validationError, internalError } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { getModuleLatestVersion } from "@/lib/data/modules";

/**
 * GET /v1/modules/:namespace/:name/:system
 *
 * Return the latest version of a specific module.
 */
export async function GET(
  _request: NextRequest,
  {
    params,
  }: { params: Promise<{ namespace: string; name: string; system: string }> },
) {
  try {
    const rawParams = await params;
    const parsed = moduleLatestParams.safeParse(rawParams);
    if (!parsed.success) return validationError(parsed.error.issues);

    const { namespace, name, system } = parsed.data;
    const mod = await getModuleLatestVersion(namespace, name, system);

    if (!mod) {
      return notFound(`Module ${namespace}/${name}/${system} not found`);
    }

    return jsonResponse({
      id: `${mod.namespace}/${mod.name}/${mod.provider}/${mod.version}`,
      namespace: mod.namespace,
      name: mod.name,
      provider: mod.provider,
      version: mod.version,
      owner: mod.owner,
      description: mod.description,
      source: mod.source,
      published_at: mod.publishedAt.toISOString(),
      downloads: mod.downloads,
    });
  } catch (error) {
    console.error("Error getting latest module:", error);
    return internalError();
  }
}
