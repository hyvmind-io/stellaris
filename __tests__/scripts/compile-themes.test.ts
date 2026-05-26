import { describe, it, expect } from "vitest";
import {
  compileThemes,
  parseThemeSource,
  renderThemeCss,
  type ParsedSource,
} from "@/lib/theme/compile";
import {
  toHslChannels,
  toHex,
  hexToHslChannels,
  hslChannelsToHex,
  isHex,
  isHslChannels,
} from "@/lib/theme/normalize";
import { DEFAULT_LIGHT } from "@/lib/theme/defaults";
import type { TokenMap } from "@/lib/theme/schema";

// ============================================================================
// Fixtures
// ============================================================================

/** A complete, valid core token map (all required HSL-channel tokens). */
const coreTokens = (overrides: Partial<TokenMap> = {}): TokenMap => ({
  background: "#ffffff",
  foreground: "210 20% 12%",
  card: "#ffffff",
  "card-foreground": "210 20% 12%",
  popover: "#ffffff",
  "popover-foreground": "210 20% 12%",
  primary: "#0A66C2",
  "primary-foreground": "#ffffff",
  secondary: "210 16% 93%",
  "secondary-foreground": "210 20% 12%",
  muted: "210 16% 95%",
  "muted-foreground": "210 12% 40%",
  accent: "#0A66C2",
  "accent-foreground": "#ffffff",
  destructive: "#C0392B",
  "destructive-foreground": "#ffffff",
  border: "210 16% 88%",
  input: "210 16% 88%",
  ring: "#0A66C2",
  ...overrides,
});

const yamlSource = (body: string): ParsedSource => ({
  file: "themes/test.yaml",
  content: body,
  format: "yaml",
});

const jsoncSource = (body: string): ParsedSource => ({
  file: "themes/test.jsonc",
  content: body,
  format: "jsonc",
});

const validYaml = `
name: ocean
label: Ocean Blue
light:
  background: "#ffffff"
  foreground: "210 20% 12%"
  card: "#ffffff"
  card-foreground: "210 20% 12%"
  popover: "#ffffff"
  popover-foreground: "210 20% 12%"
  primary: "#0A66C2"
  primary-foreground: "#ffffff"
  secondary: "210 16% 93%"
  secondary-foreground: "210 20% 12%"
  muted: "210 16% 95%"
  muted-foreground: "210 12% 40%"
  accent: "#0A66C2"
  accent-foreground: "#ffffff"
  destructive: "#C0392B"
  destructive-foreground: "#ffffff"
  border: "210 16% 88%"
  input: "210 16% 88%"
  ring: "#0A66C2"
dark:
  background: "210 30% 8%"
  foreground: "#f5f7fa"
  card: "210 28% 11%"
  card-foreground: "#f5f7fa"
  popover: "210 28% 11%"
  popover-foreground: "#f5f7fa"
  primary: "#4C9AFF"
  primary-foreground: "210 30% 8%"
  secondary: "210 20% 18%"
  secondary-foreground: "#f5f7fa"
  muted: "210 20% 18%"
  muted-foreground: "210 12% 60%"
  accent: "#4C9AFF"
  accent-foreground: "210 30% 8%"
  destructive: "#FF6B6B"
  destructive-foreground: "210 30% 8%"
  border: "210 20% 20%"
  input: "210 20% 20%"
  ring: "#4C9AFF"
`;

// ============================================================================
// Color normalization (hex⇄HSL)
// ============================================================================

describe("normalize: format detection", () => {
  it("detects hex (#rgb and #rrggbb)", () => {
    expect(isHex("#fff")).toBe(true);
    expect(isHex("#0A66C2")).toBe(true);
    expect(isHex(" #abc ")).toBe(true);
    expect(isHex("210 20% 12%")).toBe(false);
    expect(isHex("not-a-color")).toBe(false);
  });

  it("detects HSL channels", () => {
    expect(isHslChannels("210 20% 12%")).toBe(true);
    expect(isHslChannels("0 0% 100%")).toBe(true);
    expect(isHslChannels("#fff")).toBe(false);
    expect(isHslChannels("210 20 12")).toBe(false); // missing %
  });
});

describe("normalize: hex → HSL channels", () => {
  it("converts pure colors", () => {
    expect(hexToHslChannels("#ffffff")).toBe("0 0% 100%");
    expect(hexToHslChannels("#000000")).toBe("0 0% 0%");
    expect(hexToHslChannels("#ff0000")).toBe("0 100% 50%");
    expect(hexToHslChannels("#00ff00")).toBe("120 100% 50%");
    expect(hexToHslChannels("#0000ff")).toBe("240 100% 50%");
  });

  it("expands #rgb shorthand", () => {
    expect(hexToHslChannels("#fff")).toBe("0 0% 100%");
    expect(hexToHslChannels("#f00")).toBe("0 100% 50%");
  });

  it("rounds to integer channels", () => {
    const out = hexToHslChannels("#0A66C2");
    expect(out).toMatch(/^\d+ \d+% \d+%$/);
  });
});

