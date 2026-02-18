import { eq, and, desc, sql, count, like } from "drizzle-orm";
import { getDb } from "@/db/client";
import { modules } from "@/db/schema";
import type { Module, NewModule } from "@/db/schema";

/**
 * Find a specific module by namespace, name, provider, and version.
 */
export async function findModule(
  namespace: string,
  name: string,
  provider: string,
  version: string,
): Promise<Module | undefined> {
  const db = getDb();
  const result = await db
    .select()
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
  return result[0];
}

/**
 * Get all versions for a specific module (namespace/name/provider).
 * Returns array of version strings sorted descending (newest first).
 */
export async function getModuleVersions(
  namespace: string,
  name: string,
  provider: string,
): Promise<{ version: string }[]> {
  const db = getDb();
  const result = await db
    .select({ version: modules.version })
    .from(modules)
    .where(
      and(
        eq(modules.namespace, namespace),
        eq(modules.name, name),
        eq(modules.provider, provider),
      ),
    )
    .orderBy(desc(modules.publishedAt));
  return result;
}

/**
 * Get the latest version of a module.
 */
export async function getModuleLatestVersion(
  namespace: string,
  name: string,
  provider: string,
): Promise<Module | undefined> {
  const db = getDb();
  const result = await db
    .select()
    .from(modules)
    .where(
      and(
        eq(modules.namespace, namespace),
        eq(modules.name, name),
        eq(modules.provider, provider),
      ),
    )
    .orderBy(desc(modules.publishedAt))
    .limit(1);
  return result[0];
}

/**
 * Increment the download counter for a module.
 */
export async function incrementModuleDownloads(
  namespace: string,
  name: string,
  provider: string,
  version: string,
): Promise<void> {
  const db = getDb();
  await db
    .update(modules)
    .set({ downloads: sql`${modules.downloads} + 1` })
    .where(
      and(
        eq(modules.namespace, namespace),
        eq(modules.name, name),
        eq(modules.provider, provider),
        eq(modules.version, version),
      ),
    );
}

/**
 * Insert a new module record.
 * The caller must check for duplicates before calling this.
 */
export async function saveModule(data: {
  namespace: string;
  name: string;
  provider: string;
  version: string;
  owner?: string;
  description?: string;
  source?: string;
  location: string;
}): Promise<Module> {
  const db = getDb();
  const [module] = await db
    .insert(modules)
    .values({
      namespace: data.namespace,
      name: data.name,
      provider: data.provider,
      version: data.version,
      owner: data.owner ?? "",
      description: data.description,
      source: data.source,
      location: data.location,
    })
    .returning();
  return module;
}

/**
 * Delete a specific module version.
 * Returns the deleted module (for R2 cleanup), or undefined if not found.
 */
export async function deleteModule(
  namespace: string,
  name: string,
  provider: string,
  version: string,
): Promise<Module | undefined> {
  const db = getDb();
  const [deleted] = await db
    .delete(modules)
    .where(
      and(
        eq(modules.namespace, namespace),
        eq(modules.name, name),
        eq(modules.provider, provider),
        eq(modules.version, version),
      ),
    )
    .returning();
  return deleted;
}

/**
 * List/search modules with pagination.
 * Supports filtering by namespace, provider, and text search on name.
 */
export async function findAllModules(params: {
  namespace?: string;
  provider?: string;
  q?: string;
  offset?: number;
  limit?: number;
}): Promise<{
  modules: Module[];
  meta: { offset: number; limit: number; total: number };
}> {
  const db = getDb();
  const offset = params.offset ?? 0;
  const limit = params.limit ?? 15;

  const conditions = [];
  if (params.namespace) {
    conditions.push(eq(modules.namespace, params.namespace));
  }
  if (params.provider) {
    conditions.push(eq(modules.provider, params.provider));
  }
  if (params.q) {
    conditions.push(like(modules.name, `%${params.q}%`));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [totalResult]] = await Promise.all([
    db
      .select()
      .from(modules)
      .where(where)
      .orderBy(desc(modules.publishedAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(modules).where(where),
  ]);

  return {
    modules: rows,
    meta: { offset, limit, total: totalResult.total },
  };
}

/**
 * Browse modules — returns one entry per unique module (namespace/name/provider),
 * showing the latest version. For the browse UI, not for the API.
 */
export async function browseModules(params: {
  namespace?: string;
  provider?: string;
  q?: string;
  offset?: number;
  limit?: number;
}): Promise<{
  modules: Module[];
  meta: { offset: number; limit: number; total: number };
}> {
  const db = getDb();
  const offset = params.offset ?? 0;
  const limit = params.limit ?? 15;

  // Use a subquery to find the latest version of each unique module
  // GROUP BY namespace, name, provider → take the row with MAX(published_at)
  const conditions = [];
  if (params.namespace) {
    conditions.push(eq(modules.namespace, params.namespace));
  }
  if (params.provider) {
    conditions.push(eq(modules.provider, params.provider));
  }
  if (params.q) {
    conditions.push(like(modules.name, `%${params.q}%`));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  // Get all matching modules, then deduplicate in JS
  // (D1/SQLite doesn't support window functions well, so we do grouping manually)
  const allRows = await db
    .select()
    .from(modules)
    .where(where)
    .orderBy(desc(modules.publishedAt));

  // Deduplicate: keep only the first (latest) version per namespace/name/provider
  const seen = new Set<string>();
  const unique: Module[] = [];
  for (const row of allRows) {
    const key = `${row.namespace}/${row.name}/${row.provider}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(row);
    }
  }

  const total = unique.length;
  const paged = unique.slice(offset, offset + limit);

  return {
    modules: paged,
    meta: { offset, limit, total },
  };
}
