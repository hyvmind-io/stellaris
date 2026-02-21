import { eq, and, count, desc, inArray, sql, SQL } from "drizzle-orm";
import { getDb } from "@/db/client";
import { providers, providerPlatforms, gpgPublicKeys } from "@/db/schema";
import type { Provider, ProviderPlatform, GpgPublicKey } from "@/db/schema";
import { escapeLike } from "@/lib/utils/sql";
import { RevisionConflictError } from "@/lib/data/concurrency";

/**
 * Find a specific provider by namespace, type, and version.
 */
export async function findProvider(
  namespace: string,
  type: string,
  version: string,
): Promise<Provider | undefined> {
  const db = getDb();
  const result = await db
    .select()
    .from(providers)
    .where(
      and(
        eq(providers.namespace, namespace),
        eq(providers.type, type),
        eq(providers.version, version),
      ),
    )
    .limit(1);
  return result[0];
}

/**
 * Find any provider version by namespace/type.
 * Useful for checking canonical provider existence (aliases/admin flows).
 */
export async function findAnyProvider(
  namespace: string,
  type: string,
): Promise<Provider | undefined> {
  const db = getDb();
  const result = await db
    .select()
    .from(providers)
    .where(and(eq(providers.namespace, namespace), eq(providers.type, type)))
    .limit(1);
  return result[0];
}

/**
 * Get all versions for a specific provider (namespace/type) with their platforms.
 * Optimized: uses a single LEFT JOIN query instead of N+1 queries.
 * Versions returned in descending order (newest first) per semver convention.
 */
export async function getProviderVersions(
  namespace: string,
  type: string,
): Promise<
  {
    version: string;
    protocols: string[];
    platforms: { os: string; arch: string }[];
  }[]
> {
  const db = getDb();

  const rows = await db
    .select({
      id: providers.id,
      version: providers.version,
      protocols: providers.protocols,
      publishedAt: providers.publishedAt,
      os: providerPlatforms.os,
      arch: providerPlatforms.arch,
    })
    .from(providers)
    .leftJoin(providerPlatforms, eq(providerPlatforms.providerId, providers.id))
    .where(and(eq(providers.namespace, namespace), eq(providers.type, type)))
    .orderBy(desc(providers.publishedAt));

  if (rows.length === 0) return [];

  // Group rows by provider version
  const versionMap = new Map<
    number,
    {
      version: string;
      protocols: string[];
      platforms: { os: string; arch: string }[];
    }
  >();

  for (const row of rows) {
    if (!versionMap.has(row.id)) {
      versionMap.set(row.id, {
        version: row.version,
        protocols: row.protocols,
        platforms: [],
      });
    }
    if (row.os && row.arch) {
      versionMap.get(row.id)!.platforms.push({ os: row.os, arch: row.arch });
    }
  }

  return Array.from(versionMap.values());
}

/**
 * Find a complete provider package for a specific version + platform.
 * Returns everything Terraform CLI needs for the download response:
 * - Provider metadata (protocols)
 * - Platform details (filename, shasum, location, urls)
 * - GPG public keys for signature verification
 */
export async function findProviderPackage(
  namespace: string,
  type: string,
  version: string,
  os: string,
  arch: string,
): Promise<{
  provider: Provider;
  platform: ProviderPlatform;
  gpgKeys: GpgPublicKey[];
} | null> {
  const db = getDb();

  // Find the provider
  const providerResult = await db
    .select()
    .from(providers)
    .where(
      and(
        eq(providers.namespace, namespace),
        eq(providers.type, type),
        eq(providers.version, version),
      ),
    )
    .limit(1);

  const provider = providerResult[0];
  if (!provider) return null;

  // Fetch platform and GPG keys in parallel — both depend only on provider.id
  const [platformResult, gpgKeys] = await Promise.all([
    db
      .select()
      .from(providerPlatforms)
      .where(
        and(
          eq(providerPlatforms.providerId, provider.id),
          eq(providerPlatforms.os, os),
          eq(providerPlatforms.arch, arch),
        ),
      )
      .limit(1),
    db
      .select()
      .from(gpgPublicKeys)
      .where(eq(gpgPublicKeys.providerId, provider.id)),
  ]);

  const platform = platformResult[0];
  if (!platform) return null;

  return { provider, platform, gpgKeys };
}

/**
 * Get all platforms for a specific provider version.
 */
export async function getProviderPlatforms(
  providerId: number,
): Promise<ProviderPlatform[]> {
  const db = getDb();
  return db
    .select()
    .from(providerPlatforms)
    .where(eq(providerPlatforms.providerId, providerId));
}

/**
 * Get all GPG public keys for a specific provider version.
 */
export async function getProviderGpgKeys(
  providerId: number,
): Promise<GpgPublicKey[]> {
  const db = getDb();
  return db
    .select()
    .from(gpgPublicKeys)
    .where(eq(gpgPublicKeys.providerId, providerId));
}

/**
 * Insert a new provider with platforms and GPG keys in a single transaction.
 * Returns the created provider record.
 */
