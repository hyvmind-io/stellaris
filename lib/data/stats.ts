import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { modules, providers } from "@/db/schema";

/**
 * Get registry-wide statistics for the dashboard.
 */
export async function getRegistryStats(): Promise<{
  totalModules: number;
  totalProviders: number;
  totalDownloads: number;
}> {
  const empty = { totalModules: 0, totalProviders: 0, totalDownloads: 0 };

  try {
    const db = getDb();

    const [moduleCount, providerCount, downloadSum] = await Promise.all([
      db
        .select({
          count: sql<number>`count(distinct ${modules.namespace} || '/' || ${modules.name} || '/' || ${modules.provider})`,
        })
        .from(modules),
      db
        .select({
          count: sql<number>`count(distinct ${providers.namespace} || '/' || ${providers.type})`,
        })
        .from(providers),
      db
        .select({
          total: sql<number>`coalesce(sum(${modules.downloads}), 0)`,
        })
        .from(modules),
    ]);

    return {
      totalModules: moduleCount[0]?.count ?? 0,
      totalProviders: providerCount[0]?.count ?? 0,
      totalDownloads: downloadSum[0]?.total ?? 0,
    };
  } catch (error) {
    console.warn(
      "getRegistryStats: database query failed (tables may not exist yet):",
      error,
    );
    return empty;
  }
}
