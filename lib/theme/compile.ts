import { parse as parseYaml } from "yaml";
import { parse as parseJsonc, type ParseError } from "jsonc-parser";
import {
  themeSchema,
  type ThemeDefinition,
  type TokenMap,
  ACCENT_PALETTE_KEYS,
  SIDEBAR_KEYS,
  SHADOW_KEYS,
} from "@/lib/theme/schema";
import { toHslChannels, toHex, toRgbTriplet } from "@/lib/theme/normalize";
import {
  DEFAULT_THEME_NAME,
  DEFAULT_THEME_LABEL,
  DEFAULT_LIGHT,
  DEFAULT_DARK,
} from "@/lib/theme/defaults";

/**
 * Pure compile logic for the theme compiler (PRD-02 §5). The build script
 * (scripts/compile-themes.ts) wraps these with filesystem I/O; tests exercise
 * them directly. No Node-only APIs are imported here so the module is portable.
 */

export interface ParsedSource {
  /** Filename/identifier for diagnostics (e.g. "themes/corp.yaml"). */
  file: string;
  /** Raw file contents. */
  content: string;
  /** Format hint derived from the extension. */
  format: "yaml" | "jsonc";
}

export interface CompileWarning {
  file: string;
  message: string;
}

export interface CompileResult {
  css: string;
  manifest: string;
  /** Theme names included in the output, in manifest order. */
  themes: { name: string; label: string }[];
  warnings: CompileWarning[];
}

/** Parse one source file into a validated ThemeDefinition or throw. */
export function parseThemeSource(src: ParsedSource): ThemeDefinition {
  let raw: unknown;
  if (src.format === "yaml") {
    raw = parseYaml(src.content);
  } else {
    const errors: ParseError[] = [];
    raw = parseJsonc(src.content, errors, {
      allowTrailingComma: true,
      disallowComments: false,
    });
    if (errors.length > 0) {
      throw new Error(
        `JSONC parse error at offset ${errors[0]!.offset} (code ${errors[0]!.error})`,
      );
    }
  }
  return themeSchema.parse(raw);
}

/** Titleize a kebab/alnum name → "corp-blue" → "Corp Blue". */
function titleize(name: string): string {
  return name
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Merge an authored variant over the built-in default variant so omitted
 * OPTIONAL groups inherit default values (02-303). Core tokens are always
 * required by the schema, so they are taken from the authored map directly.
 * Returns the effective TokenMap plus the list of inherited group names (for
 * warnings).
 */
function applyInheritance(
  authored: TokenMap,
  base: TokenMap,
): { effective: TokenMap; inherited: string[]; derived: string[] } {
  const inherited: string[] = [];
  const derived: string[] = [];
  const effective: TokenMap = { ...authored };

  if (effective.radius === undefined) {
    effective.radius = base.radius;
    inherited.push("radius");
  }
  if (effective["accent-palette"] === undefined) {
    effective["accent-palette"] = base["accent-palette"];
    inherited.push("accent-palette");
  } else {
    // Fill per-key gaps within the palette.
    effective["accent-palette"] = {
      ...base["accent-palette"],
      ...effective["accent-palette"],
    };
  }

  // Brand colors drive the hero gradient + accents. Derive from the theme's
  // OWN primary/secondary (not the built-in Dracula brand) so they always match
  // the active palette; an authored `brand` still wins per-key.
  const derivedBrand = {
    primary: authored.primary,
    secondary: authored.secondary,
  };
  if (effective.brand === undefined) {
    effective.brand = derivedBrand;
    derived.push("brand");
  } else {
    effective.brand = { ...derivedBrand, ...effective.brand };
  }

  // Glow shadows are tinted by the primary color; card shadows are neutral
  // (black) and inherited. Derive glow from the theme's primary so the icon
  // backdrops/glow track the theme instead of the built-in purple.
  const glowRgb = toRgbTriplet(authored.primary);
  const derivedShadows: Record<string, string> = {
    glow: `0 0 15px 5px rgba(${glowRgb}, 0.3)`,
    "glow-lg": `0 0 25px 10px rgba(${glowRgb}, 0.4)`,
  };
  // Card shadows are neutral (black) — keep the built-in values when present.
  if (base.shadows?.card !== undefined) derivedShadows.card = base.shadows.card;
  if (base.shadows?.["card-hover"] !== undefined) {
    derivedShadows["card-hover"] = base.shadows["card-hover"];
  }
  if (effective.shadows === undefined) {
    effective.shadows = derivedShadows;
    derived.push("shadows");
  } else {
    effective.shadows = { ...derivedShadows, ...effective.shadows };
  }

  if (effective.sidebar === undefined) {
    effective.sidebar = base.sidebar;
    inherited.push("sidebar");
  } else {
    effective.sidebar = { ...base.sidebar, ...effective.sidebar };
  }
  if (effective.charts === undefined) {
    effective.charts = base.charts;
    inherited.push("charts");
  }

  return { effective, inherited, derived };
}

const CORE_HSL_KEYS = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "destructive-foreground",
  "border",
  "input",
  "ring",
] as const;

