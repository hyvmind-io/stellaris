import { describe, it, expect } from "vitest";
import { resolveTheme, BUILT_IN_DEFAULT } from "@/lib/theme/resolve";

/**
 * Regression coverage for the PRD-02 deployment-wide theming bug. The pure
 * resolver decides the active `data-theme` value; the cascade fix (the `:root`
 * prefix on generated selectors) is covered in compile-themes.test.ts. Together
 * they prove: override OFF + default="corp" → resolves "corp" AND the generated
 * CSS for "corp" actually wins over the built-in default.
 */

const known = new Set(["default", "corp", "solarized"]);

describe("resolveTheme — override disabled (deployment-wide default)", () => {
  it("forces the system default and IGNORES the user/cookie theme (02-206)", () => {
    expect(
      resolveTheme({
        userTheme: "solarized",
        cookieTheme: "solarized",
        defaultTheme: "corp",
        overrideAllowed: false,
        knownThemes: known,
      }),
    ).toBe("corp");
  });

  it("falls back to the built-in default when the configured default is unknown", () => {
    expect(
      resolveTheme({
        userTheme: "corp",
        cookieTheme: "corp",
        defaultTheme: "ghost-theme",
        overrideAllowed: false,
        knownThemes: known,
      }),
    ).toBe(BUILT_IN_DEFAULT);
  });
});

describe("resolveTheme — override enabled (per-user precedence)", () => {
  it("prefers the user theme, then cookie, then default", () => {
    expect(
      resolveTheme({
        userTheme: "corp",
        cookieTheme: "solarized",
        defaultTheme: "default",
        overrideAllowed: true,
        knownThemes: known,
      }),
    ).toBe("corp");

    expect(
      resolveTheme({
        userTheme: null,
        cookieTheme: "solarized",
        defaultTheme: "default",
        overrideAllowed: true,
        knownThemes: known,
      }),
    ).toBe("solarized");

    expect(
      resolveTheme({
        userTheme: null,
        cookieTheme: null,
        defaultTheme: "corp",
        overrideAllowed: true,
        knownThemes: known,
      }),
    ).toBe("corp");
  });

  it("skips unknown candidates and never emits a stale value (02-208 / 02-304)", () => {
    expect(
      resolveTheme({
        userTheme: "deleted-theme",
        cookieTheme: "also-gone",
        defaultTheme: "corp",
        overrideAllowed: true,
        knownThemes: known,
      }),
    ).toBe("corp");
  });
});
