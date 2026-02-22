"use server";

import { and, desc, eq, sum } from "drizzle-orm";
import { getAuth } from "@/lib/auth/get-auth";
import { getDb } from "@/db/client";
import { modules } from "@/db/schema";
import { makeEtag } from "@/lib/api/etag";
import {
  createModuleAlias,
  validateModuleAliasCreateConstraints,
} from "@/lib/data/aliases";
import {
  conditionalModuleDelete,
  conditionalModuleUpdate,
  RevisionConflictError,
} from "@/lib/data/concurrency";
import {
  browseModules,
  findModule,
  getModuleVersions,
  parseTags,
  saveModule,
} from "@/lib/data/modules";
import { uploadModuleTarball, deleteObject } from "@/lib/storage";
import { createModuleAliasBody } from "@/lib/validation/admin";
import type {
  AdminActionResult,
  AdminListResult,
  AdminModuleDetail,
  AdminModuleSummary,
  CreateModuleFormData,
  EditModuleFormData,
} from "@/types/admin-registry";

const LIMIT_DEFAULT = 10;

async function requireAdmin(): Promise<boolean> {
  const auth = await getAuth();
  return Boolean(auth && auth.user.role === "admin");
}

function unauthorizedResult<T>(): AdminActionResult<T> {
  return {
    success: false,
    code: "UNAUTHORIZED",
    error: "Admin access required",
  };
}

function toConflictResult<T>(
  error: RevisionConflictError,
): AdminActionResult<T> {
  return {
    success: false,
    code: "CONFLICT",
    error:
      "This module was changed by another admin. Refresh the list and try again.",
    conflict: {
      expectedRevision: error.expectedRevision,
      currentRevision: error.currentRevision ?? undefined,
    },
  };
}

function parseTagsInput(tags: string): string[] | undefined {
  const parsed = tags
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : undefined;
}

export async function listAdminModulesAction(params: {
  page?: number;
  limit?: number;
  search?: string;
}): Promise<AdminActionResult<AdminListResult<AdminModuleSummary>>> {
  const isAdmin = await requireAdmin();
  if (!isAdmin)
    return unauthorizedResult<AdminListResult<AdminModuleSummary>>();

  try {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(50, Math.max(1, params.limit ?? LIMIT_DEFAULT));
    const offset = (page - 1) * limit;

    const result = await browseModules({
      offset,
      limit,
      q: params.search?.trim() || undefined,
    });

    const db = getDb();
    const items = await Promise.all(
      result.modules.map(async (mod) => {
        const [versions, downloadsRow] = await Promise.all([
          getModuleVersions(mod.namespace, mod.name, mod.provider),
          db
            .select({ totalDownloads: sum(modules.downloads) })
            .from(modules)
            .where(
              and(
                eq(modules.namespace, mod.namespace),
                eq(modules.name, mod.name),
                eq(modules.provider, mod.provider),
              ),
            )
            .get(),
        ]);

        return {
          namespace: mod.namespace,
          name: mod.name,
          provider: mod.provider,
          description: mod.description,
          latestVersion: mod.version,
          revision: mod.revision,
          etag: makeEtag(mod.revision),
          versionCount: versions.length,
          totalDownloads: Number(downloadsRow?.totalDownloads ?? 0),
          publishedAt: mod.publishedAt,
          updatedAt: mod.updatedAt,
        } satisfies AdminModuleSummary;
      }),
    );

    return {
      success: true,
      data: {
        items,
        total: result.meta.total,
        page,
        totalPages: Math.max(1, Math.ceil(result.meta.total / limit)),
      },
    };
  } catch (error) {
    console.error("[Admin Modules] listAdminModulesAction error:", error);
    return {
      success: false,
      code: "UNKNOWN",
      error: "Failed to load modules",
    };
  }
}

