"use server";

import { and, desc, eq } from "drizzle-orm";
import { getAuth } from "@/lib/auth/get-auth";
import { getDb } from "@/db/client";
import { providers } from "@/db/schema";
import { makeEtag } from "@/lib/api/etag";
import {
  createProviderAlias,
  validateProviderAliasCreateConstraints,
} from "@/lib/data/aliases";
import {
  conditionalProviderUpdate,
  RevisionConflictError,
} from "@/lib/data/concurrency";
import {
  browseProviders,
  conditionalDeleteProvider,
  findProvider,
  getProviderGpgKeys,
  getProviderPlatforms,
  getProviderVersions,
  replaceProviderPlatform,
  saveProvider,
} from "@/lib/data/providers";
import {
  uploadProviderZip,
  uploadShasums,
  uploadShasumsSignature,
  deleteByPrefix,
} from "@/lib/storage";
import { createProviderAliasBody } from "@/lib/validation/admin";
import type {
  AdminActionResult,
  AdminListResult,
  AdminProviderDetail,
  AdminProviderSummary,
  CreateProviderFormData,
  EditProviderFormData,
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
      "This provider was changed by another admin. Refresh the list and try again.",
    conflict: {
      expectedRevision: error.expectedRevision,
      currentRevision: error.currentRevision ?? undefined,
    },
  };
}