/**
 * Render the CSS custom-property declarations for one effective variant.
 * HSL-channel tokens are normalized to `"H S% L%"`; raw-hex tokens (accent
 * palette, brand) to `#rrggbb`; shadows pass through verbatim; charts are HSL.
 */
function renderVariantVars(tokens: TokenMap, indent: string): string {
  const lines: string[] = [];

  for (const key of CORE_HSL_KEYS) {
    lines.push(`${indent}--${key}: ${toHslChannels(tokens[key])};`);
  }

  if (tokens.radius !== undefined) {
    lines.push(`${indent}--radius: ${tokens.radius};`);
  }

  const palette = tokens["accent-palette"];
  if (palette) {
    for (const key of ACCENT_PALETTE_KEYS) {
      const v = palette[key];
      if (v !== undefined) {
        lines.push(`${indent}--theme-${key}: ${toHex(v)};`);
      }
    }
  }

  if (tokens.brand) {
    if (tokens.brand.primary !== undefined) {
      lines.push(`${indent}--brand-primary: ${toHex(tokens.brand.primary)};`);
    }
    if (tokens.brand.secondary !== undefined) {
      lines.push(
        `${indent}--brand-secondary: ${toHex(tokens.brand.secondary)};`,
      );
    }
  }

  if (tokens.shadows) {
    for (const key of SHADOW_KEYS) {
      const v = tokens.shadows[key];
      if (v !== undefined) {
        lines.push(`${indent}--shadow-${key}: ${v};`);
      }
    }
  }

  if (tokens.sidebar) {
    for (const key of SIDEBAR_KEYS) {
      const v = tokens.sidebar[key];
      if (v !== undefined) {
        lines.push(`${indent}--sidebar-${key}: ${toHslChannels(v)};`);
      }
    }
  }

  if (tokens.charts) {
    tokens.charts.forEach((v, i) => {
      lines.push(`${indent}--chart-${i + 1}: ${toHslChannels(v)};`);
    });
  }

  return lines.join("\n");
}

/**
 * Render the CSS block for a single theme: a light `:root[data-theme="x"]`
 * selector and a dark `:root[data-theme="x"].dark` selector (02-201/02-202).
 *
 * The `:root` prefix is load-bearing: the built-in default in globals.css lives
 * under `:root` (light) and `.dark` (dark). Those carry specificity (0,1,0).
 * A bare `[data-theme="x"]` selector is ALSO (0,1,0) — a tie with `:root` — so
 * the cascade falls back to source order, and because globals.css `@import`s the
 * generated sheet BEFORE its own `:root`/`.dark` blocks, the built-in default
 * would win and the custom theme would never apply (the PRD-02 deployment-wide
 * bug). Prefixing with `:root` raises the light selector to (0,2,0) and the dark
 * selector to (0,3,0), so the active custom theme deterministically beats the
 * built-in default regardless of import order.
 *
 * The built-in `default` theme is NOT emitted here — it lives in globals.css
 * `:root`/`.dark` and applies when `data-theme` is absent or `"default"`.
 */
export function renderThemeCss(
  name: string,
  light: TokenMap,
  dark: TokenMap,
): string {
  return [
    `:root[data-theme="${name}"] {`,
    renderVariantVars(light, "  "),
    `}`,
    ``,
    `:root[data-theme="${name}"].dark {`,
    renderVariantVars(dark, "  "),
    `}`,
  ].join("\n");
}

