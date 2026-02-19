/**
 * Local filesystem storage backend for development.
 *
 * Uses Node.js `node:fs` and `node:path` — only works in Node.js environments
 * (pnpm dev / vitest). NEVER loaded in Cloudflare Workers production builds.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

import type {
  StorageBackend,
  StorageObject,
  PutOptions,
  ListResult,
} from "./types";

/** Default number of objects returned per list() page. */
const DEFAULT_LIST_LIMIT = 1000;

/**
 * Drain a WHATWG ReadableStream into a Node.js Buffer.
 * This is the core fix for the "Provided readable stream must have a known
 * length" error — the local backend buffers the stream before writing to disk.
 */
async function streamToBuffer(stream: ReadableStream): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value as Uint8Array);
  }

  return Buffer.concat(chunks);
}

/**
 * Convert a key (e.g. "modules/ns/name/provider/1.0.0.tar.gz") to
 * an absolute filesystem path under the storage root.
 * Validates against path traversal attacks.
 */
function keyToPath(root: string, key: string): string {
  const resolved = path.resolve(root, key);

  // Ensure the resolved path is within the storage root to prevent traversal
  const normalizedRoot = path.resolve(root) + path.sep;
  if (!resolved.startsWith(normalizedRoot) && resolved !== path.resolve(root)) {
    throw new Error(`Path traversal detected: "${key}"`);
  }

  return resolved;
}

/**
 * Wrap a Buffer as a StorageObject with `.body`, `.text()`, `.arrayBuffer()`.
 */
function bufferToStorageObject(buf: Buffer): StorageObject {
  return {
    get body(): ReadableStream {
      return new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(buf));
          controller.close();
        },
      });
    },
    text: () => Promise.resolve(buf.toString("utf-8")),
    arrayBuffer: () => {
      // Copy into a clean ArrayBuffer to satisfy the interface type
      const copy = new ArrayBuffer(buf.byteLength);
      new Uint8Array(copy).set(buf);
      return Promise.resolve(copy);
    },
  };
}

/**
 * Recursively collect all file paths under `dir`, returning keys relative
 * to `root` (using forward slashes as the delimiter, matching R2 key format).
 */
async function walkDir(dir: string, root: string): Promise<string[]> {
  const keys: string[] = [];

  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    // Directory doesn't exist yet — return empty
    return keys;
  }

  for (const name of names) {
    const fullPath = path.join(dir, name);
    const stat = await fs.stat(fullPath);
    if (stat.isDirectory()) {
      const nested = await walkDir(fullPath, root);
      keys.push(...nested);
    } else if (stat.isFile()) {
      // Convert OS path to forward-slash key (R2-style)
      const relative = path.relative(root, fullPath);
      keys.push(relative.split(path.sep).join("/"));
    }
  }

  return keys;
}

/**
 * Local filesystem storage backend for development.
 *
 * Stores objects as plain files under `root`, using the object key as
 * the relative path. Metadata (httpMetadata, customMetadata) is silently
 * ignored since it's only meaningful for R2.
 */
export class LocalFileBackend implements StorageBackend {
  private readonly root: string;

  constructor(root?: string) {
    this.root = root ?? path.join(process.cwd(), ".storage");
  }

  async put(
    key: string,
    data: ArrayBuffer | ReadableStream | string,
    _options?: PutOptions,
  ): Promise<void> {
    const filePath = keyToPath(this.root, key);
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    let content: Buffer | string;
    if (typeof data === "string") {
      content = data;
    } else if (data instanceof ArrayBuffer) {
      content = Buffer.from(data);
    } else {
      // ReadableStream — drain to buffer
      content = await streamToBuffer(data);
    }

    await fs.writeFile(filePath, content);
  }

  async get(key: string): Promise<StorageObject | null> {
    const filePath = keyToPath(this.root, key);

    try {
      const buf = await fs.readFile(filePath);
      return bufferToStorageObject(buf);
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === "ENOENT") {
        return null;
      }
      throw err;
    }
  }

  async delete(keys: string | string[]): Promise<void> {
    const keyList = Array.isArray(keys) ? keys : [keys];

    for (const key of keyList) {
      const filePath = keyToPath(this.root, key);
      try {
        await fs.unlink(filePath);
      } catch (err: unknown) {
        // Idempotent — ignore "file not found"
        if (isNodeError(err) && err.code === "ENOENT") {
          continue;
        }
        throw err;
      }
    }
  }

  async list(options?: {
    prefix?: string;
    cursor?: string;
    limit?: number;
  }): Promise<ListResult> {
    const prefix = options?.prefix ?? "";
    const cursor = options?.cursor;
    const limit = options?.limit ?? DEFAULT_LIST_LIMIT;

    // Collect all keys under root
    let allKeys = await walkDir(this.root, this.root);

    // Filter by prefix
    if (prefix) {
      allKeys = allKeys.filter((k) => k.startsWith(prefix));
    }

    // Lexicographic sort (matches R2 default ordering)
    allKeys.sort();

    // Apply cursor: skip keys up to and including the cursor value
    if (cursor) {
      const cursorIndex = allKeys.indexOf(cursor);
      if (cursorIndex >= 0) {
        allKeys = allKeys.slice(cursorIndex + 1);
      } else {
        // If cursor key no longer exists, skip all keys <= cursor
        allKeys = allKeys.filter((k) => k > cursor);
      }
    }

    // Paginate
    const truncated = allKeys.length > limit;
    const page = allKeys.slice(0, limit);
    const lastKey = page[page.length - 1];

    return {
      objects: page.map((key) => ({ key })),
      truncated,
      cursor: truncated && lastKey ? lastKey : undefined,
    };
  }
}

/**
 * Factory function for creating a LocalFileBackend instance.
 */
export function createLocalFileBackend(root?: string): LocalFileBackend {
  return new LocalFileBackend(root);
}

/** Type guard for Node.js errors with a `code` property. */
function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}
