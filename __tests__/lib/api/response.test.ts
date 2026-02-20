import { describe, it, expect } from "vitest";
import {
  jsonResponse,
  noContentResponse,
  binaryResponse,
  textResponse,
  moduleDownloadResponse,
} from "@/lib/api/response";

// ============================================================================
// jsonResponse
// ============================================================================

describe("jsonResponse", () => {
  it("defaults to status 200", () => {
    const response = jsonResponse({ ok: true });
    expect(response.status).toBe(200);
  });

  it("uses the provided status code", () => {
    const response = jsonResponse({ created: true }, 201);
    expect(response.status).toBe(201);
  });

  it("serializes the data to JSON", async () => {
    const data = { id: 1, name: "vpc", version: "1.0.0" };
    const body = await jsonResponse(data).json();
    expect(body).toEqual(data);
  });

  it("sets Content-Type to application/json", () => {
    const response = jsonResponse({});
    expect(response.headers.get("Content-Type")).toContain("application/json");
  });

  it("handles null data", async () => {
    const body = await jsonResponse(null).json();
    expect(body).toBeNull();
  });

  it("handles array data", async () => {
    const data = [1, 2, 3];
    const body = await jsonResponse(data).json();
    expect(body).toEqual(data);
  });

  it("handles deeply nested objects", async () => {
    const data = { a: { b: { c: "deep" } } };
    const body = await jsonResponse(data).json();
    expect(body).toEqual(data);
  });

  it("works with status 404", () => {
    const response = jsonResponse({ errors: ["Not found"] }, 404);
    expect(response.status).toBe(404);
  });

  it("works with status 500", () => {
    const response = jsonResponse({ errors: ["Server error"] }, 500);
    expect(response.status).toBe(500);
  });
});

// ============================================================================
// noContentResponse
// ============================================================================

