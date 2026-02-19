/**
 * Cloudflare R2 storage backend.
 *
 * Used in production and preview (Cloudflare Workers).
 * Requires the MODULES_STORAGE R2 bucket binding from wrangler.jsonc.
 */

import { getCloudflareContext } from "@opennextjs/cloudflare";

import type {
  StorageBackend,
  StorageObject,
  PutOptions,
  ListResult,
} from "./types";

/** Adapt an R2ObjectBody to the StorageObject interface. */
function wrapR2Object(obj: R2ObjectBody): StorageObject {
  return {
    get body(): ReadableStream {
      return obj.body as ReadableStream;
    },
    text: () => obj.text(),
    arrayBuffer: () => obj.arrayBuffer(),
  };
}

/**
 * Cloudflare R2 storage backend.
 */
export class R2Backend implements StorageBackend {
  private getBucket(): R2Bucket {
    const { env } = getCloudflareContext();
    return env.MODULES_STORAGE as R2Bucket;
  }

  async put(
    key: string,
    data: ArrayBuffer | ReadableStream | string,
    options?: PutOptions,
  ): Promise<void> {
    const bucket = this.getBucket();
    await bucket.put(key, data as ArrayBuffer, {
      httpMetadata: options?.httpMetadata,
      customMetadata: options?.customMetadata,
    });
  }

  async get(key: string): Promise<StorageObject | null> {
    const bucket = this.getBucket();
    const obj = await bucket.get(key);
    if (!obj) return null;
    return wrapR2Object(obj);
  }

  async delete(keys: string | string[]): Promise<void> {
    const bucket = this.getBucket();
    await bucket.delete(keys as string);
  }

  async list(options?: {
    prefix?: string;
    cursor?: string;
    limit?: number;
  }): Promise<ListResult> {
    const bucket = this.getBucket();
    const result = await bucket.list({
      prefix: options?.prefix,
      cursor: options?.cursor,
      limit: options?.limit,
    });
    return {
      objects: result.objects.map((o) => ({ key: o.key })),
      truncated: result.truncated,
      cursor: result.truncated ? result.cursor : undefined,
    };
  }
}