/**
 * Compile a set of parsed source files into the generated CSS + manifest.
 *
 * Behavior (PRD-02 §5):
 *  - Each source is parsed + zod-validated; on error it is skipped with a
 *    warning and compilation continues (02-106).
 *  - Optional token groups omitted by a theme inherit the built-in default
 *    values (02-303) with a warning.
 *  - Duplicate `name` → last-wins (deterministic), warned (02-110).
 *  - The built-in `default` entry is ALWAYS appended to the manifest and is the
 *    guaranteed fallback (02-209).
 */
export function compileThemes(sources: ParsedSource[]): CompileResult {
  const warnings: CompileWarning[] = [];
  // Preserve insertion order while allowing last-wins on duplicate names.
  const order: string[] = [];
  const byName = new Map<
    string,
    { def: ThemeDefinition; light: TokenMap; dark: TokenMap }
  >();

  for (const src of sources) {
    let def: ThemeDefinition;
    try {
      def = parseThemeSource(src);
    } catch (err) {
      warnings.push({
        file: src.file,
        message: `skipping: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }

    if (def.name === DEFAULT_THEME_NAME) {
      warnings.push({
        file: src.file,
        message: `skipping: "${DEFAULT_THEME_NAME}" is the reserved built-in theme name`,
      });
      continue;
    }

    const lightMerge = applyInheritance(def.light, DEFAULT_LIGHT);
    const darkMerge = applyInheritance(def.dark, DEFAULT_DARK);
    const inherited = [
      ...new Set([...lightMerge.inherited, ...darkMerge.inherited]),
    ];
    if (inherited.length > 0) {
      warnings.push({
        file: src.file,
        message: `theme "${def.name}" inherits built-in default for: ${inherited.join(", ")}`,
      });
    }
    const derived = [
      ...new Set([...lightMerge.derived, ...darkMerge.derived]),
    ];
    if (derived.length > 0) {
      warnings.push({
        file: src.file,
        message: `theme "${def.name}" derives ${derived.join(", ")} from its primary color`,
      });
    }

    // Validate every color now so a bad value skips the WHOLE theme (02-301)
    // rather than emitting partial CSS at write time.
    try {
      renderThemeCss(def.name, lightMerge.effective, darkMerge.effective);
    } catch (err) {
      warnings.push({
        file: src.file,
        message: `skipping: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }

    if (byName.has(def.name)) {
      warnings.push({
        file: src.file,
        message: `duplicate theme name "${def.name}" — last definition wins`,
      });
    } else {
      order.push(def.name);
    }
    byName.set(def.name, {
      def,
      light: lightMerge.effective,
      dark: darkMerge.effective,
    });
  }

  const cssBlocks: string[] = [];
  const manifestThemes: { name: string; label: string }[] = [
    { name: DEFAULT_THEME_NAME, label: DEFAULT_THEME_LABEL },
  ];

  for (const name of order) {
    const entry = byName.get(name)!;
    cssBlocks.push(renderThemeCss(name, entry.light, entry.dark));
    manifestThemes.push({
      name,
      label: entry.def.label ?? titleize(name),
    });
  }

  const css = [
    "/* AUTO-GENERATED by scripts/compile-themes.ts — DO NOT EDIT.",
    " * Source: themes/*.{yaml,jsonc}. Regenerated at prebuild.",
    " * The built-in `default` (Dracula/Alucard) scheme lives in globals.css. */",
    "",
    ...cssBlocks.map((b) => `${b}\n`),
  ]
    .join("\n")
    .trimEnd()
    .concat("\n");

  const manifest = [
    "// AUTO-GENERATED by scripts/compile-themes.ts — DO NOT EDIT.",
    "// Regenerated at prebuild from themes/*.{yaml,jsonc}.",
    "",
    "export interface ThemeManifestEntry {",
    "  name: string;",
    "  label: string;",
    '  modes: readonly ["light", "dark"];',
    "}",
    "",
    "export const THEMES = [",
    ...manifestThemes.map(
      (t) =>
        `  { name: ${JSON.stringify(t.name)}, label: ${JSON.stringify(t.label)}, modes: ["light", "dark"] },`,
    ),
    "] as const satisfies readonly ThemeManifestEntry[];",
    "",
    "export type ThemeName = (typeof THEMES)[number][\"name\"];",
    "",
  ].join("\n");

  return {
    css,
    manifest,
    themes: manifestThemes,
    warnings,
  };
}