describe("normalize: HSL channels → hex", () => {
  it("converts pure colors", () => {
    expect(hslChannelsToHex("0 0% 100%")).toBe("#ffffff");
    expect(hslChannelsToHex("0 0% 0%")).toBe("#000000");
    expect(hslChannelsToHex("0 100% 50%")).toBe("#ff0000");
    expect(hslChannelsToHex("120 100% 50%")).toBe("#00ff00");
    expect(hslChannelsToHex("240 100% 50%")).toBe("#0000ff");
  });
});

describe("normalize: toHslChannels / toHex accept either input", () => {
  it("toHslChannels passes through HSL and converts hex", () => {
    expect(toHslChannels("210 20% 12%")).toBe("210 20% 12%");
    expect(toHslChannels("#ffffff")).toBe("0 0% 100%");
  });

  it("toHex passes through hex and converts HSL", () => {
    expect(toHex("#0A66C2")).toBe("#0a66c2");
    expect(toHex("0 0% 100%")).toBe("#ffffff");
  });

  it("round-trips hex → HSL → hex within rounding tolerance", () => {
    const hsl = hexToHslChannels("#268bd2");
    const back = hslChannelsToHex(hsl);
    const channel = (hex: string, i: number) =>
      parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
    for (let i = 0; i < 3; i++) {
      expect(Math.abs(channel(back, i) - channel("#268bd2", i))).toBeLessThanOrEqual(3);
    }
  });

  it("throws on unrecognized values", () => {
    expect(() => toHslChannels("rgb(1,2,3)")).toThrow();
    expect(() => toHex("teal")).toThrow();
  });
});

// ============================================================================
// Parsing (YAML & JSONC)
// ============================================================================

describe("parseThemeSource", () => {
  it("parses valid YAML", () => {
    const def = parseThemeSource(yamlSource(validYaml));
    expect(def.name).toBe("ocean");
    expect(def.label).toBe("Ocean Blue");
    expect(def.light.primary).toBe("#0A66C2");
  });

  it("parses JSONC with comments and trailing commas", () => {
    const json = `{
      // a comment
      "name": "corp",
      "light": ${JSON.stringify(coreTokens())},
      "dark": ${JSON.stringify(coreTokens())}, // trailing comma
    }`;
    const def = parseThemeSource(jsoncSource(json));
    expect(def.name).toBe("corp");
  });

  it("rejects invalid theme name (injection guard 02-302)", () => {
    const bad = validYaml.replace("name: ocean", 'name: "Bad Name!"');
    expect(() => parseThemeSource(yamlSource(bad))).toThrow();
  });

  it("rejects a theme missing required core tokens", () => {
    const json = `{ "name": "x", "light": { "background": "#fff" }, "dark": { "background": "#000" } }`;
    expect(() => parseThemeSource(jsoncSource(json))).toThrow();
  });
});

// ============================================================================
// renderThemeCss
// ============================================================================

describe("renderThemeCss", () => {
  it("emits light selector and dark selector with the theme name", () => {
    const css = renderThemeCss("ocean", coreTokens(), coreTokens());
    expect(css).toContain(':root[data-theme="ocean"] {');
    expect(css).toContain(':root[data-theme="ocean"].dark {');
    expect(css).toContain("--background:");
    expect(css).toContain("--ring:");
  });

  it("prefixes selectors with :root so they outrank the built-in default (PRD-02 deployment-wide bug)", () => {
    // `:root` (built-in light) and a bare `[data-theme]` are both specificity
    // (0,1,0) — a tie that globals.css's @import order resolves AGAINST the
    // custom theme. The `:root` prefix raises the light selector to (0,2,0) and
    // the dark selector to (0,3,0) so the active custom theme always wins.
    const css = renderThemeCss("ocean", coreTokens(), coreTokens());
    // Every emitted selector must carry the :root prefix.
    const selectorLines = css
      .split("\n")
      .filter((l) => l.includes("data-theme"));
    expect(selectorLines.length).toBe(2);
    for (const line of selectorLines) {
      expect(line.startsWith(":root[data-theme=")).toBe(true);
    }
    // And specifically must NOT emit a bare (tie-prone) attribute selector.
    expect(css).not.toContain('\n[data-theme="ocean"]');
  });

  it("normalizes hex core tokens to HSL channels", () => {
    const css = renderThemeCss(
      "ocean",
      coreTokens({ background: "#ffffff" }),
      coreTokens(),
    );
    expect(css).toContain("--background: 0 0% 100%;");
  });

  it("emits accent palette as hex and shadows verbatim", () => {
    const withOptional = coreTokens({
      "accent-palette": { cyan: "200 100% 40%" },
      shadows: { glow: "0 0 10px red" },
      brand: { primary: "#abcdef" },
    });
    const css = renderThemeCss("ocean", withOptional, coreTokens());
    expect(css).toContain("--theme-cyan: #0088cc;");
    expect(css).toContain("--shadow-glow: 0 0 10px red;");
    expect(css).toContain("--brand-primary: #abcdef;");
  });

  it("throws on an invalid color value (skip-on-error upstream)", () => {
    expect(() =>
      renderThemeCss("ocean", coreTokens({ background: "nonsense" }), coreTokens()),
    ).toThrow();
  });
});

