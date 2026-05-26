import { z } from "zod";

/**
 * Theme definition schema (PRD-02 §4, §5).
 *
 * A theme is a named scheme that defines BOTH a light and a dark variant,
 * mirroring the built-in Dracula (dark) / Alucard (light) pairing. Each variant
 * is a token map. Color values may be authored as hex (`#rgb` / `#rrggbb`) OR
 * HSL channels (`H S% L%`); the compiler normalizes each value to the format the
 * consuming CSS variable expects (see lib/theme/normalize.ts).
 *
 * Validation here is intentionally permissive on the *value* level (any string)
 * because hex⇄HSL normalization + strict color parsing happens in normalize.ts.
 * What this schema guarantees is *structure*: a sanitized name, required core
 * tokens present in both variants, and well-typed optional groups.
 */

// A single color value, validated/normalized downstream by normalizeColor().
const colorValue = z.string().min(1);

/**
 * Required core shadcn HSL-channel tokens (PRD-02 §4.3). Every theme variant
 * MUST declare all of these. Missing-token inheritance (02-303) applies to the
 * OPTIONAL groups only — the core set is mandatory so we never emit a theme
 * with an undefined base color.
 */
export const CORE_TOKEN_KEYS = [
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

export type CoreTokenKey = (typeof CORE_TOKEN_KEYS)[number];

/**
 * Accent palette keys (consumed RAW → emitted as hex). PRD-02 §4.3.
 */
export const ACCENT_PALETTE_KEYS = [
  "background",
  "foreground",
  "selection",
  "comment",
  "cyan",
  "green",
  "orange",
  "pink",
  "purple",
  "red",
  "yellow",
  "current-line",
] as const;

export type AccentPaletteKey = (typeof ACCENT_PALETTE_KEYS)[number];

/**
 * Sidebar keys (HSL-channel tokens, like the core set). PRD-02 §4.3.
 */
export const SIDEBAR_KEYS = [
  "background",
  "foreground",
  "primary",
  "primary-foreground",
  "accent",
  "accent-foreground",
  "border",
  "ring",
] as const;

export type SidebarKey = (typeof SIDEBAR_KEYS)[number];

/**
 * Shadow keys (raw CSS box-shadow strings, passed through verbatim).
 */
export const SHADOW_KEYS = ["glow", "glow-lg", "card", "card-hover"] as const;

export type ShadowKey = (typeof SHADOW_KEYS)[number];

// Build a strongly-typed object schema for the required core tokens.
const coreTokens = z.object(
  Object.fromEntries(CORE_TOKEN_KEYS.map((k) => [k, colorValue])) as Record<
    CoreTokenKey,
    typeof colorValue
  >,
);

/**
 * A single theme variant (light or dark). Required core tokens + optional
 * groups. `.passthrough()` is intentionally NOT used: unknown keys are stripped
 * so a typo in an optional token name surfaces as "missing" (inherits default)
 * rather than silently leaking into the emitted CSS.
 */
export const tokenMapSchema = coreTokens.extend({
  radius: z.string().optional(),
  "accent-palette": z.record(z.string(), colorValue).optional(),
  brand: z
    .object({
      primary: colorValue,
      secondary: colorValue,
    })
    .partial()
    .optional(),
  shadows: z.record(z.string(), z.string()).optional(),
  sidebar: z.record(z.string(), colorValue).optional(),
  charts: z.array(colorValue).max(5).optional(),
});

export type TokenMap = z.infer<typeof tokenMapSchema>;

/**
 * Top-level theme schema. `name` is sanitized to `^[a-z0-9-]+$` (02-302) to
 * prevent CSS/attribute injection via the `data-theme` selector.
 */
export const themeSchema = z.object({
  name: z
    .string()
    .regex(
      /^[a-z0-9-]+$/,
      "theme name must be lowercase alphanumeric/dash (^[a-z0-9-]+$)",
    ),
  label: z.string().optional(),
  light: tokenMapSchema,
  dark: tokenMapSchema,
});

export type ThemeDefinition = z.infer<typeof themeSchema>;
