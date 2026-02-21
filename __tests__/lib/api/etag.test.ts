import { describe, it, expect } from "vitest";
import {
  makeEtag,
  parseIfMatch,
  parseIfNoneMatch,
  parseRequiredIfMatch,
} from "@/lib/api/etag";
import { NextRequest } from "next/server";

// ============================================================================
// Helpers
// ============================================================================

/** Build a NextRequest with a specific header set. */
function requestWithHeader(
  headerName: string,
  headerValue: string,
): NextRequest {
  return new NextRequest("http://localhost/api/test", {
    headers: { [headerName]: headerValue },
  });
}

/** Build a NextRequest with no custom headers. */
function bareRequest(): NextRequest {
  return new NextRequest("http://localhost/api/test");
}

// ============================================================================
// makeEtag
// ============================================================================

describe("makeEtag", () => {
  it("produces a weak ETag from a revision number", () => {
    expect(makeEtag(1)).toBe('W/"1"');
  });

  it("works with zero", () => {
    expect(makeEtag(0)).toBe('W/"0"');
  });

  it("works with large numbers", () => {
    expect(makeEtag(999999)).toBe('W/"999999"');
  });
});

// ============================================================================
// parseIfMatch
// ============================================================================

describe("parseIfMatch", () => {
  it("returns null when header is missing", () => {
    expect(parseIfMatch(bareRequest())).toBeNull();
  });

  it('parses weak ETag format: W/"3"', () => {
    const req = requestWithHeader("If-Match", 'W/"3"');
    expect(parseIfMatch(req)).toBe(3);
  });

  it('parses strong ETag format: "3"', () => {
    const req = requestWithHeader("If-Match", '"3"');
    expect(parseIfMatch(req)).toBe(3);
  });

  it("parses bare numeric string: 3", () => {
    const req = requestWithHeader("If-Match", "3");
    expect(parseIfMatch(req)).toBe(3);
  });

  it("parses zero revision", () => {
    const req = requestWithHeader("If-Match", 'W/"0"');
    expect(parseIfMatch(req)).toBe(0);
  });

  it("returns null for non-numeric value", () => {
    const req = requestWithHeader("If-Match", 'W/"abc"');
    expect(parseIfMatch(req)).toBeNull();
  });

  it("returns null for negative number", () => {
    const req = requestWithHeader("If-Match", 'W/"-1"');
    expect(parseIfMatch(req)).toBeNull();
  });

  it("returns null for floating point number", () => {
    const req = requestWithHeader("If-Match", 'W/"1.5"');
    expect(parseIfMatch(req)).toBeNull();
  });

  it("returns null for empty string value", () => {
    const req = requestWithHeader("If-Match", "");
    expect(parseIfMatch(req)).toBeNull();
  });

  it("returns null for wildcard (*)", () => {
    const req = requestWithHeader("If-Match", "*");
    expect(parseIfMatch(req)).toBeNull();
  });

  it("returns null for multiple ETags", () => {
    const req = requestWithHeader("If-Match", 'W/"3", W/"4"');
    expect(parseIfMatch(req)).toBeNull();
  });

  it("handles value with internal whitespace after stripping quotes", () => {
    // HTTP headers auto-trim leading/trailing whitespace,
    // but test that our trimming handles any residual spaces
    const req = requestWithHeader("If-Match", 'W/" 5 "');
    // " 5 " after quote removal → " 5 " trimmed → "5" → 5
    expect(parseIfMatch(req)).toBe(5);
  });
});

describe("parseRequiredIfMatch", () => {
  it("returns missing when header is absent", () => {
    expect(parseRequiredIfMatch(bareRequest())).toEqual({
      ok: false,
      reason: "missing",
    });
  });

  it("returns invalid when header is malformed", () => {
    const req = requestWithHeader("If-Match", "invalid");
    expect(parseRequiredIfMatch(req)).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("returns parsed revision when header is valid", () => {
    const req = requestWithHeader("If-Match", 'W/"12"');
    expect(parseRequiredIfMatch(req)).toEqual({ ok: true, revision: 12 });
  });
});

// ============================================================================
// parseIfNoneMatch
// ============================================================================

describe("parseIfNoneMatch", () => {
  it("returns null when header is missing", () => {
    expect(parseIfNoneMatch(bareRequest())).toBeNull();
  });

  it('parses weak ETag format: W/"7"', () => {
    const req = requestWithHeader("If-None-Match", 'W/"7"');
    expect(parseIfNoneMatch(req)).toBe(7);
  });

  it("parses bare numeric string", () => {
    const req = requestWithHeader("If-None-Match", "42");
    expect(parseIfNoneMatch(req)).toBe(42);
  });

  it("returns null for non-numeric value", () => {
    const req = requestWithHeader("If-None-Match", "latest");
    expect(parseIfNoneMatch(req)).toBeNull();
  });
});
