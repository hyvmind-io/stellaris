import { getCloudflareContext } from "@opennextjs/cloudflare";

/** Workers Rate Limiting binding (subset of the runtime type). */
interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export type RateLimitBucket = "API_RATE_LIMITER" | "AUTH_RATE_LIMITER";

/** Cloudflare-set client IP; never trusts client-supplied X-Forwarded-For. */
export function clientIp(headers: Headers): string {
  return headers.get("CF-Connecting-IP") ?? "unknown";
}

function binding(bucket: RateLimitBucket): RateLimitBinding | undefined {
  try {
    const env = getCloudflareContext().env as unknown as Record<string, unknown>;
    return env[bucket] as RateLimitBinding | undefined;
  } catch {
    // Outside the Workers runtime (next dev, tests): no binding, no limit.
    return undefined;
  }
}

/** True when the request may proceed. Allows when the binding is absent. */
export async function allowRequest(bucket: RateLimitBucket, key: string): Promise<boolean> {
  const limiter = binding(bucket);
  if (!limiter) return true;
  const { success } = await limiter.limit({ key });
  return success;
}
