import { eq, and, desc, sql, count, inArray, SQL } from "drizzle-orm";
import { getDb } from "@/db/client";
import { modules } from "@/db/schema";
import type { Module } from "@/db/schema";
import { escapeLike } from "@/lib/utils/sql";

// ============================================================================
// Constants
// ============================================================================

/**
 * The canonical provider keyword for multi-system modules.
 * Modules published with this provider value can serve requests for any
 * system listed in their `tags` array.
 */
const NEUTRAL_PROVIDER_KEYWORD = "multi";

/**
 * Provider keywords that are checked during multi-system fallback.
 * Includes the canonical keyword ("multi") plus legacy values ("system",
 * "neutral") for backwards compatibility with modules published before
 * the keyword was standardised.
 */
const NEUTRAL_PROVIDER_KEYWORDS = [
  NEUTRAL_PROVIDER_KEYWORD,
  "system",
  "neutral",
];

// ============================================================================
// Helpers
// ============================================================================

/**
 * Safely parse a raw `tags` column value into a string array.
 *
 * The tags column is stored as JSON text but read as a plain string to avoid
 * ORM-level `JSON.parse` crashes on legacy rows with malformed values (e.g.
 * bare text like `aws` instead of `["aws"]`).
 *
 * Returns `null` when the value is null/undefined, empty, or not a valid
 * JSON array of strings — callers should fall back to `[provider]`.
 */
export function parseTags(raw: string | null | undefined): string[] | null {
  if (raw == null || raw === "") return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((t) => typeof t === "string")) {
      return parsed;
    }
    // Valid JSON but not a string array — treat as single tag if it's a string
    if (typeof parsed === "string") return [parsed];
    return null;
  } catch {
    // Invalid JSON (plain text like "aws") — wrap as single-element array
    return [raw];
  }
}

/**
 * Resolve the tags for a module row.
 * Returns the persisted tags array, falling back to `[provider]` when the
 * column is null or contains unparseable data.
 */
export function resolveModuleTags(mod: Module): string[] {
  return parseTags(mod.tags) ?? [mod.provider];
}

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
 * Check whether at least one version exists for a module tuple.
 */
export async function hasModule(
  namespace: string,
  name: string,
  provider: string,
): Promise<boolean> {
  const db = getDb();
  const result = await db
    .select({ id: modules.id })
    .from(modules)
    .where(
      and(
        eq(modules.namespace, namespace),
        eq(modules.name, name),
        eq(modules.provider, provider),
      ),
    )
    .limit(1);

  return result.length > 0;
}

/**
 * Resolve a module with multi-system fallback.
 *
 * Resolution order:
 *   1. Exact match on (namespace, name, system, version)
 *   2. Multi-system module (provider="multi") whose JSON tags array includes `system`
 *
 * This allows modules published under provider="multi" with tags=["aws","gcp"]
 * to be discovered when requesting system="aws".
 */
