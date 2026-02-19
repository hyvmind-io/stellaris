/**
 * S3 / S3-compatible storage backend.
 *
 * Works with:
 *   - AWS S3 (STORAGE_BACKEND=s3)
 *   - S3-compatible services like MinIO, Tigris, Backblaze B2 (STORAGE_BACKEND=s3-compatible)
 *
 * Required env vars:
 *   S3_BUCKET            — Bucket name
 *   S3_REGION            — AWS region (e.g., "us-east-1")
 *   S3_ACCESS_KEY_ID     — Access key
 *   S3_SECRET_ACCESS_KEY — Secret key
 *
 * Optional env vars:
 *   S3_ENDPOINT          — Custom endpoint URL (required for s3-compatible, optional for s3)
 *   S3_FORCE_PATH_STYLE  — Set to "true" for MinIO and other services that require path-style URLs
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";

import type {
  StorageBackend,
  StorageObject,
  PutOptions,
  ListResult,
} from "./types";

// ============================================================================
// Helpers
// ============================================================================

/** Default number of objects returned per list() page. */
const DEFAULT_LIST_LIMIT = 1000;

/**
 * Drain a WHATWG ReadableStream into a Uint8Array.
 *
 * Uses only Web-standard APIs (no Node.js Buffer) so this works in both
 * Node.js and Cloudflare Workers with nodejs_compat.
 */
async function streamToUint8Array(stream: ReadableStream): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = value as Uint8Array;
    chunks.push(chunk);
    totalLength += chunk.length;
  }

  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

/**
 * Read the required env vars for S3 and validate they are present.
 * Throws a clear error message listing all missing variables.
 */
function readS3Config(): {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string | undefined;
  forcePathStyle: boolean;
} {
  const bucket = process.env.S3_BUCKET;
  const region = process.env.S3_REGION;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  const endpoint = process.env.S3_ENDPOINT || undefined;
  const forcePathStyle = process.env.S3_FORCE_PATH_STYLE === "true";

  const missing: string[] = [];
  if (!bucket) missing.push("S3_BUCKET");
  if (!region) missing.push("S3_REGION");
  if (!accessKeyId) missing.push("S3_ACCESS_KEY_ID");
  if (!secretAccessKey) missing.push("S3_SECRET_ACCESS_KEY");

  if (missing.length > 0) {
    throw new Error(
      `S3Backend: missing required environment variables: ${missing.join(", ")}. ` +
        `Set STORAGE_BACKEND to "local" or "r2" if you don't need S3.`,
    );
  }

  return {
    bucket: bucket!,
    region: region!,
    accessKeyId: accessKeyId!,
    secretAccessKey: secretAccessKey!,
    endpoint,
    forcePathStyle,
  };
}

// ============================================================================
// S3Backend
// ============================================================================

/**
 * AWS S3 and S3-compatible storage backend.
 *
 * Reads credentials and configuration from `process.env` directly (not from
 * `lib/env.ts`) to avoid circular dependencies and keep the backend self-contained.
 */
export class S3Backend implements StorageBackend {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    const config = readS3Config();

    this.bucket = config.bucket;
    this.client = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      ...(config.endpoint && { endpoint: config.endpoint }),
      forcePathStyle: config.forcePathStyle,
    });
  }

  async put(
    key: string,
    data: ArrayBuffer | ReadableStream | string,
    options?: PutOptions,
  ): Promise<void> {
    let body: Uint8Array | string;

    if (typeof data === "string") {
      body = data;
    } else if (data instanceof ArrayBuffer) {
      body = new Uint8Array(data);
    } else {
      // ReadableStream — drain to Uint8Array
      body = await streamToUint8Array(data);
    }

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: options?.httpMetadata?.contentType,
        Metadata: options?.customMetadata,
      }),
    );
  }

  async get(key: string): Promise<StorageObject | null> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );

      // response.Body is an SdkStream — it provides transform helpers.
      const sdkBody = response.Body;
      if (!sdkBody) return null;

      return {
        get body(): ReadableStream {
          // transformToWebStream() returns a standard WHATWG ReadableStream
          return sdkBody.transformToWebStream() as ReadableStream;
        },
        text: () => sdkBody.transformToString(),
        arrayBuffer: async () => {
          const bytes = await sdkBody.transformToByteArray();
          return bytes.buffer as ArrayBuffer;
        },
      };
    } catch (error: unknown) {
      // S3 returns NoSuchKey when the object doesn't exist
      if (isS3NoSuchKeyError(error)) {
        return null;
      }
      throw error;
    }
  }

  async delete(keys: string | string[]): Promise<void> {
    const keyList = Array.isArray(keys) ? keys : [keys];

    if (keyList.length === 0) return;

    if (keyList.length === 1) {
      // Single delete — simpler API call
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: keyList[0],
        }),
      );
      return;
    }

    // Batch delete — up to 1000 keys per request (S3 limit)
    const batchSize = 1000;
    for (let i = 0; i < keyList.length; i += batchSize) {
      const batch = keyList.slice(i, i + batchSize);
      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: {
            Objects: batch.map((k) => ({ Key: k })),
            Quiet: true,
          },
        }),
      );
    }
  }

  async list(options?: {
    prefix?: string;
    cursor?: string;
    limit?: number;
  }): Promise<ListResult> {
    const response = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: options?.prefix,
        ContinuationToken: options?.cursor,
        MaxKeys: options?.limit ?? DEFAULT_LIST_LIMIT,
      }),
    );

    const objects = (response.Contents ?? []).map((obj) => ({
      key: obj.Key!,
    }));

    return {
      objects,
      truncated: response.IsTruncated ?? false,
      cursor: response.IsTruncated ? response.NextContinuationToken : undefined,
    };
  }
}

// ============================================================================
// Factory
// ============================================================================

/** Create an S3Backend instance. */
export function createS3Backend(): S3Backend {
  return new S3Backend();
}

// ============================================================================
// Error helpers
// ============================================================================

/** Check whether an error is an S3 NoSuchKey error. */
function isS3NoSuchKeyError(error: unknown): boolean {
  if (error instanceof Error && "name" in error) {
    return error.name === "NoSuchKey";
  }
  return false;
}
