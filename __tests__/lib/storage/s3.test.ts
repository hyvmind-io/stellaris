import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mock @aws-sdk/client-s3 BEFORE importing S3Backend
// ============================================================================

const mockSend = vi.fn();

vi.mock("@aws-sdk/client-s3", () => ({
  // Must use function (not arrow) so `new S3Client()` works
  S3Client: vi.fn(function () {
    return { send: mockSend };
  }),
  PutObjectCommand: vi.fn(function (params: Record<string, unknown>) {
    return { ...params, _type: "Put" };
  }),
  GetObjectCommand: vi.fn(function (params: Record<string, unknown>) {
    return { ...params, _type: "Get" };
  }),
  DeleteObjectCommand: vi.fn(function (params: Record<string, unknown>) {
    return { ...params, _type: "DeleteOne" };
  }),
  DeleteObjectsCommand: vi.fn(function (params: Record<string, unknown>) {
    return { ...params, _type: "DeleteMany" };
  }),
  ListObjectsV2Command: vi.fn(function (params: Record<string, unknown>) {
    return { ...params, _type: "List" };
  }),
}));

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { S3Backend } from "@/lib/storage/s3";

// ============================================================================
// Helpers
// ============================================================================

/** Build a minimal SdkStream mock for GetObjectCommand responses. */
function makeSdkStream(content: string) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(content);
  return {
    transformToWebStream: () =>
      new ReadableStream({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      }),
    transformToString: () => Promise.resolve(content),
    transformToByteArray: () => Promise.resolve(bytes),
  };
}

// ============================================================================
// Setup
// ============================================================================

beforeEach(() => {
  vi.stubEnv("S3_BUCKET", "test-bucket");
  vi.stubEnv("S3_REGION", "us-east-1");
  vi.stubEnv("S3_ACCESS_KEY_ID", "AKIATEST");
  vi.stubEnv("S3_SECRET_ACCESS_KEY", "testsecret");
  mockSend.mockReset();
  vi.mocked(S3Client).mockClear();
  vi.mocked(PutObjectCommand).mockClear();
  vi.mocked(GetObjectCommand).mockClear();
  vi.mocked(DeleteObjectCommand).mockClear();
  vi.mocked(DeleteObjectsCommand).mockClear();
  vi.mocked(ListObjectsV2Command).mockClear();
});

// ============================================================================
// Constructor
// ============================================================================

describe("S3Backend — constructor", () => {
  it("creates an S3Client with the configured credentials", () => {
    new S3Backend();
    expect(S3Client).toHaveBeenCalledWith(
      expect.objectContaining({
        region: "us-east-1",
        credentials: {
          accessKeyId: "AKIATEST",
          secretAccessKey: "testsecret",
        },
      }),
    );
  });

  it("throws when S3_BUCKET is missing", () => {
    vi.stubEnv("S3_BUCKET", "");
    expect(() => new S3Backend()).toThrow(/S3_BUCKET/);
  });

  it("throws when S3_REGION is missing", () => {
    vi.stubEnv("S3_REGION", "");
    expect(() => new S3Backend()).toThrow(/S3_REGION/);
  });

  it("throws when S3_ACCESS_KEY_ID is missing", () => {
    vi.stubEnv("S3_ACCESS_KEY_ID", "");
    expect(() => new S3Backend()).toThrow(/S3_ACCESS_KEY_ID/);
  });

  it("throws when S3_SECRET_ACCESS_KEY is missing", () => {
    vi.stubEnv("S3_SECRET_ACCESS_KEY", "");
    expect(() => new S3Backend()).toThrow(/S3_SECRET_ACCESS_KEY/);
  });

  it("error message lists all missing variables", () => {
    vi.stubEnv("S3_BUCKET", "");
    vi.stubEnv("S3_REGION", "");
    expect(() => new S3Backend()).toThrow(
      /S3_BUCKET.*S3_REGION|S3_REGION.*S3_BUCKET/,
    );
  });

  it("does not throw when all required env vars are set", () => {
    expect(() => new S3Backend()).not.toThrow();
  });

  it("passes endpoint to S3Client when S3_ENDPOINT is set", () => {
    vi.stubEnv("S3_ENDPOINT", "https://minio.example.com");
    new S3Backend();
    expect(S3Client).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "https://minio.example.com",
      }),
    );
  });

  it("sets forcePathStyle when S3_FORCE_PATH_STYLE=true", () => {
    vi.stubEnv("S3_FORCE_PATH_STYLE", "true");
    new S3Backend();
    expect(S3Client).toHaveBeenCalledWith(
      expect.objectContaining({ forcePathStyle: true }),
    );
  });
});

// ============================================================================
// put()
// ============================================================================