export async function resolveModule(
  namespace: string,
  name: string,
  system: string,
  version: string,
): Promise<Module | undefined> {
  // 1. Exact match
  const exact = await findModule(namespace, name, system, version);
  if (exact) return exact;

  // 2. Multi-system fallback — find provider in NEUTRAL_PROVIDER_KEYWORDS with system in tags JSON
  const db = getDb();
  const systemResults = await db
    .select()
    .from(modules)
    .where(
      and(
        eq(modules.namespace, namespace),
        eq(modules.name, name),
        inArray(modules.provider, NEUTRAL_PROVIDER_KEYWORDS),
        eq(modules.version, version),
      ),
    )
    .limit(10); // small limit — filter in JS for tag match

  for (const mod of systemResults) {
    if (parseTags(mod.tags)?.includes(system)) {
      return mod;
    }
  }

  return undefined;
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
 * Get all versions for a module (namespace/name/provider) as FULL rows.
 *
 * Unlike getModuleVersions (which returns only the version string per row),
 * this returns the complete Module record for each release so the UI can show
 * a details modal — owner, description, source, location, tags, definition,
 * downloads, timestamps, revision. Newest-first.
 */
export async function getModuleVersionsDetailed(
  namespace: string,
  name: string,
  provider: string,
): Promise<Module[]> {
  const db = getDb();
  return db
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
}

/**
 * Resolve module versions with multi-system fallback.
 *
 * Resolution order:
 *   1. Exact provider match versions
 *   2. If empty, multi-system modules whose tags include the requested system
 *
 * Returns deduplicated version strings, exact matches taking priority.
 */
export async function resolveModuleVersions(
  namespace: string,
  name: string,
  system: string,
): Promise<{ version: string }[]> {
  // 1. Exact match
  const exact = await getModuleVersions(namespace, name, system);
  if (exact.length > 0) return exact;

  // 2. Multi-system fallback
  const db = getDb();
  const multiRows = await db
    .select()
    .from(modules)
    .where(
      and(
        eq(modules.namespace, namespace),
        eq(modules.name, name),
        inArray(modules.provider, NEUTRAL_PROVIDER_KEYWORDS),
      ),
    )
    .orderBy(desc(modules.publishedAt));

  // Filter by tag match in JS (SQLite JSON functions are limited)
  return multiRows
    .filter((m) => parseTags(m.tags)?.includes(system))
    .map((m) => ({ version: m.version }));
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
 * Resolve the latest version of a module with multi-system fallback.
 */
export async function resolveModuleLatestVersion(
  namespace: string,
  name: string,
  system: string,
): Promise<Module | undefined> {
  // 1. Exact match
  const exact = await getModuleLatestVersion(namespace, name, system);
  if (exact) return exact;

  // 2. Multi-system fallback
  const db = getDb();
  const multiRows = await db
    .select()
    .from(modules)
    .where(
      and(
        eq(modules.namespace, namespace),
        eq(modules.name, name),
        inArray(modules.provider, NEUTRAL_PROVIDER_KEYWORDS),
      ),
    )
    .orderBy(desc(modules.publishedAt));

  // Return first multi-system module whose tags include the requested system
  for (const mod of multiRows) {
    if (parseTags(mod.tags)?.includes(system)) {
      return mod;
    }
  }

  return undefined;
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
 *
 * `tags` defaults to `[provider]` when not supplied, maintaining backward
 * compatibility with callers that don't know about the tags column.
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
  tags?: string[];
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
      tags: JSON.stringify(data.tags ?? [data.provider]),
    })
    .returning();
  // Insert always returns exactly one row on success; failure throws
  return module!;
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

  const conditions: SQL[] = [];
  if (params.namespace) {
    conditions.push(eq(modules.namespace, params.namespace));
  }
  if (params.provider) {
    conditions.push(eq(modules.provider, params.provider));
  }
  if (params.q) {
    const escaped = escapeLike(params.q);
    conditions.push(
      sql`${modules.name} LIKE ${"%" + escaped + "%"} ESCAPE '\\'`,
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, countResult] = await Promise.all([
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
    meta: { offset, limit, total: countResult[0]?.total ?? 0 },
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

  const conditions: SQL[] = [];
  if (params.namespace) {
    conditions.push(eq(modules.namespace, params.namespace));
  }
  if (params.provider) {
    conditions.push(eq(modules.provider, params.provider));
  }
  if (params.q) {
    const escaped = escapeLike(params.q);
    conditions.push(
      sql`${modules.name} LIKE ${"%" + escaped + "%"} ESCAPE '\\'`,
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  // Subquery: find the latest id per unique (namespace, name, provider)
  // Uses a correlated subquery to pick the row with the newest published_at,
  // breaking ties by id DESC so timestamp collisions never produce duplicates.
  // Outer columns are written as raw `modules.*`: drizzle renders interpolated
  // columns unqualified here, which SQLite would bind to m2 (self-compare).
  const latestSq = db
    .select({
      namespace: modules.namespace,
      name: modules.name,
      provider: modules.provider,
      latestId: sql<number>`(
        SELECT m2.id FROM modules m2
        WHERE m2.namespace = modules.namespace
          AND m2.name = modules.name
          AND m2.provider = modules.provider
        ORDER BY m2.published_at DESC, m2.id DESC
        LIMIT 1
      )`.as("latest_id"),
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
          eq(modules.id, latestSq.latestId),
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