function parseProtocols(protocols: string): string[] {
  return protocols
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer(),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function listAdminProvidersAction(params: {
  page?: number;
  limit?: number;
  search?: string;
}): Promise<AdminActionResult<AdminListResult<AdminProviderSummary>>> {
  const isAdmin = await requireAdmin();
  if (!isAdmin) {
    return unauthorizedResult<AdminListResult<AdminProviderSummary>>();
  }

  try {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(50, Math.max(1, params.limit ?? LIMIT_DEFAULT));
    const offset = (page - 1) * limit;

    const result = await browseProviders({
      offset,
      limit,
      q: params.search?.trim() || undefined,
    });

    const items = await Promise.all(
      result.providers.map(async (provider) => {
        const versions = await getProviderVersions(
          provider.namespace,
          provider.type,
        );
        const totalPlatforms = versions.reduce(
          (acc, version) => acc + version.platforms.length,
          0,
        );

        return {
          namespace: provider.namespace,
          type: provider.type,
          latestVersion: provider.version,
          revision: provider.revision,
          etag: makeEtag(provider.revision),
          protocols: provider.protocols,
          versionCount: versions.length,
          totalPlatforms,
          publishedAt: provider.publishedAt,
        } satisfies AdminProviderSummary;
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
    console.error("[Admin Providers] listAdminProvidersAction error:", error);
    return {
      success: false,
      code: "UNKNOWN",
      error: "Failed to load providers",
    };
  }
}

export async function getProviderDetailAction(
  namespace: string,
  type: string,
): Promise<AdminActionResult<AdminProviderDetail>> {
  const isAdmin = await requireAdmin();
  if (!isAdmin) return unauthorizedResult<AdminProviderDetail>();

  try {
    const db = getDb();
    const versions = await db
      .select()
      .from(providers)
      .where(and(eq(providers.namespace, namespace), eq(providers.type, type)))
      .orderBy(desc(providers.publishedAt));

    if (versions.length === 0) {
      return {
        success: false,
        code: "NOT_FOUND",
        error: "Provider not found",
      };
    }

    const versionDetails = await Promise.all(
      versions.map(async (version) => {
        const [platforms, gpgKeys] = await Promise.all([
          getProviderPlatforms(version.id),
          getProviderGpgKeys(version.id),
        ]);

        return {
          id: version.id,
          version: version.version,
          revision: version.revision,
          etag: makeEtag(version.revision),
          protocols: version.protocols,
          platforms: platforms.map((platform) => ({
            os: platform.os,
            arch: platform.arch,
            filename: platform.filename,
            shasum: platform.shasum,
          })),
          gpgKeys: gpgKeys.map((key) => ({
            keyId: key.keyId,
            source: key.source,
          })),
          publishedAt: version.publishedAt,
        };
      }),
    );

    return {
      success: true,
      data: {
        namespace,
        type,
        protocols: versions[0]!.protocols,
        versions: versionDetails,
      },
    };
  } catch (error) {
    console.error("[Admin Providers] getProviderDetailAction error:", error);
    return {
      success: false,
      code: "UNKNOWN",
      error: "Failed to load provider details",
    };
  }
}

export async function createProviderAction(
  data: CreateProviderFormData,
): Promise<AdminActionResult> {
  const isAdmin = await requireAdmin();
  if (!isAdmin) return unauthorizedResult();

  if (!data.artifact) {
    return {
      success: false,
      code: "VALIDATION",
      error: "Provider archive is required",
    };
  }

  try {
    const protocols = parseProtocols(data.protocols);
    if (protocols.length === 0) {
      return {
        success: false,
        code: "VALIDATION",
        error: "At least one protocol is required",
      };
    }

    const existing = await findProvider(
      data.namespace,
      data.type,
      data.version,
    );
    if (existing) {
      return {
        success: false,
        code: "CONFLICT",
        error: "Provider version already exists",
      };
    }

    const providerLocation = await uploadProviderZip(
      data.namespace,
      data.type,
      data.version,
      data.os,
      data.arch,
      data.artifact.stream(),
    );

    let shasum = await sha256Hex(data.artifact);
    if (data.shasumFile) {
      const shasumText = await data.shasumFile.text();
      const parsed = shasumText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .find((line) => line.includes(data.artifact!.name));
      if (parsed) {
        const [fromFile] = parsed.split(/\s+\*?/);
        if (fromFile && /^[a-f0-9]{64}$/i.test(fromFile)) {
          shasum = fromFile.toLowerCase();
        }
      }
    }

    const shasumUrl = data.shasumFile
      ? await uploadShasums(
          data.namespace,
          data.type,
          data.version,
          await data.shasumFile.text(),
        )
      : undefined;

    const shasumSignatureUrl = data.shasumSigFile
      ? await uploadShasumsSignature(
          data.namespace,
          data.type,
          data.version,
          await data.shasumSigFile.arrayBuffer(),
        )
      : undefined;

    await saveProvider({
      namespace: data.namespace,
      type: data.type,
      version: data.version,
      protocols,
      platforms: [
        {
          os: data.os,
          arch: data.arch,
          filename: data.artifact.name,
          shasum,
          location: providerLocation,
          shasumUrl,
          shasumSignatureUrl,
        },
      ],
      gpgPublicKeys: [
        {
          keyId: data.gpgKeyId,
          asciiArmor: data.gpgAsciiArmor,
          source: data.gpgSource,
          sourceUrl: data.gpgSourceUrl || undefined,
        },
      ],
    });

    return { success: true };
  } catch (error) {
    console.error("[Admin Providers] createProviderAction error:", error);
    return {
      success: false,
      code: "UNKNOWN",
      error: "Failed to publish provider",
    };
  }
}

export async function editProviderMetadataAction(
  namespace: string,
  type: string,
  data: EditProviderFormData,
  expectedRevision: number,
): Promise<AdminActionResult<{ revision: number; etag: string }>> {
  const isAdmin = await requireAdmin();
  if (!isAdmin) return unauthorizedResult<{ revision: number; etag: string }>();

  try {
    const updated = await conditionalProviderUpdate(
      namespace,
      type,
      data.version,
      expectedRevision,
      { protocols: parseProtocols(data.protocols) },
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

    console.error("[Admin Providers] editProviderMetadataAction error:", error);
    return {
      success: false,
      code: "UNKNOWN",
      error: "Failed to update provider metadata",
    };
  }
}

export async function deleteProviderVersionAction(
  namespace: string,
  type: string,
  version: string,
  expectedRevision: number,
): Promise<AdminActionResult> {
  const isAdmin = await requireAdmin();
  if (!isAdmin) return unauthorizedResult();

  try {
    const existing = await findProvider(namespace, type, version);
    if (!existing) {
      return {
        success: false,
        code: "NOT_FOUND",
        error: "Provider version not found",
      };
    }

    if (existing.revision !== expectedRevision) {
      return {
        success: false,
        code: "CONFLICT",
        error:
          "This provider was changed by another admin. Refresh the list and try again.",
        conflict: {
          expectedRevision,
          currentRevision: existing.revision,
        },
      };
    }

    await deleteByPrefix(`providers/${namespace}/${type}/${version}/`);

    const deleted = await conditionalDeleteProvider(
      namespace,
      type,
      version,
      expectedRevision,
    );

    if (!deleted) {
      return {
        success: false,
        code: "NOT_FOUND",
        error: "Provider version not found",
      };
    }
    return { success: true };
  } catch (error) {
    if (error instanceof RevisionConflictError) {
      return toConflictResult(error);
    }

    console.error(
      "[Admin Providers] deleteProviderVersionAction error:",
      error,
    );
    return {
      success: false,
      code: "UNKNOWN",
      error: "Failed to delete provider version",
    };
  }
}

export async function deleteProviderAction(
  namespace: string,
  type: string,
): Promise<AdminActionResult> {
  const isAdmin = await requireAdmin();
  if (!isAdmin) return unauthorizedResult();

  try {
    const detail = await getProviderDetailAction(namespace, type);
    if (!detail.success || !detail.data) {
      return {
        success: false,
        code: detail.code ?? "NOT_FOUND",
        error: detail.error ?? "Provider not found",
      };
    }

    for (const version of detail.data.versions) {
      const deleted = await deleteProviderVersionAction(
        namespace,
        type,
        version.version,
        version.revision,
      );
      if (!deleted.success) return deleted;
    }

    return { success: true };
  } catch (error) {
    console.error("[Admin Providers] deleteProviderAction error:", error);
    return {
      success: false,
      code: "UNKNOWN",
      error: "Failed to delete provider",
    };
  }
}

export async function replaceProviderArtifactAction(params: {
  namespace: string;
  type: string;
  version: string;
  os: string;
  arch: string;
  artifact: File;
  expectedRevision: number;
}): Promise<AdminActionResult<{ revision: number; etag: string }>> {
  const isAdmin = await requireAdmin();
  if (!isAdmin) return unauthorizedResult<{ revision: number; etag: string }>();

  try {
    const location = await uploadProviderZip(
      params.namespace,
      params.type,
      params.version,
      params.os,
      params.arch,
      params.artifact.stream(),
    );

    const replaced = await replaceProviderPlatform(
      params.namespace,
      params.type,
      params.version,
      params.expectedRevision,
      {
        os: params.os,
        arch: params.arch,
        filename: params.artifact.name,
        shasum: await sha256Hex(params.artifact),
        location,
      },
    );

    return {
      success: true,
      data: {
        revision: replaced.provider.revision,
        etag: makeEtag(replaced.provider.revision),
      },
    };
  } catch (error) {
    if (error instanceof RevisionConflictError) {
      return toConflictResult(error);
    }

    console.error(
      "[Admin Providers] replaceProviderArtifactAction error:",
      error,
    );
    return {
      success: false,
      code: "UNKNOWN",
      error: "Failed to replace provider artifact",
    };
  }
}

export async function renameProviderAction(
  namespace: string,
  type: string,
  values: Record<string, string>,
): Promise<AdminActionResult> {
  const isAdmin = await requireAdmin();
  if (!isAdmin) return unauthorizedResult();

  const nextNamespace = values.namespace?.trim();
  const nextType = values.type?.trim();

  if (!nextNamespace || !nextType) {
    return {
      success: false,
      code: "VALIDATION",
      error: "Namespace and type are required",
    };
  }

  const parsed = createProviderAliasBody.safeParse({
    source_namespace: namespace,
    source_type: type,
    target_namespace: nextNamespace,
    target_type: nextType,
  });
  if (!parsed.success) {
    return {
      success: false,
      code: "VALIDATION",
      error:
        parsed.error.issues[0]?.message ??
        "Invalid provider coordinates for rename",
    };
  }

  const constraints = await validateProviderAliasCreateConstraints({
    sourceNamespace: parsed.data.source_namespace,
    sourceType: parsed.data.source_type,
    targetNamespace: parsed.data.target_namespace,
    targetType: parsed.data.target_type,
  });
  if (!constraints.ok) {
    return {
      success: false,
      code:
        constraints.code === "TARGET_NOT_FOUND" ? "NOT_FOUND" : "VALIDATION",
      error: constraints.message,
    };
  }

  try {
    await createProviderAlias({
      sourceNamespace: parsed.data.source_namespace,
      sourceType: parsed.data.source_type,
      targetNamespace: parsed.data.target_namespace,
      targetType: parsed.data.target_type,
      createdBy: "admin-ui",
    });

    return { success: true };
  } catch (error) {
    console.error("[Admin Providers] renameProviderAction error:", error);
    return {
      success: false,
      code: "CONFLICT",
      error: "Unable to create alias for rename. Refresh and try again.",
    };
  }
}
