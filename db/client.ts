import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/d1";
import { cache } from "react";
import * as schema from "./schema";

/**
 * Get a Drizzle D1 client for the current request.
 * Uses React's cache() to deduplicate within the same request.
 *
 * Use this in Server Components, Route Handlers, and Server Actions.
 */
export const getDb = cache(() => {
  const { env } = getCloudflareContext();
  return drizzle(env.DB, { schema });
});

/**
 * Async variant for static routes (ISR/SSG).
 */
export const getDbAsync = cache(async () => {
  const { env } = await getCloudflareContext({ async: true });
  return drizzle(env.DB, { schema });
});

export type DbClient = ReturnType<typeof getDb>;
