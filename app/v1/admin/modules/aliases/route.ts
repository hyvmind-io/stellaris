import type { NextRequest } from "next/server";
import { createModuleAliasBody } from "@/lib/validation/admin";
import {
  badRequest,
  conflict,
  internalError,
  validationError,
} from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { requireAdminWriteAuth } from "@/lib/auth/middleware";
import {
  createModuleAlias,
  validateModuleAliasCreateConstraints,
} from "@/lib/data/aliases";
import { writeAuditLog } from "@/lib/data/audit";
import { isUniqueConstraintError } from "@/lib/data/errors";

/**
 * POST /v1/admin/modules/aliases
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminWriteAuth(request);
    if (auth instanceof Response) return auth;

    const body = await request.json();
    const parsed = createModuleAliasBody.safeParse(body);
    if (!parsed.success) return validationError(parsed.error.issues);

    const {
      source_namespace,
      source_name,
      source_provider,
      target_namespace,
      target_name,
      target_provider,
    } = parsed.data;

    const constraints = await validateModuleAliasCreateConstraints({
      sourceNamespace: source_namespace,
      sourceName: source_name,
      sourceProvider: source_provider,
      targetNamespace: target_namespace,
      targetName: target_name,
      targetProvider: target_provider,
    });
    if (!constraints.ok) {
      return badRequest(constraints.message);
    }

    const alias = await createModuleAlias({
      sourceNamespace: source_namespace,
      sourceName: source_name,
      sourceProvider: source_provider,
      targetNamespace: target_namespace,
      targetName: target_name,
      targetProvider: target_provider,
      createdBy: auth.name,
    });

    try {
      await writeAuditLog({
        action: "alias.create",
        resourceType: "alias",
        resourceId: `${source_namespace}/${source_name}/${source_provider}`,
        actorId: auth.name,
        actorType: "api_key",
        metadata: {
          entity: "module_alias",
          source: {
            namespace: source_namespace,
            name: source_name,
            provider: source_provider,
          },
          target: {
            namespace: target_namespace,
            name: target_name,
            provider: target_provider,
          },
        },
      });
    } catch (auditError) {
      console.error("Failed to write alias.create audit log:", auditError);
    }

    return jsonResponse(
      {
        id: alias.id,
        source_namespace: alias.sourceNamespace,
        source_name: alias.sourceName,
        source_provider: alias.sourceProvider,
        target_namespace: alias.targetNamespace,
        target_name: alias.targetName,
        target_provider: alias.targetProvider,
        created_by: alias.createdBy,
        created_at: alias.createdAt.toISOString(),
      },
      201,
    );
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return conflict("Alias already exists for this source");
    }

    console.error("Error creating module alias:", error);
    return internalError();
  }
}
