import { eq, and, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { modules, providers } from "@/db/schema";
import type { Module, Provider } from "@/db/schema";

// ============================================================================
// Error
// ============================================================================

/**
 * Thrown when an optimistic-concurrency update fails because the resource's
 * revision no longer matches the expected value.
 *
 * Route handlers should catch this and return `preconditionFailed()`.
 */
export class RevisionConflictError extends Error {
  readonly expectedRevision: number;
  readonly currentRevision: number | null;

  constructor(expectedRevision: number, currentRevision: number | null) {
    super(
      `Revision conflict: expected revision ${expectedRevision} but current revision is ${currentRevision ?? "unknown"}`,
    );
    this.name = "RevisionConflictError";
    this.expectedRevision = expectedRevision;
    this.currentRevision = currentRevision;
  }
}

async function getCurrentModuleRevision(
  namespace: string,
  name: string,
  provider: string,
  version: string,
): Promise<number | null> {
  const db = getDb();
  const rows = await db
    .select({ revision: modules.revision })
    .from(modules)
    .where(
      and(
        eq(modules.namespace, namespace),
        eq(modules.name, name),
        eq(modules.provider, provider),
        eq(modules.version, version),
      ),
    )
    .limit(1);

  return rows[0]?.revision ?? null;
}

async function getCurrentProviderRevision(
  namespace: string,
  type: string,
  version: string,
): Promise<number | null> {
  const db = getDb();
  const rows = await db
    .select({ revision: providers.revision })
    .from(providers)
    .where(
      and(
        eq(providers.namespace, namespace),
        eq(providers.type, type),
        eq(providers.version, version),
      ),
    )
    .limit(1);

  return rows[0]?.revision ?? null;
}

// ============================================================================
// Module conditional update
// ============================================================================

/** Fields that can be updated on a module via admin CRUD. */
export interface ModuleUpdateFields {
  description?: string | null;
  source?: string | null;
  owner?: string;
  tags?: string[];
}

/**
 * Atomically update a module only if its revision matches `expectedRevision`.
 *
 * On success, increments revision by 1 and updates `updatedAt`.
 * On revision mismatch (0 rows affected), throws `RevisionConflictError`.
 *
 * @returns The updated Module row.
 */
export async function conditionalModuleUpdate(
  namespace: string,
  name: string,
  provider: string,
  version: string,
  expectedRevision: number,
  data: ModuleUpdateFields,
): Promise<Module> {
  const db = getDb();

  // Build the SET clause — only include fields that were provided
  const setClause: Record<string, unknown> = {
    updatedAt: new Date(),
    revision: sql`${modules.revision} + 1`,
  };

  if (data.description !== undefined) {
    setClause.description = data.description;
  }
  if (data.source !== undefined) {
    setClause.source = data.source;
  }
  if (data.owner !== undefined) {
    setClause.owner = data.owner;
  }
  if (data.tags !== undefined) {
    setClause.tags = JSON.stringify(data.tags);
  }

  const result = await db
    .update(modules)
    .set(setClause)
    .where(
      and(
        eq(modules.namespace, namespace),
        eq(modules.name, name),
        eq(modules.provider, provider),
        eq(modules.version, version),
        eq(modules.revision, expectedRevision),
      ),
    )
    .returning();

  if (result.length === 0) {
    const currentRevision = await getCurrentModuleRevision(
      namespace,
      name,
      provider,
      version,
    );
    throw new RevisionConflictError(expectedRevision, currentRevision);
  }

  return result[0]!;
}

/** Fields updatable when replacing a module version's bytes via admin REST. */
export interface ModuleReplaceBytesFields {
  location: string;
  description?: string | null;
  source?: string | null;
  owner?: string;
  tags?: string[];
}

/**
 * Atomically replace a module version's stored bytes (R2 `location`) plus any
 * provided metadata, only if its revision matches `expectedRevision`.
 *
 * On success, increments revision by 1 and updates `updatedAt`.
 * On revision mismatch (0 rows affected), throws `RevisionConflictError`.
 *
 * Unlike `conditionalModuleUpdate`, this always updates `location` (the new
 * tarball R2 key) — it is the byte-overwrite path, not a metadata-only edit.
 *
 * @returns The updated Module row.
 */
export async function conditionalModuleReplaceBytes(
  namespace: string,
  name: string,
  provider: string,
  version: string,
  expectedRevision: number,
  data: ModuleReplaceBytesFields,
): Promise<Module> {
  const db = getDb();

  const setClause: Record<string, unknown> = {
    updatedAt: new Date(),
    revision: sql`${modules.revision} + 1`,
    location: data.location,
  };

  if (data.description !== undefined) {
    setClause.description = data.description;
  }
  if (data.source !== undefined) {
    setClause.source = data.source;
  }
  if (data.owner !== undefined) {
    setClause.owner = data.owner;
  }
  if (data.tags !== undefined) {
    setClause.tags = JSON.stringify(data.tags);
  }

  const result = await db
    .update(modules)
    .set(setClause)
    .where(
      and(
        eq(modules.namespace, namespace),
        eq(modules.name, name),
        eq(modules.provider, provider),
        eq(modules.version, version),
        eq(modules.revision, expectedRevision),
      ),
    )
    .returning();

  if (result.length === 0) {
    const currentRevision = await getCurrentModuleRevision(
      namespace,
      name,
      provider,
      version,
    );
    throw new RevisionConflictError(expectedRevision, currentRevision);
  }

  return result[0]!;
}

/**
 * Atomically delete a module only if its revision matches `expectedRevision`.
 *
 * On revision mismatch (0 rows affected), throws `RevisionConflictError`.
 *
 * @returns The deleted Module row.
 */
export async function conditionalModuleDelete(
  namespace: string,
  name: string,
  provider: string,
  version: string,
  expectedRevision: number,
): Promise<Module> {
  const db = getDb();

  const result = await db
    .delete(modules)
    .where(
      and(
        eq(modules.namespace, namespace),
        eq(modules.name, name),
        eq(modules.provider, provider),
        eq(modules.version, version),
        eq(modules.revision, expectedRevision),
      ),
    )
    .returning();

  if (result.length === 0) {
    const currentRevision = await getCurrentModuleRevision(
      namespace,
      name,
      provider,
      version,
    );
    throw new RevisionConflictError(expectedRevision, currentRevision);
  }

  return result[0]!;
}

// ============================================================================
// Provider conditional update
// ============================================================================

/** Fields that can be updated on a provider via admin CRUD. */
export interface ProviderUpdateFields {
  protocols?: string[];
}

/**
 * Atomically update a provider only if its revision matches `expectedRevision`.
 *
 * On success, increments revision by 1 and updates `updatedAt`.
 * On revision mismatch (0 rows affected), throws `RevisionConflictError`.
 *
 * @returns The updated Provider row.
 */
export async function conditionalProviderUpdate(
  namespace: string,
  type: string,
  version: string,
  expectedRevision: number,
  data: ProviderUpdateFields,
): Promise<Provider> {
  const db = getDb();

  const setClause: Record<string, unknown> = {
    updatedAt: new Date(),
    revision: sql`${providers.revision} + 1`,
  };

  if (data.protocols !== undefined) {
    setClause.protocols = data.protocols;
  }

  const result = await db
    .update(providers)
    .set(setClause)
    .where(
      and(
        eq(providers.namespace, namespace),
        eq(providers.type, type),
        eq(providers.version, version),
        eq(providers.revision, expectedRevision),
      ),
    )
    .returning();

  if (result.length === 0) {
    const currentRevision = await getCurrentProviderRevision(
      namespace,
      type,
      version,
    );
    throw new RevisionConflictError(expectedRevision, currentRevision);
  }

  return result[0]!;
}