describe("noContentResponse", () => {
  it("returns status 204", () => {
    const response = noContentResponse({});
    expect(response.status).toBe(204);
  });

  it("has a null/empty body", async () => {
    const response = noContentResponse({});
    const text = await response.text();
    expect(text).toBe("");
  });

  it("passes custom headers through to the response", () => {
    const headers = {
      "X-Terraform-Get": "https://example.com/module.tar.gz",
      "Cache-Control": "no-store",
    };
    const response = noContentResponse(headers);
    expect(response.headers.get("X-Terraform-Get")).toBe(
      "https://example.com/module.tar.gz",
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("passes a single custom header", () => {
    const response = noContentResponse({ "X-Custom": "value" });
    expect(response.headers.get("X-Custom")).toBe("value");
  });

  it("accepts empty headers object", () => {
    const response = noContentResponse({});
    expect(response.status).toBe(204);
  });
});

// ============================================================================
// binaryResponse
// ============================================================================

describe("binaryResponse", () => {
  it("returns status 200", () => {
    const response = binaryResponse(null, "application/octet-stream");
    expect(response.status).toBe(200);
  });

  it("sets the provided content type", () => {
    const response = binaryResponse(null, "application/zip");
    expect(response.headers.get("Content-Type")).toBe("application/zip");
  });

  it("does not set Content-Disposition when filename is not provided", () => {
    const response = binaryResponse(null, "application/octet-stream");
    expect(response.headers.get("Content-Disposition")).toBeNull();
  });

  it("sets Content-Disposition attachment header when filename is provided", () => {
    const response = binaryResponse(
      null,
      "application/zip",
      "terraform-provider-aws_4.0.0_linux_amd64.zip",
    );
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="terraform-provider-aws_4.0.0_linux_amd64.zip"',
    );
  });

  it("quotes the filename in Content-Disposition", () => {
    const response = binaryResponse(null, "application/zip", "myfile.zip");
    const disposition = response.headers.get("Content-Disposition") ?? "";
    expect(disposition).toMatch(/^attachment; filename="myfile\.zip"$/);
  });

  it("works with application/octet-stream content type", () => {
    const response = binaryResponse(
      null,
      "application/octet-stream",
      "module.tar.gz",
    );
    expect(response.headers.get("Content-Type")).toBe(
      "application/octet-stream",
    );
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="module.tar.gz"',
    );
  });

  it("accepts an ArrayBuffer body", () => {
    const buffer = new ArrayBuffer(8);
    const response = binaryResponse(buffer, "application/octet-stream");
    expect(response.status).toBe(200);
  });

  it("sanitizes dangerous characters from filename in Content-Disposition", () => {
    const response = binaryResponse(
      null,
      "application/zip",
      'evil"; X-Inject: bad',
    );
    const disposition = response.headers.get("Content-Disposition") ?? "";
    // Quotes, semicolons, colons, and spaces should be replaced with underscores
    expect(disposition).toBe('attachment; filename="evil___X-Inject__bad"');
    // Extract filename value and verify no injected special characters survive
    const filenameMatch = disposition.match(/filename="(.+)"$/);
    expect(filenameMatch?.[1]).toBe("evil___X-Inject__bad");
    expect(filenameMatch?.[1]).not.toMatch(/[";:\s]/);
  });

  it("preserves safe characters (dots, hyphens, underscores) in filename", () => {
    const response = binaryResponse(
      null,
      "application/zip",
      "provider_aws-4.0.0.zip",
    );
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="provider_aws-4.0.0.zip"',
    );
  });
});

// ============================================================================
// textResponse
// ============================================================================

describe("textResponse", () => {
  it("returns status 200", () => {
    const response = textResponse("hello");
    expect(response.status).toBe(200);
  });

  it("defaults Content-Type to text/plain", () => {
    const response = textResponse("hello");
    expect(response.headers.get("Content-Type")).toBe("text/plain");
  });

  it("uses the provided content type when specified", () => {
    const response = textResponse(
      "sha256:abc123\n",
      "text/plain; charset=utf-8",
    );
    expect(response.headers.get("Content-Type")).toBe(
      "text/plain; charset=utf-8",
    );
  });

  it("preserves the body text", async () => {
    const response = textResponse("hello world");
    const text = await response.text();
    expect(text).toBe("hello world");
  });

  it("works with multiline text", async () => {
    const body = "line1\nline2\nline3";
    const response = textResponse(body);
    expect(await response.text()).toBe(body);
  });

  it("works with an empty string body", async () => {
    const response = textResponse("");
    expect(await response.text()).toBe("");
  });

  it("accepts custom MIME type for SHA sums file", () => {
    const response = textResponse(
      "abc123  file.zip\n",
      "text/plain; charset=utf-8",
    );
    expect(response.headers.get("Content-Type")).toBe(
      "text/plain; charset=utf-8",
    );
  });
});

// ============================================================================
// moduleDownloadResponse
// ============================================================================

describe("moduleDownloadResponse", () => {
  it("returns status 200", () => {
    const response = moduleDownloadResponse("/v1/modules/tarball/abc.tar.gz");
    expect(response.status).toBe(200);
  });

  it("sets X-Terraform-Get header to the location", () => {
    const location = "/v1/modules/tarball/abc.tar.gz";
    const response = moduleDownloadResponse(location);
    expect(response.headers.get("X-Terraform-Get")).toBe(location);
  });

  it("sets Content-Type to application/json", () => {
    const response = moduleDownloadResponse("/v1/modules/tarball/abc.tar.gz");
    expect(response.headers.get("Content-Type")).toBe("application/json");
  });

  it("returns JSON body with location field matching the header value", async () => {
    const location = "/v1/modules/tarball/abc.tar.gz";
    const response = moduleDownloadResponse(location);
    const body = await response.json();
    expect(body).toEqual({ location });
  });

  it("encodes a realistic tarball path correctly", async () => {
    const location = "/v1/modules/tarball/hashicorp/consul/aws/0.1.0.tar.gz";
    const response = moduleDownloadResponse(location);
    expect(response.headers.get("X-Terraform-Get")).toBe(location);
    const body = await response.json();
    expect(body).toEqual({ location });
  });
});