// ============================================================================
// compileThemes (end-to-end pure logic)
// ============================================================================

describe("compileThemes", () => {
  it("always includes the built-in default in the manifest first", () => {
    const result = compileThemes([]);
    expect(result.themes[0]).toEqual({
      name: "default",
      label: expect.stringContaining("Default"),
    });
    expect(result.manifest).toContain('name: "default"');
    expect(result.manifest).toContain("export const THEMES");
  });

  it("compiles a valid YAML theme into CSS + manifest", () => {
    const result = compileThemes([yamlSource(validYaml)]);
    expect(result.themes.map((t) => t.name)).toEqual(["default", "ocean"]);
    expect(result.css).toContain(':root[data-theme="ocean"] {');
    expect(result.css).toContain(':root[data-theme="ocean"].dark {');
    expect(result.manifest).toContain('name: "ocean"');
    expect(result.manifest).toContain('label: "Ocean Blue"');
  });

  it("compiles YAML and JSONC together", () => {
    const json = `{ "name": "corp", "light": ${JSON.stringify(coreTokens())}, "dark": ${JSON.stringify(coreTokens())} }`;
    const result = compileThemes([
      yamlSource(validYaml),
      jsoncSource(json),
    ]);
    expect(result.themes.map((t) => t.name).sort()).toEqual(
      ["corp", "default", "ocean"].sort(),
    );
  });

  it("skips an invalid theme with a warning and continues (02-106)", () => {
    const broken = jsoncSource(`{ "name": "BROKEN!!", "light": {}, "dark": {} }`);
    const result = compileThemes([broken, yamlSource(validYaml)]);
    expect(result.warnings.some((w) => w.message.startsWith("skipping"))).toBe(
      true,
    );
    // valid one still compiled; default still present
    expect(result.themes.map((t) => t.name)).toEqual(["default", "ocean"]);
  });

  it("skips a theme with an invalid color value, never emitting partial CSS (02-301)", () => {
    const json = `{ "name": "bad", "light": ${JSON.stringify(
      coreTokens({ background: "totally-not-a-color" }),
    )}, "dark": ${JSON.stringify(coreTokens())} }`;
    const result = compileThemes([jsoncSource(json)]);
    expect(result.themes.map((t) => t.name)).toEqual(["default"]);
    expect(result.css).not.toContain('[data-theme="bad"]');
    expect(result.warnings.some((w) => w.message.includes("skipping"))).toBe(
      true,
    );
  });

  it("inherits built-in default values for omitted optional groups (02-303)", () => {
    const result = compileThemes([yamlSource(validYaml)]);
    const inheritWarn = result.warnings.find((w) =>
      w.message.includes("inherits built-in default"),
    );
    expect(inheritWarn).toBeDefined();
    expect(inheritWarn!.message).toContain("accent-palette");
    // The inherited accent palette must appear in the emitted CSS.
    const expectedCyan = toHex(DEFAULT_LIGHT["accent-palette"]!.cyan!);
    expect(result.css).toContain(`--theme-cyan: ${expectedCyan};`);
  });

  it("handles duplicate names deterministically (last-wins, warns 02-110)", () => {
    const first = yamlSource(validYaml);
    const second = yamlSource(
      validYaml.replace("label: Ocean Blue", "label: Ocean Two"),
    );
    const result = compileThemes([first, second]);
    expect(result.themes.filter((t) => t.name === "ocean")).toHaveLength(1);
    const ocean = result.themes.find((t) => t.name === "ocean");
    expect(ocean!.label).toBe("Ocean Two");
    expect(result.warnings.some((w) => w.message.includes("duplicate"))).toBe(
      true,
    );
  });

  it("rejects a theme that reuses the reserved 'default' name", () => {
    const json = `{ "name": "default", "light": ${JSON.stringify(coreTokens())}, "dark": ${JSON.stringify(coreTokens())} }`;
    const result = compileThemes([jsoncSource(json)]);
    expect(result.themes.map((t) => t.name)).toEqual(["default"]);
    expect(result.warnings.some((w) => w.message.includes("reserved"))).toBe(
      true,
    );
  });

  it("titleizes the label when none is supplied", () => {
    const json = `{ "name": "corp-blue", "light": ${JSON.stringify(coreTokens())}, "dark": ${JSON.stringify(coreTokens())} }`;
    const result = compileThemes([jsoncSource(json)]);
    const entry = result.themes.find((t) => t.name === "corp-blue");
    expect(entry!.label).toBe("Corp Blue");
  });
});