export async function saveProvider(params: {
  namespace: string;
  type: string;
  version: string;
  protocols: string[];
  platforms: {
    os: string;
    arch: string;
    filename: string;
    shasum: string;
    location?: string;
    shasumUrl?: string;
    shasumSignatureUrl?: string;
  }[];
  gpgPublicKeys: {
    keyId: string;
    asciiArmor: string;
    source?: string;
    sourceUrl?: string;
  }[];
}): Promise<Provider> {
  const db = getDb();

  return db.transaction(async (tx) => {
    // 1. Insert provider
    const [provider] = await tx
      .insert(providers)
      .values({
        namespace: params.namespace,
        type: params.type,
        version: params.version,
        protocols: params.protocols,
      })
      .returning();

    // Insert always returns exactly one row on success; failure throws
    if (!provider) throw new Error("Provider insert returned no rows");

    // 2. Insert platforms
    if (params.platforms.length > 0) {
      await tx.insert(providerPlatforms).values(
        params.platforms.map((p) => ({
          providerId: provider.id,
          os: p.os,
          arch: p.arch,
          filename: p.filename,
          shasum: p.shasum,
          location: p.location,
          shasumUrl: p.shasumUrl,
          shasumSignatureUrl: p.shasumSignatureUrl,
        })),
      );
    }

    // 3. Insert GPG public keys
    if (params.gpgPublicKeys.length > 0) {
      await tx.insert(gpgPublicKeys).values(
        params.gpgPublicKeys.map((k) => ({
          providerId: provider.id,
          keyId: k.keyId,
          asciiArmor: k.asciiArmor,
          source: k.source ?? "",
          sourceUrl: k.sourceUrl,
        })),
      );
    }

    return provider;
  });
}

/**
 * Replace (upsert) a provider platform artifact and bump provider revision.
 *
 * Concurrency contract: provider row must match expectedRevision.
 */
export async function replaceProviderPlatform(
  namespace: string,
  type: string,
  version: string,
  expectedRevision: number,
  platform: {
    os: string;
    arch: string;
    filename: string;
    shasum: string;
    location?: string;
    shasumUrl?: string;
    shasumSignatureUrl?: string;
  },
): Promise<{ provider: Provider; platform: ProviderPlatform }> {
  const db = getDb();

  return db.transaction(async (tx) => {
    const updatedProviderRows = await tx
      .update(providers)
      .set({
        updatedAt: new Date(),
        revision: sql`${providers.revision} + 1`,
      })
      .where(
        and(
          eq(providers.namespace, namespace),
          eq(providers.type, type),
          eq(providers.version, version),
          eq(providers.revision, expectedRevision),
        ),
      )
      .returning();

    if (updatedProviderRows.length === 0) {
      const current = await tx
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
      throw new RevisionConflictError(
        expectedRevision,
        current[0]?.revision ?? null,
      );
    }

    const provider = updatedProviderRows[0]!;

    const existingRows = await tx
      .select()
      .from(providerPlatforms)
      .where(
        and(
          eq(providerPlatforms.providerId, provider.id),
          eq(providerPlatforms.os, platform.os),
          eq(providerPlatforms.arch, platform.arch),
        ),
      )
      .limit(1);

    if (existingRows.length > 0) {
      const updatedRows = await tx
        .update(providerPlatforms)
        .set({
          filename: platform.filename,
          shasum: platform.shasum,
          location: platform.location,
          shasumUrl: platform.shasumUrl,
          shasumSignatureUrl: platform.shasumSignatureUrl,
        })
        .where(eq(providerPlatforms.id, existingRows[0]!.id))
        .returning();

      return { provider, platform: updatedRows[0]! };
    }

    const insertedRows = await tx
      .insert(providerPlatforms)
      .values({
        providerId: provider.id,
        os: platform.os,
        arch: platform.arch,
        filename: platform.filename,
        shasum: platform.shasum,
        location: platform.location,
        shasumUrl: platform.shasumUrl,
        shasumSignatureUrl: platform.shasumSignatureUrl,
      })
      .returning();

    return { provider, platform: insertedRows[0]! };
  });
}

/**
 * Delete a provider and all associated platforms + GPG keys.
 * Cascade delete is handled by the FK constraint in the schema.
 * Returns the deleted provider and its platforms (for R2 cleanup), or undefined if not found.
 */
export async function deleteProvider(
  namespace: string,
  type: string,
  version: string,
): Promise<{ provider: Provider; platforms: ProviderPlatform[] } | undefined> {
  const db = getDb();

  // Find the provider first (to get platforms for R2 cleanup)
  const provider = await findProvider(namespace, type, version);
  if (!provider) return undefined;

  const platforms = await getProviderPlatforms(provider.id);

  // Delete provider (cascade deletes platforms + GPG keys)
  await db
    .delete(providers)
    .where(
      and(
        eq(providers.namespace, namespace),
        eq(providers.type, type),
        eq(providers.version, version),
      ),
    );

  return { provider, platforms };
}

/**
 * Delete a provider version only if revision matches expectedRevision.
 * Returns deleted provider + platforms for artifact cleanup.
 * Throws RevisionConflictError on revision mismatch.
 */
