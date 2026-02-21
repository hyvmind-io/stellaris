import type { NextRequest } from "next/server";

import {
  conflict,
  internalError,
  notFound,
  validationError,
} from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { requireAdminWriteAuth } from "@/lib/auth/middleware";
import { buildProviderAuditMetadata, writeAuditLog } from "@/lib/data/audit";
import {
  createProviderAlias,
  validateProviderAliasCreateConstraints,
} from "@/lib/data/aliases";
import { isUniqueConstraintError } from "@/lib/data/errors";
import { createProviderAliasBody } from "@/lib/validation/admin";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminWriteAuth(request);
    if (auth instanceof Response) return auth;

    const rawBody = await request.json();
    const parsedBody = createProviderAliasBody.safeParse(rawBody);
    if (!parsedBody.success) return validationError(parsedBody.error.issues);

    const { source_namespace, source_type, target_namespace, target_type } =
      parsedBody.data;

    const constraints = await validateProviderAliasCreateConstraints({
      sourceNamespace: source_namespace,
      sourceType: source_type,
      targetNamespace: target_namespace,
      targetType: target_type,
    });
    if (!constraints.ok) {
      if (constraints.code === "TARGET_NOT_FOUND") {
        return notFound(constraints.message);
      }
      return conflict(constraints.message);
    }

    const created = await createProviderAlias({
      sourceNamespace: source_namespace,
      sourceType: source_type,
      targetNamespace: target_namespace,
      targetType: target_type,
      createdBy: auth.name,
    });

    try {
      await writeAuditLog({
        action: "alias.create",
        resourceType: "provider_alias",
        resourceId: `${source_namespace}/${source_type}`,
        actorId: String(auth.id),
        actorType: "api_key",
        metadata: buildProviderAuditMetadata({
          namespace: target_namespace,
          type: target_type,
          version: "alias",
          changedFields: ["source_namespace", "source_type"],
        }),
      });
    } catch (auditError) {
      console.error("Provider alias create audit write failed:", auditError);
    }

    return jsonResponse(
      {
        id: created.id,
        source_namespace: created.sourceNamespace,
        source_type: created.sourceType,
        target_namespace: created.targetNamespace,
        target_type: created.targetType,
        created_by: created.createdBy,
        created_at: created.createdAt.toISOString(),
      },
      201,
    );
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return conflict("Provider alias source already exists");
    }

    console.error("Error creating provider alias via admin API:", error);
    return internalError();
  }
}
