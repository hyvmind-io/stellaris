import { eq, and, count, like, desc } from "drizzle-orm";
import { getDb } from "@/db/client";
import { providers, providerPlatforms, gpgPublicKeys } from "@/db/schema";
import type { Provider, ProviderPlatform, GpgPublicKey } from "@/db/schema";

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
 * Get all versions for a specific provider (namespace/type) with their platforms.
 * Returns the format Terraform CLI expects:
 * [{version, protocols, platforms: [{os, arch}]}]
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

  // Get all versions for this provider
  const providerRows = await db
    .select()
    .from(providers)
    .where(and(eq(providers.namespace, namespace), eq(providers.type, type)));

  if (providerRows.length === 0) return [];

  // For each version, get platforms
  const result = await Promise.all(
    providerRows.map(async (prov) => {
      const platforms = await db
        .select({ os: providerPlatforms.os, arch: providerPlatforms.arch })
        .from(providerPlatforms)
        .where(eq(providerPlatforms.providerId, prov.id));

      return {
        version: prov.version,
        protocols: prov.protocols,
        platforms,
      };
    }),
  );

  return result;
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

  // Find the specific platform
  const platformResult = await db
    .select()
    .from(providerPlatforms)
    .where(
      and(
        eq(providerPlatforms.providerId, provider.id),
        eq(providerPlatforms.os, os),
        eq(providerPlatforms.arch, arch),
      ),
    )
    .limit(1);

  const platform = platformResult[0];
  if (!platform) return null;

  // Get GPG public keys
  const gpgKeys = await db
    .select()
    .from(gpgPublicKeys)
    .where(eq(gpgPublicKeys.providerId, provider.id));

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

  const conditions = [];
  if (params.namespace) {
    conditions.push(eq(providers.namespace, params.namespace));
  }
  if (params.type) {
    conditions.push(eq(providers.type, params.type));
  }
  if (params.q) {
    conditions.push(like(providers.type, `%${params.q}%`));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [totalResult]] = await Promise.all([
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
    meta: { offset, limit, total: totalResult.total },
  };
}

/**
 * Browse providers — returns one entry per unique provider (namespace/type),
 * showing the latest version with platform count. For the browse UI.
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

  const conditions = [];
  if (params.namespace) {
    conditions.push(eq(providers.namespace, params.namespace));
  }
  if (params.q) {
    conditions.push(like(providers.type, `%${params.q}%`));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  // Get all matching providers, then deduplicate in JS
  const allRows = await db
    .select()
    .from(providers)
    .where(where)
    .orderBy(desc(providers.publishedAt));

  // Deduplicate: keep only the first (latest) version per namespace/type
  const seen = new Set<string>();
  const unique: Provider[] = [];
  for (const row of allRows) {
    const key = `${row.namespace}/${row.type}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(row);
    }
  }

  const total = unique.length;
  const paged = unique.slice(offset, offset + limit);

  // Fetch platform counts for each paged provider
  const withPlatformCounts = await Promise.all(
    paged.map(async (prov) => {
      const platforms = await db
        .select({ count: count() })
        .from(providerPlatforms)
        .where(eq(providerPlatforms.providerId, prov.id));
      return {
        ...prov,
        platformCount: platforms[0]?.count ?? 0,
      };
    }),
  );

  return {
    providers: withPlatformCounts,
    meta: { offset, limit, total },
  };
}
