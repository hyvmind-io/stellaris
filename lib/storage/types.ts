/**
 * Storage abstraction types shared by all backends.
 *
 * IMPORTANT: This file must NOT import "server-only" because the storage
 * layer is used in route handlers (not server components).
 */

/**
 * Minimal interface for a stored object returned by the storage backend.
 * Mirrors the R2ObjectBody methods actually used by route consumers.
 */
export interface StorageObject {
  /** Raw byte stream of the stored object. */
  readonly body: ReadableStream;
  /** Read the entire object body as a UTF-8 string. */
  text(): Promise<string>;
  /** Read the entire object body as an ArrayBuffer. */
  arrayBuffer(): Promise<ArrayBuffer>;
}

/** Per-object metadata for storage PUT operations. */
export interface PutOptions {
  httpMetadata?: { contentType?: string };
  customMetadata?: Record<string, string>;
}

/** Result of a paginated list operation. */
export interface ListResult {
  objects: Array<{ key: string }>;
  truncated: boolean;
  /** Opaque cursor for the next page; present only when truncated=true. */
  cursor?: string;
}

/**
 * Storage backend contract.
 * Implemented by:
 *   - R2Backend (Cloudflare R2 — production on Workers)
 *   - S3Backend (AWS S3 and S3-compatible services)
 *   - LocalFileBackend (local filesystem — development only)
 */
export interface StorageBackend {
  /** Write an object. Accepts ArrayBuffer, ReadableStream, or string. */
  put(
    key: string,
    data: ArrayBuffer | ReadableStream | string,
    options?: PutOptions,
  ): Promise<void>;

  /** Retrieve an object by key. Returns null if not found. */
  get(key: string): Promise<StorageObject | null>;

  /** Delete one or more objects by key. Idempotent. */
  delete(keys: string | string[]): Promise<void>;

  /** List objects with optional prefix filter and cursor pagination. */
  list(options?: {
    prefix?: string;
    cursor?: string;
    limit?: number;
  }): Promise<ListResult>;
}
