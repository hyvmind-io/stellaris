import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createLocalFileBackend, LocalFileBackend } from "@/lib/storage/local";

// ============================================================================
// Helpers
// ============================================================================

/** Create a simple ReadableStream from a string. */
function stringToReadableStream(text: string): ReadableStream {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

/** Drain a ReadableStream to a string. */
async function streamToString(stream: ReadableStream): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value as Uint8Array, { stream: true });
  }
  result += decoder.decode(); // flush
  return result;
}

// ============================================================================
// Setup / teardown
// ============================================================================

let tmpDir: string;
let backend: LocalFileBackend;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "stellaris-storage-test-"));
  backend = createLocalFileBackend(tmpDir);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ============================================================================
// put + get roundtrip
// ============================================================================

describe("LocalFileBackend — put + get roundtrip", () => {
  it("stores and retrieves a string value", async () => {
    await backend.put("hello.txt", "hello world");
    const obj = await backend.get("hello.txt");
    expect(obj).not.toBeNull();
    expect(await obj!.text()).toBe("hello world");
  });

  it("stores and retrieves an ArrayBuffer value", async () => {
    const encoder = new TextEncoder();
    const buf = encoder.encode("binary content").buffer as ArrayBuffer;
    await backend.put("data.bin", buf);
    const obj = await backend.get("data.bin");
    expect(obj).not.toBeNull();
    const text = await obj!.text();
    expect(text).toBe("binary content");
  });

  it("stores and retrieves a ReadableStream value (stream buffering fix)", async () => {
    // This is the core dev fix — validates streams are buffered before writing
    const stream = stringToReadableStream("streamed content");
    await backend.put("stream.txt", stream);
    const obj = await backend.get("stream.txt");
    expect(obj).not.toBeNull();
    expect(await obj!.text()).toBe("streamed content");
  });

  it("returns a readable .body stream that produces correct content", async () => {
    await backend.put("body.txt", "readable body content");
    const obj = await backend.get("body.txt");
    expect(obj).not.toBeNull();
    const content = await streamToString(obj!.body);
    expect(content).toBe("readable body content");
  });

  it("returns correct arrayBuffer() content", async () => {
    const original = "arraybuffer content";
    await backend.put("ab.txt", original);
    const obj = await backend.get("ab.txt");
    expect(obj).not.toBeNull();
    const ab = await obj!.arrayBuffer();
    const decoded = new TextDecoder().decode(ab);
    expect(decoded).toBe(original);
  });

  it("creates nested directories for deeply nested keys", async () => {
    const key = "providers/hashicorp/aws/4.0.0/SHA256SUMS";
    await backend.put(key, "sha256sums content");
    const obj = await backend.get(key);
    expect(obj).not.toBeNull();
    expect(await obj!.text()).toBe("sha256sums content");
  });

  it("creates deeply nested directories (5 levels)", async () => {
    const key = "a/b/c/d/e/file.txt";
    await backend.put(key, "deep content");
    const obj = await backend.get(key);
    expect(obj).not.toBeNull();
    expect(await obj!.text()).toBe("deep content");
  });

  it("overwrites an existing key with new data", async () => {
    await backend.put("overwrite.txt", "first version");
    await backend.put("overwrite.txt", "second version");
    const obj = await backend.get("overwrite.txt");
    expect(obj).not.toBeNull();
    expect(await obj!.text()).toBe("second version");
  });

  it("stores binary data correctly via ArrayBuffer", async () => {
    const bytes = new Uint8Array([0x00, 0x01, 0x02, 0xfe, 0xff]);
    await backend.put("binary.bin", bytes.buffer as ArrayBuffer);
    const obj = await backend.get("binary.bin");
    expect(obj).not.toBeNull();
    const retrieved = await obj!.arrayBuffer();
    expect(new Uint8Array(retrieved)).toEqual(bytes);
  });

  it("stores binary data correctly via ReadableStream", async () => {
    const bytes = new Uint8Array([0x10, 0x20, 0x30]);
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });
    await backend.put("binary-stream.bin", stream);
    const obj = await backend.get("binary-stream.bin");
    expect(obj).not.toBeNull();
    const retrieved = new Uint8Array(await obj!.arrayBuffer());
    expect(retrieved).toEqual(bytes);
  });
});

