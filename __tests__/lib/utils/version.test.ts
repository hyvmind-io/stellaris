import { describe, it, expect } from "vitest";
import {
  isValidSemver,
  compareVersions,
  sortVersionsDesc,
  normalizeVersion,
} from "@/lib/utils/version";

// ============================================================================
// isValidSemver
// ============================================================================

describe("isValidSemver", () => {
  describe("valid versions", () => {
    it.each([
      ["1.0.0", "basic release"],
      ["0.1.0", "minor version"],
      ["0.0.1", "patch version"],
      ["1.2.3", "all three parts"],
      ["10.20.30", "multi-digit parts"],
      ["1.2.3-alpha", "pre-release: single identifier"],
      ["1.2.3-alpha.1", "pre-release: dotted identifiers"],
      ["1.2.3-0.3.7", "pre-release: numeric identifiers"],
      ["1.2.3-x.7.z.92", "pre-release: mixed identifiers"],
      ["1.0.0-alpha", "pre-release: alpha"],
      ["1.0.0-alpha.1", "pre-release: alpha.1"],
      ["1.0.0-0.3.7", "pre-release: numeric dotted"],
      ["1.0.0-beta", "pre-release: beta"],
      ["1.0.0-beta.11", "pre-release: beta.11"],
      ["1.0.0-rc.1", "pre-release: release candidate"],
      ["1.0.0+build.1", "build metadata"],
      ["1.0.0+20130313144700", "build metadata: timestamp"],
      ["1.0.0-beta+exp.sha.5114f85", "pre-release + build metadata"],
      ["0.0.0", "all zeros"],
      ["999.999.999", "large version numbers"],
    ])("accepts %s (%s)", (version) => {
      expect(isValidSemver(version)).toBe(true);
    });
  });

  describe("invalid versions", () => {
    it.each([
      ["v1.0.0", "leading 'v' prefix"],
      ["1.0", "missing patch segment"],
      ["1.0.0.0", "extra segment"],
      ["abc", "non-numeric string"],
      ["", "empty string"],
      [" 1.0.0", "leading space"],
      ["1.0.0 ", "trailing space"],
      ["01.0.0", "leading zero in major"],
      ["1.01.0", "leading zero in minor"],
      ["1.0.01", "leading zero in patch"],
      ["-1.0.0", "negative major"],
      ["1.0.0-", "empty pre-release"],
      ["1.0.0+", "empty build metadata"],
      ["1.2.three", "non-numeric patch"],
      ["1..0", "double dot"],
    ])("rejects %s (%s)", (version) => {
      expect(isValidSemver(version)).toBe(false);
    });
  });
});

// ============================================================================
// compareVersions
// ============================================================================

describe("compareVersions", () => {
  describe("equal versions", () => {
    it("returns 0 for identical versions", () => {
      expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    });

    it("returns 0 for identical multi-digit versions", () => {
      expect(compareVersions("2.10.5", "2.10.5")).toBe(0);
    });
  });

  describe("a greater than b", () => {
    it("returns 1 when major is greater", () => {
      expect(compareVersions("2.0.0", "1.0.0")).toBe(1);
    });

    it("returns 1 when minor is greater", () => {
      expect(compareVersions("1.2.0", "1.1.0")).toBe(1);
    });

    it("returns 1 when patch is greater", () => {
      expect(compareVersions("1.0.2", "1.0.1")).toBe(1);
    });

    it("returns 1 when major differs despite smaller minor/patch", () => {
      expect(compareVersions("2.0.0", "1.9.9")).toBe(1);
    });

    it("returns 1 for multi-digit version parts", () => {
      expect(compareVersions("1.10.0", "1.9.0")).toBe(1);
    });
  });

  describe("a less than b", () => {
    it("returns -1 when major is lesser", () => {
      expect(compareVersions("1.0.0", "2.0.0")).toBe(-1);
    });

    it("returns -1 when minor is lesser", () => {
      expect(compareVersions("1.1.0", "1.2.0")).toBe(-1);
    });

    it("returns -1 when patch is lesser", () => {
      expect(compareVersions("1.0.1", "1.0.2")).toBe(-1);
    });

    it("returns -1 when major differs despite larger minor/patch", () => {
      expect(compareVersions("1.9.9", "2.0.0")).toBe(-1);
    });

    it("returns -1 for multi-digit version parts", () => {
      expect(compareVersions("1.9.0", "1.10.0")).toBe(-1);
    });
  });

  describe("pre-release precedence (semver §11)", () => {
    it("pre-release < release with same core: 1.0.0-alpha < 1.0.0", () => {
      expect(compareVersions("1.0.0-alpha", "1.0.0")).toBe(-1);
    });

    it("release > pre-release with same core: 1.0.0 > 1.0.0-rc.1", () => {
      expect(compareVersions("1.0.0", "1.0.0-rc.1")).toBe(1);
    });

    it("compares pre-release identifiers lexically: alpha < beta", () => {
      expect(compareVersions("1.0.0-alpha", "1.0.0-beta")).toBe(-1);
    });

    it("compares pre-release identifiers lexically: beta > alpha", () => {
      expect(compareVersions("1.0.0-beta", "1.0.0-alpha")).toBe(1);
    });

    it("numeric pre-release < alphanumeric: 1 < alpha", () => {
      expect(compareVersions("1.0.0-1", "1.0.0-alpha")).toBe(-1);
    });

    it("compares dotted pre-release identifiers left-to-right", () => {
      expect(compareVersions("1.0.0-alpha.1", "1.0.0-alpha.2")).toBe(-1);
    });

    it("more pre-release fields > fewer: alpha.1 > alpha", () => {
      expect(compareVersions("1.0.0-alpha.1", "1.0.0-alpha")).toBe(1);
    });

    it("rc.1 > beta.11", () => {
      expect(compareVersions("1.0.0-rc.1", "1.0.0-beta.11")).toBe(1);
    });

    it("ignores build metadata in comparison", () => {
      expect(compareVersions("1.0.0+build.1", "1.0.0+build.2")).toBe(0);
      expect(
        compareVersions("1.0.0-alpha+build.1", "1.0.0-alpha+build.999"),
      ).toBe(0);
    });
  });
});

