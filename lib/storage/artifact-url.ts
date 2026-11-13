import { parseEnv } from "@/lib/env";

const PRESIGN_TTL_SECONDS = 600;

let warnedMisconfigured = false;

export function isWorkersFreeTier(): boolean {
  return parseEnv().CLOUDFLARE_WORKERS_FREE_TIER === "true";
}

/**
 * URL that serves an R2 object without going through the Worker:
 * `R2_PUBLIC_BASE_URL/<key>` when set, else a short-lived presigned R2 GET,
 * else null (caller streams as before).
 */
export async function artifactUrl(key: string): Promise<string | null> {
  const env = parseEnv();
  if (env.R2_PUBLIC_BASE_URL) {
    const base = env.R2_PUBLIC_BASE_URL.replace(/\/+$/, "");
    const path = key.split("/").map(encodeURIComponent).join("/");
    return `${base}/${path}`;
  }

  const { R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ACCOUNT_ID } = env;
  if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_ACCOUNT_ID) return null;

  // Loaded lazily so non-free deployments never pay for the SDK.
  const [{ S3Client, GetObjectCommand }, { getSignedUrl }] = await Promise.all([
    import("@aws-sdk/client-s3"),
    import("@aws-sdk/s3-request-presigner"),
  ]);
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key }),
    { expiresIn: PRESIGN_TTL_SECONDS },
  );
}

/**
 * On Workers Free, a 307 to the offloaded artifact; otherwise null so the
 * route keeps streaming. Warns once when free tier has no offload configured.
 */
export async function offloadedArtifact(key: string): Promise<Response | null> {
  if (!isWorkersFreeTier()) return null;
  const url = await artifactUrl(key);
  if (!url) {
    if (!warnedMisconfigured) {
      warnedMisconfigured = true;
      console.warn(
        "CLOUDFLARE_WORKERS_FREE_TIER is true but neither R2_PUBLIC_BASE_URL nor " +
          "R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_ACCOUNT_ID are set; streaming artifacts through the Worker.",
      );
    }
    return null;
  }
  return Response.redirect(url, 307);
}