// ============================================================================
// get — missing key
// ============================================================================

describe("LocalFileBackend — get missing key", () => {
  it("returns null for a non-existent key", async () => {
    const result = await backend.get("does-not-exist.txt");
    expect(result).toBeNull();
  });

  it("returns null for a key in a non-existent sub-directory", async () => {
    const result = await backend.get("nonexistent/subdir/file.txt");
    expect(result).toBeNull();
  });
});

// ============================================================================
// delete
// ============================================================================

describe("LocalFileBackend — delete", () => {
  it("deletes a single key (string form)", async () => {
    await backend.put("to-delete.txt", "goodbye");
    await backend.delete("to-delete.txt");
    const result = await backend.get("to-delete.txt");
    expect(result).toBeNull();
  });

  it("is idempotent on missing keys — does not throw", async () => {
    await expect(backend.delete("missing.txt")).resolves.not.toThrow();
  });

  it("is idempotent when deleting an already-deleted key", async () => {
    await backend.put("del-twice.txt", "content");
    await backend.delete("del-twice.txt");
    await expect(backend.delete("del-twice.txt")).resolves.not.toThrow();
  });

  it("deletes multiple keys (array form)", async () => {
    await backend.put("file-a.txt", "a");
    await backend.put("file-b.txt", "b");
    await backend.put("file-c.txt", "c");

    await backend.delete(["file-a.txt", "file-b.txt"]);

    expect(await backend.get("file-a.txt")).toBeNull();
    expect(await backend.get("file-b.txt")).toBeNull();
    // file-c should still exist
    expect(await backend.get("file-c.txt")).not.toBeNull();
  });

  it("handles empty array delete without error", async () => {
    await expect(backend.delete([])).resolves.not.toThrow();
  });

  it("deletes multiple keys including some that don't exist", async () => {
    await backend.put("exists.txt", "yes");
    await expect(
      backend.delete(["exists.txt", "nonexistent.txt"]),
    ).resolves.not.toThrow();
    expect(await backend.get("exists.txt")).toBeNull();
  });
});

// ============================================================================
// list
// ============================================================================