describe("S3Backend — put()", () => {
  it("sends PutObjectCommand with correct Bucket and Key for string data", async () => {
    mockSend.mockResolvedValue({});
    const backend = new S3Backend();
    await backend.put("ns/name/aws/1.0.0.tar.gz", "content");

    expect(PutObjectCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: "test-bucket",
        Key: "ns/name/aws/1.0.0.tar.gz",
        Body: "content",
      }),
    );
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it("sends PutObjectCommand with correct ContentType and Metadata from options", async () => {
    mockSend.mockResolvedValue({});
    const backend = new S3Backend();
    await backend.put("providers/ns/aws/4.0.0/file.zip", "data", {
      httpMetadata: { contentType: "application/zip" },
      customMetadata: { namespace: "ns", type: "aws" },
    });

    expect(PutObjectCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        ContentType: "application/zip",
        Metadata: { namespace: "ns", type: "aws" },
      }),
    );
  });

  it("converts ArrayBuffer to Uint8Array before sending", async () => {
    mockSend.mockResolvedValue({});
    const backend = new S3Backend();
    const bytes = new Uint8Array([1, 2, 3]);
    await backend.put("data.bin", bytes.buffer as ArrayBuffer);

    expect(PutObjectCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        Body: expect.any(Uint8Array),
      }),
    );
    const call = vi.mocked(PutObjectCommand).mock.calls[0]![0] as {
      Body: Uint8Array;
    };
    expect(Array.from(call.Body)).toEqual([1, 2, 3]);
  });

  it("drains ReadableStream to Uint8Array before sending", async () => {
    mockSend.mockResolvedValue({});
    const backend = new S3Backend();
    const encoder = new TextEncoder();
    const bytes = encoder.encode("streamed");
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });

    await backend.put("stream.txt", stream);

    expect(PutObjectCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        Body: expect.any(Uint8Array),
      }),
    );
    const call = vi.mocked(PutObjectCommand).mock.calls[0]![0] as {
      Body: Uint8Array;
    };
    expect(new TextDecoder().decode(call.Body)).toBe("streamed");
  });

  it("sends PutObjectCommand without ContentType when not specified", async () => {
    mockSend.mockResolvedValue({});
    const backend = new S3Backend();
    await backend.put("simple.txt", "no content type");

    expect(PutObjectCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        ContentType: undefined,
      }),
    );
  });
});

// ============================================================================
// get()
// ============================================================================

describe("S3Backend — get()", () => {
  it("returns a StorageObject with body, text(), arrayBuffer() when found", async () => {
    const sdkStream = makeSdkStream("hello from s3");
    mockSend.mockResolvedValue({ Body: sdkStream });
    const backend = new S3Backend();

    const result = await backend.get("some/key.txt");

    expect(result).not.toBeNull();
    expect(result!.body).toBeInstanceOf(ReadableStream);
    expect(await result!.text()).toBe("hello from s3");
  });

  it("returns correct arrayBuffer() content", async () => {
    const sdkStream = makeSdkStream("arraybuffer content");
    mockSend.mockResolvedValue({ Body: sdkStream });
    const backend = new S3Backend();

    const result = await backend.get("key.txt");
    expect(result).not.toBeNull();
    const ab = await result!.arrayBuffer();
    expect(new TextDecoder().decode(ab)).toBe("arraybuffer content");
  });

  it("sends GetObjectCommand with correct Bucket and Key", async () => {
    mockSend.mockResolvedValue({ Body: makeSdkStream("data") });
    const backend = new S3Backend();
    await backend.get("ns/name/aws/1.0.0.tar.gz");

    expect(GetObjectCommand).toHaveBeenCalledWith({
      Bucket: "test-bucket",
      Key: "ns/name/aws/1.0.0.tar.gz",
    });
  });

  it("returns null when S3 throws NoSuchKey error", async () => {
    const error = new Error("NoSuchKey");
    error.name = "NoSuchKey";
    mockSend.mockRejectedValue(error);
    const backend = new S3Backend();

    const result = await backend.get("nonexistent.txt");
    expect(result).toBeNull();
  });

  it("returns null when Body is falsy", async () => {
    mockSend.mockResolvedValue({ Body: null });
    const backend = new S3Backend();

    const result = await backend.get("empty.txt");
    expect(result).toBeNull();
  });

  it("re-throws non-NoSuchKey errors", async () => {
    const error = new Error("Access Denied");
    error.name = "AccessDenied";
    mockSend.mockRejectedValue(error);
    const backend = new S3Backend();

    await expect(backend.get("secret.txt")).rejects.toThrow("Access Denied");
  });

  it("provides a body ReadableStream via transformToWebStream", async () => {
    const sdkStream = makeSdkStream("stream body");
    mockSend.mockResolvedValue({ Body: sdkStream });
    const backend = new S3Backend();

    const result = await backend.get("stream-key.txt");
    expect(result).not.toBeNull();
    const reader = result!.body.getReader();
    const { value } = await reader.read();
    expect(new TextDecoder().decode(value)).toBe("stream body");
  });
});

// ============================================================================
// delete()
// ============================================================================

