import { describe, it, expect } from "vitest";
import { escapeLike } from "@/lib/utils/sql";

describe("escapeLike", () => {
  it("returns plain strings unchanged", () => {
    expect(escapeLike("hello")).toBe("hello");
    expect(escapeLike("vpc-module")).toBe("vpc-module");
  });

  it("escapes percent sign", () => {
    expect(escapeLike("100%")).toBe("100\\%");
  });

  it("escapes underscore", () => {
    expect(escapeLike("my_module")).toBe("my\\_module");
  });

  it("escapes backslash", () => {
    expect(escapeLike("path\\to")).toBe("path\\\\to");
  });

  it("escapes multiple special chars", () => {
    expect(escapeLike("100%_of\\the")).toBe("100\\%\\_of\\\\the");
  });

  it("returns empty string for empty input", () => {
    expect(escapeLike("")).toBe("");
  });

  it("handles only special chars", () => {
    expect(escapeLike("%_%")).toBe("\\%\\_\\%");
  });

  it("escapes backslash before percent/underscore (order matters)", () => {
    expect(escapeLike("\\%")).toBe("\\\\\\%");
  });
});
