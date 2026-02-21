import { describe, it, expect, vi } from "vitest";

// ============================================================================
// Mocks — hoisted before any import of the module under test
// ============================================================================

vi.mock("@/db/client", () => ({
  getDb: () => ({}),
}));

vi.mock("@/db/schema", () => ({
  modules: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
  sql: vi.fn(),
  count: vi.fn(),
  inArray: vi.fn(),
}));

vi.mock("@/lib/utils/sql", () => ({
  escapeLike: vi.fn((v: string) => v),
}));

import { parseTags, resolveModuleTags } from "@/lib/data/modules";
import type { Module } from "@/db/schema";

// ============================================================================
// Helpers
// ============================================================================

/** Build a minimal Module object for testing pure helpers. */
function fakeModule(overrides: Partial<Module> = {}): Module {
  return {
    id: 1,
    namespace: "hashicorp",
    name: "consul",
    provider: "aws",
    version: "1.0.0",
    owner: "",
    description: null,
    source: null,
    location: "modules/hashicorp/consul/aws/1.0.0.tar.gz",
    definition: null,
    downloads: 0,
    publishedAt: new Date("2025-01-01"),
    tags: null,
    updatedAt: new Date("2025-01-01"),
    revision: 1,
    ...overrides,
  };
}

// ============================================================================
// parseTags
// ============================================================================

describe("parseTags", () => {
  it("returns null for null input", () => {
    expect(parseTags(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(parseTags(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseTags("")).toBeNull();
  });

  it("parses valid JSON array of strings", () => {
    expect(parseTags('["aws","gcp"]')).toEqual(["aws", "gcp"]);
  });

  it("parses single-element JSON array", () => {
    expect(parseTags('["aws"]')).toEqual(["aws"]);
  });

  it("parses empty JSON array", () => {
    expect(parseTags("[]")).toEqual([]);
  });

  it("wraps invalid JSON (plain text) as single-element array", () => {
    // This is the legacy bug case — bare text like "aws"
    expect(parseTags("aws")).toEqual(["aws"]);
  });

  it("wraps plain text with spaces as single-element array", () => {
    expect(parseTags("some provider")).toEqual(["some provider"]);
  });

  it("handles valid JSON string (quoted) by wrapping in array", () => {
    // A JSON string like '"aws"' (the column contains the quotes)
    expect(parseTags('"aws"')).toEqual(["aws"]);
  });

  it("returns null for JSON array with non-string elements", () => {
    expect(parseTags("[1, 2, 3]")).toBeNull();
  });

  it("returns null for JSON array with mixed types", () => {
    expect(parseTags('["aws", 42]')).toBeNull();
  });

  it("returns null for JSON object", () => {
    expect(parseTags('{"provider":"aws"}')).toBeNull();
  });

  it("returns null for JSON number", () => {
    expect(parseTags("42")).toBeNull();
  });

  it("returns null for JSON boolean", () => {
    expect(parseTags("true")).toBeNull();
  });

  it("returns null for JSON null literal", () => {
    expect(parseTags("null")).toBeNull();
  });
});

// ============================================================================
// resolveModuleTags
// ============================================================================

describe("resolveModuleTags", () => {
  it("returns parsed tags when tags is a valid JSON array", () => {
    const mod = fakeModule({ tags: '["aws","gcp"]' });
    expect(resolveModuleTags(mod)).toEqual(["aws", "gcp"]);
  });

  it("falls back to [provider] when tags is null", () => {
    const mod = fakeModule({ tags: null, provider: "aws" });
    expect(resolveModuleTags(mod)).toEqual(["aws"]);
  });

  it("falls back to [provider] when tags is empty string", () => {
    const mod = fakeModule({ tags: "", provider: "azure" });
    expect(resolveModuleTags(mod)).toEqual(["azure"]);
  });

  it("wraps plain-text tags and returns them (legacy data)", () => {
    const mod = fakeModule({ tags: "aws", provider: "multi" });
    expect(resolveModuleTags(mod)).toEqual(["aws"]);
  });

  it("falls back to [provider] when tags is an invalid JSON structure", () => {
    const mod = fakeModule({ tags: '{"not":"an-array"}', provider: "gcp" });
    expect(resolveModuleTags(mod)).toEqual(["gcp"]);
  });

  it("falls back to [provider] for JSON number in tags", () => {
    const mod = fakeModule({ tags: "42", provider: "aws" });
    expect(resolveModuleTags(mod)).toEqual(["aws"]);
  });

  it("returns empty array from empty JSON array (does NOT fall back)", () => {
    const mod = fakeModule({ tags: "[]", provider: "aws" });
    // Empty array IS a valid parsed result — parseTags returns []
    // which is truthy (non-null), so resolveModuleTags returns it as-is.
    expect(resolveModuleTags(mod)).toEqual([]);
  });
});