describe("S3Backend — delete()", () => {
  it("sends DeleteObjectCommand for a single key (string form)", async () => {
    mockSend.mockResolvedValue({});
    const backend = new S3Backend();
    await backend.delete("ns/name/aws/1.0.0.tar.gz");

    expect(DeleteObjectCommand).toHaveBeenCalledWith({
      Bucket: "test-bucket",
      Key: "ns/name/aws/1.0.0.tar.gz",
    });
    expect(DeleteObjectsCommand).not.toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it("sends DeleteObjectCommand for a single-element array", async () => {
    mockSend.mockResolvedValue({});
    const backend = new S3Backend();
    await backend.delete(["solo.txt"]);

    expect(DeleteObjectCommand).toHaveBeenCalledTimes(1);
    expect(DeleteObjectsCommand).not.toHaveBeenCalled();
  });

  it("sends DeleteObjectsCommand for multiple keys", async () => {
    mockSend.mockResolvedValue({});
    const backend = new S3Backend();
    await backend.delete(["key-a.txt", "key-b.txt", "key-c.txt"]);

    expect(DeleteObjectsCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: "test-bucket",
        Delete: {
          Objects: [
            { Key: "key-a.txt" },
            { Key: "key-b.txt" },
            { Key: "key-c.txt" },
          ],
          Quiet: true,
        },
      }),
    );
    expect(DeleteObjectCommand).not.toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it("batches in chunks of 1000 for large deletes", async () => {
    mockSend.mockResolvedValue({});
    const backend = new S3Backend();
    const keys = Array.from({ length: 2500 }, (_, i) => `key-${i}.txt`);
    await backend.delete(keys);

    // 2500 keys → 3 batches (1000 + 1000 + 500)
    expect(DeleteObjectsCommand).toHaveBeenCalledTimes(3);
    expect(mockSend).toHaveBeenCalledTimes(3);
  });

  it("skips sending when given empty array", async () => {
    mockSend.mockResolvedValue({});
    const backend = new S3Backend();
    await backend.delete([]);

    expect(mockSend).not.toHaveBeenCalled();
  });
});

// ============================================================================
// list()
// ============================================================================

describe("S3Backend — list()", () => {
  it("sends ListObjectsV2Command with Bucket", async () => {
    mockSend.mockResolvedValue({
      Contents: [],
      IsTruncated: false,
    });
    const backend = new S3Backend();
    await backend.list();

    expect(ListObjectsV2Command).toHaveBeenCalledWith(
      expect.objectContaining({ Bucket: "test-bucket" }),
    );
  });

  it("returns correct objects from S3 response", async () => {
    mockSend.mockResolvedValue({
      Contents: [
        { Key: "ns/vpc/aws/1.0.0.tar.gz" },
        { Key: "ns/ecs/aws/1.0.0.tar.gz" },
      ],
      IsTruncated: false,
    });
    const backend = new S3Backend();
    const result = await backend.list();

    expect(result.objects).toHaveLength(2);
    expect(result.objects[0]).toEqual({
      key: "ns/vpc/aws/1.0.0.tar.gz",
    });
    expect(result.objects[1]).toEqual({
      key: "ns/ecs/aws/1.0.0.tar.gz",
    });
    expect(result.truncated).toBe(false);
    expect(result.cursor).toBeUndefined();
  });

  it("returns truncated=true and cursor when S3 response has IsTruncated", async () => {
    mockSend.mockResolvedValue({
      Contents: [{ Key: "file-1.txt" }, { Key: "file-2.txt" }],
      IsTruncated: true,
      NextContinuationToken: "next-page-token",
    });
    const backend = new S3Backend();
    const result = await backend.list({ limit: 2 });

    expect(result.truncated).toBe(true);
    expect(result.cursor).toBe("next-page-token");
  });

  it("does not set cursor when not truncated", async () => {
    mockSend.mockResolvedValue({
      Contents: [{ Key: "only-file.txt" }],
      IsTruncated: false,
      NextContinuationToken: "should-not-appear",
    });
    const backend = new S3Backend();
    const result = await backend.list();

    expect(result.truncated).toBe(false);
    expect(result.cursor).toBeUndefined();
  });

  it("passes Prefix option to ListObjectsV2Command", async () => {
    mockSend.mockResolvedValue({ Contents: [], IsTruncated: false });
    const backend = new S3Backend();
    await backend.list({ prefix: "ns/" });

    expect(ListObjectsV2Command).toHaveBeenCalledWith(
      expect.objectContaining({ Prefix: "ns/" }),
    );
  });

  it("passes ContinuationToken (cursor) to ListObjectsV2Command", async () => {
    mockSend.mockResolvedValue({ Contents: [], IsTruncated: false });
    const backend = new S3Backend();
    await backend.list({ cursor: "my-cursor-token" });

    expect(ListObjectsV2Command).toHaveBeenCalledWith(
      expect.objectContaining({ ContinuationToken: "my-cursor-token" }),
    );
  });

  it("passes MaxKeys (limit) to ListObjectsV2Command", async () => {
    mockSend.mockResolvedValue({ Contents: [], IsTruncated: false });
    const backend = new S3Backend();
    await backend.list({ limit: 50 });

    expect(ListObjectsV2Command).toHaveBeenCalledWith(
      expect.objectContaining({ MaxKeys: 50 }),
    );
  });

  it("handles empty Contents gracefully", async () => {
    mockSend.mockResolvedValue({ Contents: undefined, IsTruncated: false });
    const backend = new S3Backend();
    const result = await backend.list();

    expect(result.objects).toHaveLength(0);
    expect(result.truncated).toBe(false);
  });
});