// ============================================================================
// sortVersionsDesc
// ============================================================================

describe("sortVersionsDesc", () => {
  it("sorts versions newest first", () => {
    const versions = ["1.0.0", "2.0.0", "1.5.0"];
    expect(sortVersionsDesc(versions)).toEqual(["2.0.0", "1.5.0", "1.0.0"]);
  });

  it("handles patch-level ordering correctly", () => {
    const versions = ["1.0.1", "1.0.3", "1.0.2"];
    expect(sortVersionsDesc(versions)).toEqual(["1.0.3", "1.0.2", "1.0.1"]);
  });

  it("handles minor-level ordering correctly", () => {
    const versions = ["1.1.0", "1.3.0", "1.2.0"];
    expect(sortVersionsDesc(versions)).toEqual(["1.3.0", "1.2.0", "1.1.0"]);
  });

  it("returns a new array and does not mutate the original", () => {
    const versions = ["1.0.0", "3.0.0", "2.0.0"];
    const original = [...versions];
    sortVersionsDesc(versions);
    expect(versions).toEqual(original);
  });

  it("returns empty array unchanged", () => {
    expect(sortVersionsDesc([])).toEqual([]);
  });

  it("returns single-element array unchanged", () => {
    expect(sortVersionsDesc(["1.2.3"])).toEqual(["1.2.3"]);
  });

  it("handles already-sorted descending input", () => {
    const versions = ["3.0.0", "2.0.0", "1.0.0"];
    expect(sortVersionsDesc(versions)).toEqual(["3.0.0", "2.0.0", "1.0.0"]);
  });

  it("handles mixed major, minor, patch differences", () => {
    const versions = ["0.1.0", "1.0.0", "0.2.0", "2.0.0", "0.1.1"];
    expect(sortVersionsDesc(versions)).toEqual([
      "2.0.0",
      "1.0.0",
      "0.2.0",
      "0.1.1",
      "0.1.0",
    ]);
  });

  it("sorts pre-release below release with same core: [2.0.0, 1.0.0, 1.0.0-alpha]", () => {
    const result = sortVersionsDesc(["1.0.0-alpha", "1.0.0", "2.0.0"]);
    expect(result).toEqual(["2.0.0", "1.0.0", "1.0.0-alpha"]);
  });
});

// ============================================================================
// normalizeVersion
// ============================================================================

describe("normalizeVersion", () => {
  it("strips a leading lowercase 'v' prefix", () => {
    expect(normalizeVersion("v1.0.0")).toBe("1.0.0");
  });

  it("strips a leading uppercase 'V' prefix", () => {
    expect(normalizeVersion("V1.0.0")).toBe("1.0.0");
  });

  it("returns versions without a v prefix unchanged", () => {
    expect(normalizeVersion("1.0.0")).toBe("1.0.0");
  });

  it("handles pre-release suffixes after the v prefix", () => {
    expect(normalizeVersion("v1.2.3-alpha.1")).toBe("1.2.3-alpha.1");
  });

  it("handles build metadata after the v prefix", () => {
    expect(normalizeVersion("v1.0.0+build.1")).toBe("1.0.0+build.1");
  });

  it("only strips one leading v (vv1.0.0 → v1.0.0)", () => {
    expect(normalizeVersion("vv1.0.0")).toBe("v1.0.0");
  });

  it("returns empty string for a bare 'v'", () => {
    expect(normalizeVersion("v")).toBe("");
  });
});
