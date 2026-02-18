import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/d1";
import { cache } from "react";
import * as schema from "./schema";

/**
 * Get a Drizzle D1 client for the current request.
 * Uses React's cache() to deduplicate within the same request.
 *
 * Use this in Server Components, Route Handlers, and Server Actions.
 *
 * NOTE: getDbAsync was removed — Cloudflare D1 is always available synchronously
 * via getCloudflareContext() in route handlers and server components.
 */
export const getDb = cache(() => {
  const { env } = getCloudflareContext();
  return drizzle(env.DB, { schema });
});

export type DbClient = ReturnType<typeof getDb>;