export async function getModuleDetailAction(
  namespace: string,
  name: string,
  provider: string,
): Promise<AdminActionResult<AdminModuleDetail>> {
  const isAdmin = await requireAdmin();
  if (!isAdmin) return unauthorizedResult<AdminModuleDetail>();

  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(modules)
      .where(
        and(
          eq(modules.namespace, namespace),
          eq(modules.name, name),
          eq(modules.provider, provider),
        ),
      )
      .orderBy(desc(modules.publishedAt));

    if (rows.length === 0) {
      return {
        success: false,
        code: "NOT_FOUND",
        error: "Module not found",
      };
    }

    const latest = rows[0]!;

    return {
      success: true,
      data: {
        namespace,
        name,
        provider,
        description: latest.description,
        source: latest.source,
        owner: latest.owner,
        tags: parseTags(latest.tags) ?? [latest.provider],
        versions: rows.map((row) => ({
          id: row.id,
          version: row.version,
          revision: row.revision,
          etag: makeEtag(row.revision),
          description: row.description,
          source: row.source,
          owner: row.owner,
          downloads: row.downloads,
          location: row.location,
          publishedAt: row.publishedAt,
        })),
      },
    };
  } catch (error) {
    console.error("[Admin Modules] getModuleDetailAction error:", error);
    return {
      success: false,
      code: "UNKNOWN",
      error: "Failed to load module details",
    };
  }
}

export async function createModuleAction(
  data: CreateModuleFormData,
): Promise<AdminActionResult> {
  const isAdmin = await requireAdmin();
  if (!isAdmin) return unauthorizedResult();

  if (!data.artifact) {
    return {
      success: false,
      code: "VALIDATION",
      error: "Module archive is required",
    };
  }

  try {
    const existing = await findModule(
      data.namespace,
      data.name,
      data.provider,
      data.version,
    );

    if (existing) {
      return {
        success: false,
        code: "CONFLICT",
        error: "Module version already exists",
      };
    }

    const location = await uploadModuleTarball(
      data.namespace,
      data.name,
      data.provider,
      data.version,
      data.artifact.stream(),
    );

    try {
      await saveModule({
        namespace: data.namespace,
        name: data.name,
        provider: data.provider,
        version: data.version,
        owner: data.owner || undefined,
        description: data.description || undefined,
        source: data.source || undefined,
        tags: parseTagsInput(data.tags),
        location,
      });
      return { success: true };
    } catch (dbError) {
      await deleteObject(location);
      throw dbError;
    }
  } catch (error) {
    console.error("[Admin Modules] createModuleAction error:", error);
    return {
      success: false,
      code: "UNKNOWN",
      error: "Failed to publish module",
    };
  }
}

export async function editModuleMetadataAction(
  namespace: string,
  name: string,
  provider: string,
  data: EditModuleFormData,
  expectedRevision: number,
): Promise<AdminActionResult<{ revision: number; etag: string }>> {
  const isAdmin = await requireAdmin();
  if (!isAdmin) return unauthorizedResult<{ revision: number; etag: string }>();

  try {
    const updated = await conditionalModuleUpdate(
      namespace,
      name,
      provider,
      data.version,
      expectedRevision,
      {
        description: data.description || null,
        source: data.source || null,
        owner: data.owner,
        tags: parseTagsInput(data.tags),
      },
    );

    return {
      success: true,
      data: {
        revision: updated.revision,
        etag: makeEtag(updated.revision),
      },
    };
  } catch (error) {
    if (error instanceof RevisionConflictError) {
      return toConflictResult(error);
    }

    console.error("[Admin Modules] editModuleMetadataAction error:", error);
    return {
      success: false,
      code: "UNKNOWN",
      error: "Failed to update module metadata",
    };
  }
}

