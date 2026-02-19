import { getCloudflareContext } from "@opennextjs/cloudflare";
import { generateModuleKey, generateProviderKey } from "./keys";

/**
 * Get the R2 bucket binding for module/provider artifact storage.
 */
function getBucket() {
  const { env } = getCloudflareContext();
  return env.MODULES_STORAGE as R2Bucket;
}

/**
 * Upload a module tarball to R2.
 * Returns the R2 key.
 */
export async function uploadModuleTarball(
  namespace: string,
  name: string,
  provider: string,
  version: string,
  data: ArrayBuffer | ReadableStream,
): Promise<string> {
  const bucket = getBucket();
  const key = generateModuleKey(namespace, name, provider, version);

  await bucket.put(key, data, {
    httpMetadata: { contentType: "application/gzip" },
    customMetadata: { namespace, name, provider, version },
  });

  return key;
}

/**
 * Get a module tarball from R2.
 * Returns the R2ObjectBody or null if not found.
 */
export async function getModuleTarball(
  key: string,
): Promise<R2ObjectBody | null> {
  const bucket = getBucket();
  return bucket.get(key);
}

/**
 * Upload a provider zip archive to R2.
 * Returns the R2 key.
 */
export async function uploadProviderZip(
  namespace: string,
  type: string,
  version: string,
  os: string,
  arch: string,
  data: ArrayBuffer | ReadableStream,
): Promise<string> {
  const bucket = getBucket();
  const key = generateProviderKey(namespace, type, version, os, arch);

  await bucket.put(key, data, {
    httpMetadata: { contentType: "application/zip" },
    customMetadata: { namespace, type, version, os, arch },
  });

  return key;
}

/**
 * Upload SHA256SUMS file for a provider version.
 */
export async function uploadShasums(
  namespace: string,
  type: string,
  version: string,
  data: string,
): Promise<string> {
  const bucket = getBucket();
  const key = `providers/${namespace}/${type}/${version}/SHA256SUMS`;

  await bucket.put(key, data, {
    httpMetadata: { contentType: "text/plain" },
  });

  return key;
}

/**
 * Upload SHA256SUMS.sig for a provider version.
 */
export async function uploadShasumsSignature(
  namespace: string,
  type: string,
  version: string,
  data: ArrayBuffer,
): Promise<string> {
  const bucket = getBucket();
  const key = `providers/${namespace}/${type}/${version}/SHA256SUMS.sig`;

  await bucket.put(key, data, {
    httpMetadata: { contentType: "application/pgp-signature" },
  });

  return key;
}

/**
 * Get any object from R2 by key.
 */
export async function getObject(key: string): Promise<R2ObjectBody | null> {
  const bucket = getBucket();
  return bucket.get(key);
}

/**
 * Delete an object from R2 by key.
 */
export async function deleteObject(key: string): Promise<void> {
  const bucket = getBucket();
  await bucket.delete(key);
}

/**
 * Delete all R2 objects whose keys start with the given prefix.
 * Used for cleaning up all artifacts for a provider version.
 * Returns the number of objects deleted.
 */
export async function deleteByPrefix(prefix: string): Promise<number> {
  const bucket = getBucket();
  let cursor: string | undefined;
  let deleted = 0;

  do {
    const listed = await bucket.list({ prefix, cursor });
    if (listed.objects.length > 0) {
      const keys = listed.objects.map((obj) => obj.key);
      await bucket.delete(keys);
      deleted += keys.length;
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);

  return deleted;
}
