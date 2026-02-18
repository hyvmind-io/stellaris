import { describe, it, expect } from "vitest";
import { isUniqueConstraintError } from "@/lib/data/errors";

describe("isUniqueConstraintError", () => {
  it("detects D1 UNIQUE constraint failed error", () => {
    const err = new Error(
      "D1_ERROR: UNIQUE constraint failed: modules.namespace, modules.name",
    );
    expect(isUniqueConstraintError(err)).toBe(true);
  });

  it("detects bare SQLite UNIQUE constraint failed error", () => {
    const err = new Error("UNIQUE constraint failed: providers.namespace");
    expect(isUniqueConstraintError(err)).toBe(true);
  });

  it("returns false for other DB errors", () => {
    expect(
      isUniqueConstraintError(new Error("SQLITE_CONSTRAINT_NOTFULL")),
    ).toBe(false);
    expect(isUniqueConstraintError(new Error("Connection timeout"))).toBe(
      false,
    );
    expect(isUniqueConstraintError(new Error("Internal error"))).toBe(false);
  });

  it("handles non-Error objects (string thrown)", () => {
    expect(isUniqueConstraintError("UNIQUE constraint failed: blah")).toBe(
      true,
    );
  });

  it("handles null/undefined", () => {
    expect(isUniqueConstraintError(null)).toBe(false);
    expect(isUniqueConstraintError(undefined)).toBe(false);
  });
});
