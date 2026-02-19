/**
 * Storage abstraction barrel.
 *
 * Provides the same function signatures as the old lib/storage/r2.ts so that
 * consumer migration is import-path-only: `@/lib/storage/r2` → `@/lib/storage`.
 *
 * The active backend is determined by the STORAGE_BACKEND env var:
 *   "local"          → LocalFileBackend  (pnpm dev / vitest)
 *   "r2"             → R2Backend          (production / preview on Cloudflare Workers)
 *   "s3"             → S3Backend          (AWS S3)
 *   "s3-compatible"  → S3Backend          (MinIO, Tigris, Backblaze B2, etc.)
 */

import { generateModuleKey, generateProviderKey } from "./keys";
import type { StorageBackend } from "./types";

export type { StorageObject } from "./types";

/**
 * Returns the active storage backend based on STORAGE_BACKEND env var.
 *
 * Uses lazy require() to avoid bundling node:fs (from local.ts) into the
 * Cloudflare Workers build where it would fail at import time.
 *
 * Access env directly to avoid circular dep (same pattern as lib/auth/constants.ts).
 */
function getBackend(): StorageBackend {
  const backend = process.env.STORAGE_BACKEND ?? "r2";

  if (backend === "local") {
    // Dynamic require — only loaded when STORAGE_BACKEND=local (Node.js dev)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("./local") as typeof import("./local");
    return new mod.LocalFileBackend();
  }

  if (backend === "s3" || backend === "s3-compatible") {
    // Dynamic require — only loaded when STORAGE_BACKEND=s3 or s3-compatible
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("./s3") as typeof import("./s3");
    return new mod.S3Backend();
  }

  // Default: R2 (Cloudflare Workers production / preview)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("./r2") as typeof import("./r2");
  return new mod.R2Backend();
}

// ============================================================================
// Public API — matches the old lib/storage/r2.ts function signatures
// ============================================================================

export async function uploadModuleTarball(
  namespace: string,
  name: string,
  provider: string,
  version: string,
  data: ArrayBuffer | ReadableStream,
): Promise<string> {
  const storage = getBackend();
  const key = generateModuleKey(namespace, name, provider, version);
  await storage.put(key, data, {
    httpMetadata: { contentType: "application/gzip" },
    customMetadata: { namespace, name, provider, version },
  });
  return key;
}

export async function getModuleTarball(key: string) {
  return getBackend().get(key);
}

export async function uploadProviderZip(
  namespace: string,
  type: string,
  version: string,
  os: string,
  arch: string,
  data: ArrayBuffer | ReadableStream,
): Promise<string> {
  const storage = getBackend();
  const key = generateProviderKey(namespace, type, version, os, arch);
  await storage.put(key, data, {
    httpMetadata: { contentType: "application/zip" },
    customMetadata: { namespace, type, version, os, arch },
  });
  return key;
}

export async function uploadShasums(
  namespace: string,
  type: string,
  version: string,
  data: string,
): Promise<string> {
  const storage = getBackend();
  const key = `providers/${namespace}/${type}/${version}/SHA256SUMS`;
  await storage.put(key, data, {
    httpMetadata: { contentType: "text/plain" },
  });
  return key;
}

export async function uploadShasumsSignature(
  namespace: string,
  type: string,
  version: string,
  data: ArrayBuffer,
): Promise<string> {
  const storage = getBackend();
  const key = `providers/${namespace}/${type}/${version}/SHA256SUMS.sig`;
  await storage.put(key, data, {
    httpMetadata: { contentType: "application/pgp-signature" },
  });
  return key;
}

export async function getObject(key: string) {
  return getBackend().get(key);
}

export async function deleteObject(key: string): Promise<void> {
  await getBackend().delete(key);
}

export async function deleteByPrefix(prefix: string): Promise<number> {
  const storage = getBackend();
  let cursor: string | undefined;
  let deleted = 0;

  do {
    const listed = await storage.list({ prefix, cursor });
    if (listed.objects.length > 0) {
      const keys = listed.objects.map((obj) => obj.key);
      await storage.delete(keys);
      deleted += keys.length;
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);

  return deleted;
}