export async function deleteModuleVersionAction(
  namespace: string,
  name: string,
  provider: string,
  version: string,
  expectedRevision: number,
): Promise<AdminActionResult> {
  const isAdmin = await requireAdmin();
  if (!isAdmin) return unauthorizedResult();

  try {
    const moduleRecord = await findModule(namespace, name, provider, version);
    if (!moduleRecord) {
      return {
        success: false,
        code: "NOT_FOUND",
        error: "Module version not found",
      };
    }

    if (moduleRecord.location) {
      await deleteObject(moduleRecord.location);
    }

    await conditionalModuleDelete(
      namespace,
      name,
      provider,
      version,
      expectedRevision,
    );

    return { success: true };
  } catch (error) {
    if (error instanceof RevisionConflictError) {
      return toConflictResult(error);
    }

    console.error("[Admin Modules] deleteModuleVersionAction error:", error);
    return {
      success: false,
      code: "UNKNOWN",
      error: "Failed to delete module version",
    };
  }
}

export async function deleteModuleAction(
  namespace: string,
  name: string,
  provider: string,
): Promise<AdminActionResult> {
  const isAdmin = await requireAdmin();
  if (!isAdmin) return unauthorizedResult();

  try {
    const detail = await getModuleDetailAction(namespace, name, provider);
    if (!detail.success || !detail.data) {
      return {
        success: false,
        code: detail.code ?? "NOT_FOUND",
        error: detail.error ?? "Module not found",
      };
    }

    for (const version of detail.data.versions) {
      const deleted = await deleteModuleVersionAction(
        namespace,
        name,
        provider,
        version.version,
        version.revision,
      );
      if (!deleted.success) {
        return deleted;
      }
    }

    return { success: true };
  } catch (error) {
    console.error("[Admin Modules] deleteModuleAction error:", error);
    return {
      success: false,
      code: "UNKNOWN",
      error: "Failed to delete module",
    };
  }
}

export async function renameModuleAction(
  namespace: string,
  name: string,
  provider: string,
  values: Record<string, string>,
): Promise<AdminActionResult> {
  const isAdmin = await requireAdmin();
  if (!isAdmin) return unauthorizedResult();

  try {
    const source = {
      namespace,
      name,
      provider,
    };
    const nextNamespace = values.namespace?.trim();
    const nextName = values.name?.trim();
    const nextProvider = values.provider?.trim();

    if (!nextNamespace || !nextName || !nextProvider) {
      return {
        success: false,
        code: "VALIDATION",
        error: "Namespace, name, and provider are required",
      };
    }

    const parsed = createModuleAliasBody.safeParse({
      source_namespace: source.namespace,
      source_name: source.name,
      source_provider: source.provider,
      target_namespace: nextNamespace,
      target_name: nextName,
      target_provider: nextProvider,
    });
    if (!parsed.success) {
      return {
        success: false,
        code: "VALIDATION",
        error:
          parsed.error.issues[0]?.message ??
          "Invalid module coordinates for rename",
      };
    }

    const constraints = await validateModuleAliasCreateConstraints({
      sourceNamespace: parsed.data.source_namespace,
      sourceName: parsed.data.source_name,
      sourceProvider: parsed.data.source_provider,
      targetNamespace: parsed.data.target_namespace,
      targetName: parsed.data.target_name,
      targetProvider: parsed.data.target_provider,
    });
    if (!constraints.ok) {
      return {
        success: false,
        code:
          constraints.code === "TARGET_NOT_FOUND" ? "NOT_FOUND" : "VALIDATION",
        error: constraints.message,
      };
    }

    await createModuleAlias({
      sourceNamespace: source.namespace,
      sourceName: source.name,
      sourceProvider: source.provider,
      targetNamespace: parsed.data.target_namespace,
      targetName: parsed.data.target_name,
      targetProvider: parsed.data.target_provider,
      createdBy: "admin-ui",
    });

    return { success: true };
  } catch (error) {
    console.error("[Admin Modules] renameModuleAction error:", error);
    return {
      success: false,
      code: "CONFLICT",
      error: "Unable to create alias for rename. Refresh and try again.",
    };
  }
}

export async function replaceModuleArtifactAction(): Promise<AdminActionResult> {
  return {
    success: false,
    code: "VALIDATION",
    error:
      "Module artifact replacement is not available in the current admin API contract.",
  };
}