export async function conditionalDeleteProvider(
  namespace: string,
  type: string,
  version: string,
  expectedRevision: number,
): Promise<{ provider: Provider; platforms: ProviderPlatform[] } | undefined> {
  const db = getDb();

  const provider = await findProvider(namespace, type, version);
  if (!provider) return undefined;

  if (provider.revision !== expectedRevision) {
    throw new RevisionConflictError(expectedRevision, provider.revision);
  }

  const platforms = await getProviderPlatforms(provider.id);

  const deletedRows = await db
    .delete(providers)
    .where(
      and(
        eq(providers.id, provider.id),
        eq(providers.revision, expectedRevision),
      ),
    )
    .returning();

  if (deletedRows.length === 0) {
    const latest = await findProvider(namespace, type, version);
    throw new RevisionConflictError(expectedRevision, latest?.revision ?? null);
  }

  return { provider, platforms };
}

/**
 * List/search providers with pagination.
 * Supports filtering by namespace, type, and text search on type.
 */
export async function findAllProviders(params: {
  namespace?: string;
  type?: string;
  q?: string;
  offset?: number;
  limit?: number;
}): Promise<{
  providers: Provider[];
  meta: { offset: number; limit: number; total: number };
}> {
  const db = getDb();
  const offset = params.offset ?? 0;
  const limit = params.limit ?? 15;

  const conditions: SQL[] = [];
  if (params.namespace) {
    conditions.push(eq(providers.namespace, params.namespace));
  }
  if (params.type) {
    conditions.push(eq(providers.type, params.type));
  }
  if (params.q) {
    const escaped = escapeLike(params.q);
    conditions.push(
      sql`${providers.type} LIKE ${"%" + escaped + "%"} ESCAPE '\\'`,
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, countResult] = await Promise.all([
    db
      .select()
      .from(providers)
      .where(where)
      .orderBy(desc(providers.publishedAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(providers).where(where),
  ]);

  return {
    providers: rows,
    meta: { offset, limit, total: countResult[0]?.total ?? 0 },
  };
}

/**
 * Browse providers — returns one entry per unique provider (namespace/type),
 * showing the latest version with platform count.
 * Optimized with SQL GROUP BY and batch platform counts.
 */
export async function browseProviders(params: {
  namespace?: string;
  q?: string;
  offset?: number;
  limit?: number;
}): Promise<{
  providers: (Provider & { platformCount: number })[];
  meta: { offset: number; limit: number; total: number };
}> {
  const db = getDb();
  const offset = params.offset ?? 0;
  const limit = params.limit ?? 15;

  const conditions: SQL[] = [];
  if (params.namespace) {
    conditions.push(eq(providers.namespace, params.namespace));
  }
  if (params.q) {
    const escaped = escapeLike(params.q);
    conditions.push(
      sql`${providers.type} LIKE ${"%" + escaped + "%"} ESCAPE '\\'`,
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  // Subquery: find the latest id per unique (namespace, type)
  // Uses a correlated subquery to pick the row with the newest published_at,
  // breaking ties by id DESC so timestamp collisions never produce duplicates.
  const latestSq = db
    .select({
      namespace: providers.namespace,
      type: providers.type,
      latestId: sql<number>`(
        SELECT p2.id FROM providers p2
        WHERE p2.namespace = ${providers.namespace}
          AND p2.type = ${providers.type}
        ORDER BY p2.published_at DESC, p2.id DESC
        LIMIT 1
      )`.as("latest_id"),
    })
    .from(providers)
    .where(where)
    .groupBy(providers.namespace, providers.type)
    .as("latest_providers");

  const [pagedRows, totalResult] = await Promise.all([
    db
      .select({ provider: providers })
      .from(providers)
      .innerJoin(
        latestSq,
        and(
          eq(providers.namespace, latestSq.namespace),
          eq(providers.type, latestSq.type),
          eq(providers.id, latestSq.latestId),
        ),
      )
      .orderBy(desc(providers.publishedAt))
      .limit(limit)
      .offset(offset),
    db
      .select({
        total: sql<number>`COUNT(DISTINCT ${providers.namespace} || '/' || ${providers.type})`,
      })
      .from(providers)
      .where(where),
  ]);

  const pagedProviders = pagedRows.map((r) => r.provider);

  // Batch platform counts
  let platformCounts = new Map<number, number>();
  if (pagedProviders.length > 0) {
    const providerIds = pagedProviders.map((p) => p.id);
    const countRows = await db
      .select({
        providerId: providerPlatforms.providerId,
        platformCount: count(),
      })
      .from(providerPlatforms)
      .where(inArray(providerPlatforms.providerId, providerIds))
      .groupBy(providerPlatforms.providerId);

    platformCounts = new Map(
      countRows.map((r) => [r.providerId, r.platformCount]),
    );
  }

  return {
    providers: pagedProviders.map((p) => ({
      ...p,
      platformCount: platformCounts.get(p.id) ?? 0,
    })),
    meta: { offset, limit, total: totalResult[0]?.total ?? 0 },
  };
}
