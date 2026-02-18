import { eq, and, desc, sql, count } from "drizzle-orm";
import { getDb } from "@/db/client";
import { modules } from "@/db/schema";
import type { Module } from "@/db/schema";
import { escapeLike } from "@/lib/utils/sql";

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
    const escaped = escapeLike(params.q);
    conditions.push(
      sql`${modules.name} LIKE ${"%" + escaped + "%"} ESCAPE '\\'` as ReturnType<
        typeof eq
      >,
    );
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
 * showing the latest version. Optimized with SQL GROUP BY — no full table scan.
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

  const conditions: ReturnType<typeof eq>[] = [];
  if (params.namespace) {
    conditions.push(eq(modules.namespace, params.namespace));
  }
  if (params.provider) {
    conditions.push(eq(modules.provider, params.provider));
  }
  if (params.q) {
    const escaped = escapeLike(params.q);
    conditions.push(
      sql`${modules.name} LIKE ${"%" + escaped + "%"} ESCAPE '\\'` as ReturnType<
        typeof eq
      >,
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  // Subquery: find the max published_at per unique (namespace, name, provider)
  const latestSq = db
    .select({
      namespace: modules.namespace,
      name: modules.name,
      provider: modules.provider,
      maxPub: sql<number>`MAX(${modules.publishedAt})`.as("max_pub"),
    })
    .from(modules)
    .where(where)
    .groupBy(modules.namespace, modules.name, modules.provider)
    .as("latest");

  const [rows, totalResult] = await Promise.all([
    db
      .select({ module: modules })
      .from(modules)
      .innerJoin(
        latestSq,
        and(
          eq(modules.namespace, latestSq.namespace),
          eq(modules.name, latestSq.name),
          eq(modules.provider, latestSq.provider),
          sql`${modules.publishedAt} = ${latestSq.maxPub}`,
        ),
      )
      .orderBy(desc(modules.publishedAt))
      .limit(limit)
      .offset(offset),
    db
      .select({
        total: sql<number>`COUNT(DISTINCT ${modules.namespace} || '/' || ${modules.name} || '/' || ${modules.provider})`,
      })
      .from(modules)
      .where(where),
  ]);

  return {
    modules: rows.map((r) => r.module),
    meta: { offset, limit, total: totalResult[0]?.total ?? 0 },
  };
}