describe("LocalFileBackend — list", () => {
  it("returns empty result when storage root has no files", async () => {
    const result = await backend.list();
    expect(result.objects).toHaveLength(0);
    expect(result.truncated).toBe(false);
    expect(result.cursor).toBeUndefined();
  });

  it("returns empty result for non-existent storage root", async () => {
    const noRootBackend = createLocalFileBackend(
      "/tmp/__totally_nonexistent_stellaris_root__",
    );
    const result = await noRootBackend.list();
    expect(result.objects).toHaveLength(0);
    expect(result.truncated).toBe(false);
  });

  it("returns all keys when no prefix specified", async () => {
    await backend.put("alpha.txt", "a");
    await backend.put("beta.txt", "b");
    await backend.put("gamma.txt", "g");

    const result = await backend.list();
    const keys = result.objects.map((o) => o.key).sort();
    expect(keys).toEqual(["alpha.txt", "beta.txt", "gamma.txt"]);
    expect(result.truncated).toBe(false);
  });

  it("returns nested keys", async () => {
    await backend.put("ns/name/aws/1.0.0.tar.gz", "tarball");
    await backend.put("ns/name/aws/2.0.0.tar.gz", "tarball2");

    const result = await backend.list();
    const keys = result.objects.map((o) => o.key).sort();
    expect(keys).toContain("ns/name/aws/1.0.0.tar.gz");
    expect(keys).toContain("ns/name/aws/2.0.0.tar.gz");
  });

  it("filters by prefix correctly", async () => {
    await backend.put("ns/vpc/aws/1.0.0.tar.gz", "mod1");
    await backend.put("ns/ecs/aws/1.0.0.tar.gz", "mod2");
    await backend.put("providers/hashicorp/aws/4.0.0/file.zip", "prov1");

    const result = await backend.list({ prefix: "ns/" });
    const keys = result.objects.map((o) => o.key);
    expect(keys.every((k) => k.startsWith("ns/"))).toBe(true);
    expect(keys).toHaveLength(2);
  });

  it("returns empty for prefix with no matching keys", async () => {
    await backend.put("ns/name/aws/1.0.0.tar.gz", "mod");
    const result = await backend.list({ prefix: "providers/" });
    expect(result.objects).toHaveLength(0);
  });

  it("paginates with limit — page 1", async () => {
    await backend.put("a.txt", "a");
    await backend.put("b.txt", "b");
    await backend.put("c.txt", "c");

    const page1 = await backend.list({ limit: 2 });
    expect(page1.objects).toHaveLength(2);
    expect(page1.truncated).toBe(true);
    expect(page1.cursor).toBeDefined();
  });

  it("paginates with limit — page 2 via cursor", async () => {
    await backend.put("a.txt", "a");
    await backend.put("b.txt", "b");
    await backend.put("c.txt", "c");

    const page1 = await backend.list({ limit: 2 });
    expect(page1.truncated).toBe(true);

    const page2 = await backend.list({ limit: 2, cursor: page1.cursor });
    expect(page2.objects).toHaveLength(1);
    expect(page2.truncated).toBe(false);
    expect(page2.cursor).toBeUndefined();
  });

  it("paginates — two pages cover all items without overlap", async () => {
    await backend.put("a.txt", "a");
    await backend.put("b.txt", "b");
    await backend.put("c.txt", "c");

    const page1 = await backend.list({ limit: 2 });
    const page2 = await backend.list({ limit: 2, cursor: page1.cursor });

    const allKeys = [
      ...page1.objects.map((o) => o.key),
      ...page2.objects.map((o) => o.key),
    ].sort();
    expect(allKeys).toEqual(["a.txt", "b.txt", "c.txt"]);
  });

  it("returns objects in lexicographic order", async () => {
    await backend.put("z.txt", "z");
    await backend.put("a.txt", "a");
    await backend.put("m.txt", "m");

    const result = await backend.list();
    const keys = result.objects.map((o) => o.key);
    expect(keys).toEqual([...keys].sort());
  });

  it("cursor with limit=1 iterates one item at a time", async () => {
    await backend.put("x.txt", "x");
    await backend.put("y.txt", "y");

    const page1 = await backend.list({ limit: 1 });
    expect(page1.objects).toHaveLength(1);
    expect(page1.truncated).toBe(true);

    const page2 = await backend.list({ limit: 1, cursor: page1.cursor });
    expect(page2.objects).toHaveLength(1);
    expect(page2.truncated).toBe(false);

    expect(page1.objects[0]!.key).not.toBe(page2.objects[0]!.key);
  });
});

// ============================================================================
// Path traversal guard
// ============================================================================

describe("LocalFileBackend — path traversal guard", () => {
  it("throws on traversal attempt via put (../../etc/passwd)", async () => {
    await expect(backend.put("../../etc/passwd", "malicious")).rejects.toThrow(
      /path traversal/i,
    );
  });

  it("throws on traversal attempt via get (../../etc/passwd)", async () => {
    await expect(backend.get("../../etc/passwd")).rejects.toThrow(
      /path traversal/i,
    );
  });

  it("throws on traversal attempt via put with encoded dots", async () => {
    await expect(
      backend.put("../sibling-dir/secret.txt", "malicious"),
    ).rejects.toThrow(/path traversal/i);
  });

  it("throws on traversal attempt via get with encoded dots", async () => {
    await expect(backend.get("../sibling-dir/secret.txt")).rejects.toThrow(
      /path traversal/i,
    );
  });

  it("allows normal nested keys within root", async () => {
    // Sanity check — safe keys should not throw
    await expect(
      backend.put("safe/nested/key.txt", "safe"),
    ).resolves.not.toThrow();
  });
});

// ============================================================================
// createLocalFileBackend factory
// ============================================================================

describe("createLocalFileBackend", () => {
  it("returns a LocalFileBackend instance", () => {
    const b = createLocalFileBackend(tmpDir);
    expect(b).toBeInstanceOf(LocalFileBackend);
  });

  it("uses the provided root directory", async () => {
    const b = createLocalFileBackend(tmpDir);
    await b.put("factory-test.txt", "factory");
    const obj = await b.get("factory-test.txt");
    expect(await obj!.text()).toBe("factory");
  });
});
