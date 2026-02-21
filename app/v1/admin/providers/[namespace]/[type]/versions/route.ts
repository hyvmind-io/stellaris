import type { NextRequest } from "next/server";

import { z } from "zod";

import {
  badRequest,
  conflict,
  internalError,
  validationError,
} from "@/lib/api/errors";
import { etagResponse } from "@/lib/api/response";
import { requireAdminWriteAuth } from "@/lib/auth/middleware";
import { buildProviderAuditMetadata, writeAuditLog } from "@/lib/data/audit";
import { isUniqueConstraintError } from "@/lib/data/errors";
import { findProvider, saveProvider } from "@/lib/data/providers";
import {
  adminProviderCreateBody,
  type AdminProviderCreateBody,
} from "@/lib/validation/admin";
import { namespaceSchema, typeSchema } from "@/lib/validation/registry";

const routeParamsSchema = z.object({
  namespace: namespaceSchema,
  type: typeSchema,
});

type RouteParams = {
  params: Promise<{ namespace: string; type: string }>;
};

function toProviderResponse(
  namespace: string,
  type: string,
  body: AdminProviderCreateBody,
  revision: number,
) {
  return {
    id: `${namespace}/${type}/${body.version}`,
    namespace,
    type,
    version: body.version,
    protocols: body.protocols,
    platforms: body.platforms,
    gpg_public_keys: body.gpg_public_keys,
    revision,
  };
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireAdminWriteAuth(request);
    if (auth instanceof Response) return auth;

    const parsedParams = routeParamsSchema.safeParse(await params);
    if (!parsedParams.success)
      return validationError(parsedParams.error.issues);

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return badRequest("Invalid JSON body");
    }

    const parsedBody = adminProviderCreateBody.safeParse(rawBody);
    if (!parsedBody.success) return validationError(parsedBody.error.issues);

    const { namespace, type } = parsedParams.data;
    const body = parsedBody.data;

    const existing = await findProvider(namespace, type, body.version);
    if (existing) {
      return conflict(
        `Provider ${namespace}/${type} version ${body.version} already exists`,
      );
    }

    const provider = await saveProvider({
      namespace,
      type,
      version: body.version,
      protocols: body.protocols,
      platforms: body.platforms.map((platform) => ({
        os: platform.os,
        arch: platform.arch,
        filename: platform.filename,
        shasum: platform.shasum,
        location: platform.location,
        shasumUrl: platform.shasum_url,
        shasumSignatureUrl: platform.shasum_signature_url,
      })),
      gpgPublicKeys: body.gpg_public_keys.map((key) => ({
        keyId: key.key_id,
        asciiArmor: key.ascii_armor,
        source: key.source,
        sourceUrl: key.source_url ?? undefined,
      })),
    });

    try {
      await writeAuditLog({
        action: "provider.create",
        resourceType: "provider",
        resourceId: `${namespace}/${type}/${body.version}`,
        actorId: String(auth.id),
        actorType: "api_key",
        metadata: buildProviderAuditMetadata({
          namespace,
          type,
          version: body.version,
          revision: { nextRevision: provider.revision },
        }),
      });
    } catch (auditError) {
      console.error("Provider admin create audit write failed:", auditError);
    }

    return etagResponse(
      toProviderResponse(namespace, type, body, provider.revision),
      provider.revision,
      201,
    );
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return conflict("Provider version already exists");
    }
    console.error("Error creating provider version via admin API:", error);
    return internalError();
  }
}
