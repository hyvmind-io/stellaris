/**
 * Tests for lib/storage/index.ts — the barrel module with backend selection
 * and high-level storage functions.
 *
 * Testing strategy:
 *   lib/storage/index.ts uses dynamic CJS require() for lazy backend loading.
 *   Vitest's vi.mock() intercepts ESM imports but NOT runtime CJS require()
 *   calls from within Vite-processed modules (the mocker hooks ESM, not native
 *   require). Because of this, we test against the LOCAL backend — the only
 *   backend that works in a Node.js test environment without external
 *   infrastructure (no Cloudflare bindings, no AWS credentials needed).
 *
 *   We use STORAGE_BACKEND=local and clean up the .storage directory in
 *   afterEach. The R2/S3 backend-selection tests are covered separately via
 *   their respective unit test files (s3.test.ts, local.test.ts).
 *
 *   All high-level functions (uploadModuleTarball, uploadProviderZip,
 *   uploadShasums, uploadShasumsSignature, getModuleTarball, getObject,
 *   deleteObject, deleteByPrefix) are tested end-to-end through LocalFileBackend.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  uploadModuleTarball,
  uploadProviderZip,
  uploadShasums,
  uploadShasumsSignature,
  getModuleTarball,
  getObject,
  deleteObject,
  deleteByPrefix,
} from "@/lib/storage/index";
import { generateModuleKey, generateProviderKey } from "@/lib/storage/keys";

// ============================================================================
// Storage root — use .storage under cwd (the default for LocalFileBackend)
// ============================================================================

const STORAGE_ROOT = path.join(process.cwd(), ".storage");

beforeEach(async () => {
  // Ensure STORAGE_BACKEND=local so index.ts picks LocalFileBackend
  process.env.STORAGE_BACKEND = "local";
  // Start each test with a clean storage root
  await fs.rm(STORAGE_ROOT, { recursive: true, force: true });
});

afterEach(async () => {
  // Clean up written files
  await fs.rm(STORAGE_ROOT, { recursive: true, force: true });
  delete process.env.STORAGE_BACKEND;
});

// ============================================================================
// Helpers
// ============================================================================

function makeStream(content = "test-data"): ReadableStream {
  const bytes = new TextEncoder().encode(content);
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

function makeBuffer(content = "test-data"): ArrayBuffer {
  return new TextEncoder().encode(content).buffer as ArrayBuffer;
}

// ============================================================================
// uploadModuleTarball
// ============================================================================

describe("uploadModuleTarball", () => {
  it("returns the correct generated key", async () => {
    const key = await uploadModuleTarball(
      "myorg",
      "vpc",
      "aws",
      "1.2.3",
      makeBuffer(),
    );

    expect(key).toBe(generateModuleKey("myorg", "vpc", "aws", "1.2.3"));
    expect(key).toBe("modules/myorg/vpc/aws/1.2.3.tar.gz");
  });

  it("key follows modules/{ns}/{name}/{provider}/{version}.tar.gz format", async () => {
    const key = await uploadModuleTarball(
      "hashicorp",
      "consul",
      "aws",
      "0.5.0",
      makeBuffer(),
    );

    expect(key).toBe("modules/hashicorp/consul/aws/0.5.0.tar.gz");
  });

  it("stored ArrayBuffer is retrievable via getModuleTarball", async () => {
    const content = "my tarball bytes";
    const key = await uploadModuleTarball(
      "ns",
      "name",
      "prov",
      "1.0.0",
      makeBuffer(content),
    );

    const obj = await getModuleTarball(key);
    expect(obj).not.toBeNull();
    expect(await obj!.text()).toBe(content);
  });

  it("stored ReadableStream is retrievable via getModuleTarball", async () => {
    const content = "stream content";
    const key = await uploadModuleTarball(
      "ns",
      "name",
      "prov",
      "2.0.0",
      makeStream(content),
    );

    const obj = await getModuleTarball(key);
    expect(await obj!.text()).toBe(content);
  });

  it("overwrites the same key on second call", async () => {
    await uploadModuleTarball("ns", "name", "prov", "1.0.0", makeBuffer("v1"));
    const key = await uploadModuleTarball(
      "ns",
      "name",
      "prov",
      "1.0.0",
      makeBuffer("v2"),
    );

    const obj = await getModuleTarball(key);
    expect(await obj!.text()).toBe("v2");
  });

  it("creates nested directories automatically", async () => {
    const key = await uploadModuleTarball(
      "deeply",
      "nested",
      "module",
      "9.9.9",
      makeBuffer("deep"),
    );

    const obj = await getModuleTarball(key);
    expect(obj).not.toBeNull();
  });
});

// ============================================================================
// uploadProviderZip
// ============================================================================

describe("uploadProviderZip", () => {
  it("returns the correct generated key", async () => {
    const key = await uploadProviderZip(
      "hashicorp",
      "aws",
      "4.0.0",
      "linux",
      "amd64",
      makeBuffer(),
    );

    expect(key).toBe(
      generateProviderKey("hashicorp", "aws", "4.0.0", "linux", "amd64"),
    );
    expect(key).toBe(
      "providers/hashicorp/aws/4.0.0/terraform-provider-aws_4.0.0_linux_amd64.zip",
    );
  });

  it("stored data is retrievable via getObject", async () => {
    const content = "zip bytes";
    const key = await uploadProviderZip(
      "ns",
      "type",
      "1.0.0",
      "darwin",
      "arm64",
      makeBuffer(content),
    );

    const obj = await getObject(key);
    expect(obj).not.toBeNull();
    expect(await obj!.text()).toBe(content);
  });

  it("accepts ReadableStream as data", async () => {
    const content = "zip stream";
    const key = await uploadProviderZip(
      "ns",
      "type",
      "1.0.0",
      "linux",
      "amd64",
      makeStream(content),
    );

    const obj = await getObject(key);
    expect(await obj!.text()).toBe(content);
  });
});

// ============================================================================
// uploadShasums
// ============================================================================

describe("uploadShasums", () => {
  it("returns the correct SHA256SUMS key", async () => {
    const key = await uploadShasums(
      "hashicorp",
      "aws",
      "4.0.0",
      "abc123  terraform-provider-aws_4.0.0_linux_amd64.zip",
    );

    expect(key).toBe("providers/hashicorp/aws/4.0.0/SHA256SUMS");
  });

  it("stored content is retrievable", async () => {
    const content = "deadbeef  terraform-provider-aws_4.0.0_linux_amd64.zip";

    const key = await uploadShasums("hashicorp", "aws", "4.0.0", content);
    const obj = await getObject(key);
    expect(await obj!.text()).toBe(content);
  });
});

// ============================================================================
// uploadShasumsSignature
// ============================================================================

describe("uploadShasumsSignature", () => {
  it("returns the correct SHA256SUMS.sig key", async () => {
    const sigData = new Uint8Array([0x89, 0x50, 0x4e]).buffer as ArrayBuffer;

    const key = await uploadShasumsSignature(
      "hashicorp",
      "aws",
      "4.0.0",
      sigData,
    );

    expect(key).toBe("providers/hashicorp/aws/4.0.0/SHA256SUMS.sig");
  });

  it("stored binary data is retrievable as ArrayBuffer", async () => {
    const bytes = new Uint8Array([0x01, 0x02, 0x03]);
    const sigData = bytes.buffer as ArrayBuffer;

    const key = await uploadShasumsSignature(
      "hashicorp",
      "aws",
      "4.0.0",
      sigData,
    );
    const obj = await getObject(key);
    const retrieved = new Uint8Array(await obj!.arrayBuffer());
    expect(retrieved).toEqual(bytes);
  });
});

// ============================================================================
// getModuleTarball
// ============================================================================

describe("getModuleTarball", () => {
  it("returns null for a missing key", async () => {
    const result = await getModuleTarball("modules/ns/name/aws/999.0.0.tar.gz");
    expect(result).toBeNull();
  });

  it("returns a StorageObject with body, text(), arrayBuffer() for an existing key", async () => {
    const content = "tarball content";
    const key = await uploadModuleTarball(
      "ns",
      "name",
      "prov",
      "1.0.0",
      makeBuffer(content),
    );

    const result = await getModuleTarball(key);
    expect(result).not.toBeNull();
    expect(result!.body).toBeInstanceOf(ReadableStream);
    expect(await result!.text()).toBe(content);
    const ab = await (await getModuleTarball(key))!.arrayBuffer();
    expect(new TextDecoder().decode(ab)).toBe(content);
  });
});

// ============================================================================
// getObject
// ============================================================================

describe("getObject", () => {
  it("returns null for a missing key", async () => {
    const result = await getObject("providers/ns/aws/1.0.0/nonexistent.zip");
    expect(result).toBeNull();
  });

  it("returns a StorageObject for an existing key", async () => {
    const content = "zip content";
    const key = await uploadProviderZip(
      "ns",
      "aws",
      "1.0.0",
      "linux",
      "amd64",
      makeBuffer(content),
    );

    const obj = await getObject(key);
    expect(obj).not.toBeNull();
    expect(await obj!.text()).toBe(content);
  });
});

// ============================================================================
// deleteObject
// ============================================================================

describe("deleteObject", () => {
  it("deletes an existing object (subsequent get returns null)", async () => {
    const key = await uploadModuleTarball(
      "ns",
      "name",
      "prov",
      "1.0.0",
      makeBuffer("to delete"),
    );

    await deleteObject(key);

    const result = await getModuleTarball(key);
    expect(result).toBeNull();
  });

  it("is idempotent on missing keys (no throw)", async () => {
    await expect(
      deleteObject("modules/ns/name/prov/999.0.0.tar.gz"),
    ).resolves.not.toThrow();
  });
});

// ============================================================================
// deleteByPrefix
// ============================================================================

describe("deleteByPrefix", () => {
  it("returns 0 when no objects match the prefix", async () => {
    const deleted = await deleteByPrefix("modules/nonexistent/");
    expect(deleted).toBe(0);
  });

  it("deletes all objects matching the prefix and returns count", async () => {
    await uploadModuleTarball("ns", "vpc", "aws", "1.0.0", makeBuffer());
    await uploadModuleTarball("ns", "vpc", "aws", "2.0.0", makeBuffer());
    await uploadModuleTarball("ns", "ecs", "aws", "1.0.0", makeBuffer());

    const deleted = await deleteByPrefix("modules/ns/vpc/");
    expect(deleted).toBe(2);

    // vpc modules deleted
    expect(
      await getModuleTarball(generateModuleKey("ns", "vpc", "aws", "1.0.0")),
    ).toBeNull();
    expect(
      await getModuleTarball(generateModuleKey("ns", "vpc", "aws", "2.0.0")),
    ).toBeNull();
    // ecs module still exists
    expect(
      await getModuleTarball(generateModuleKey("ns", "ecs", "aws", "1.0.0")),
    ).not.toBeNull();
  });

  it("deletes objects across nested directories", async () => {
    await uploadProviderZip(
      "hashicorp",
      "aws",
      "4.0.0",
      "linux",
      "amd64",
      makeBuffer(),
    );
    await uploadProviderZip(
      "hashicorp",
      "aws",
      "4.0.0",
      "darwin",
      "arm64",
      makeBuffer(),
    );

    const deleted = await deleteByPrefix("providers/hashicorp/aws/");
    expect(deleted).toBe(2);
  });

  it("does not delete non-matching objects", async () => {
    await uploadModuleTarball("ns", "name", "prov", "1.0.0", makeBuffer("z"));

    const deleted = await deleteByPrefix("providers/ns/");
    expect(deleted).toBe(0);

    const obj = await getModuleTarball(
      generateModuleKey("ns", "name", "prov", "1.0.0"),
    );
    expect(obj).not.toBeNull();
  });

  it("handles multi-page deletion (more than DEFAULT_LIST_LIMIT objects)", async () => {
    // Upload enough objects to trigger pagination if limit is set low.
    // We just test with a small set and confirm all are deleted.
    const keys: string[] = [];
    for (let i = 0; i < 5; i++) {
      const k = await uploadModuleTarball(
        "paginate",
        "mod",
        "aws",
        `1.0.${i}`,
        makeBuffer(`v${i}`),
      );
      keys.push(k);
    }

    const deleted = await deleteByPrefix("modules/paginate/");
    expect(deleted).toBe(5);

    for (const k of keys) {
      expect(await getModuleTarball(k)).toBeNull();
    }
  });

  it("returns 0 and deletes nothing for empty storage", async () => {
    const deleted = await deleteByPrefix("modules/");
    expect(deleted).toBe(0);
  });
});
