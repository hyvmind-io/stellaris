import type { TokenMap } from "@/lib/theme/schema";

/**
 * Built-in Dracula (dark) / Alucard (light) token values — the canonical default
 * scheme (PRD-02 §1.2). These mirror the `:root` and `.dark` blocks in
 * app/globals.css and serve two roles:
 *
 *  1. Missing-token inheritance (02-303): when a custom theme omits an OPTIONAL
 *     token group, the compiler fills the gap from these values + warns, rather
 *     than emitting partial/broken CSS.
 *  2. The guaranteed fallback `default` theme that is ALWAYS present in the
 *     manifest and applied when `data-theme` is absent or `"default"`.
 *
 * The built-in scheme also remains hardcoded in globals.css `:root`/`.dark` so
 * the app renders correctly even before the generated CSS is loaded. This file
 * is the single source of truth the compiler reads for inheritance.
 */

export const DEFAULT_THEME_NAME = "default";
export const DEFAULT_THEME_LABEL = "Default (Dracula / Alucard)";

/** Alucard — light variant. HSL-channel core tokens + hex accent/brand groups. */
export const DEFAULT_LIGHT: TokenMap = {
  background: "0 0% 96%",
  foreground: "0 0% 12%",
  card: "0 0% 100%",
  "card-foreground": "0 0% 12%",
  popover: "0 0% 100%",
  "popover-foreground": "0 0% 12%",
  primary: "248 51% 54%",
  "primary-foreground": "0 0% 100%",
  secondary: "200 96% 30%",
  "secondary-foreground": "0 0% 100%",
  muted: "240 18% 84%",
  "muted-foreground": "246 24% 48%",
  accent: "341 78% 36%",
  "accent-foreground": "0 0% 100%",
  destructive: "6 65% 48%",
  "destructive-foreground": "0 0% 100%",
  border: "240 10% 85%",
  input: "240 10% 85%",
  ring: "248 51% 54%",
  radius: "0.5rem",
  "accent-palette": {
    background: "#F5F5F5",
    foreground: "#1F1F1F",
    selection: "#CFCFDE",
    comment: "#635D97",
    cyan: "#036A96",
    green: "#14710A",
    orange: "#A34D14",
    pink: "#A3144D",
    purple: "#644AC9",
    red: "#CB3A2A",
    yellow: "#846E15",
    "current-line": "#E8E8EC",
  },
  brand: { primary: "#644AC9", secondary: "#036A96" },
  shadows: {
    glow: "0 0 15px 5px rgba(100, 74, 201, 0.2)",
    "glow-lg": "0 0 25px 10px rgba(100, 74, 201, 0.3)",
    card: "0px 10px 30px rgba(0, 0, 0, 0.1)",
    "card-hover": "0px 15px 35px rgba(0, 0, 0, 0.15)",
  },
  sidebar: {
    background: "0 0% 100%",
    foreground: "0 0% 12%",
    primary: "248 51% 54%",
    "primary-foreground": "0 0% 100%",
    accent: "240 18% 94%",
    "accent-foreground": "0 0% 12%",
    border: "240 10% 90%",
    ring: "248 51% 54%",
  },
  charts: [
    "248 51% 54%",
    "200 96% 30%",
    "341 78% 36%",
    "6 65% 48%",
    "35 70% 40%",
  ],
};

/** Dracula — dark variant. */
export const DEFAULT_DARK: TokenMap = {
  background: "250 15% 15%",
  foreground: "60 30% 96%",
  card: "250 17% 18%",
  "card-foreground": "60 30% 96%",
  popover: "250 15% 20%",
  "popover-foreground": "60 30% 96%",
  primary: "250 100% 75%",
  "primary-foreground": "250 15% 15%",
  secondary: "170 100% 75%",
  "secondary-foreground": "250 15% 15%",
  muted: "250 15% 30%",
  "muted-foreground": "250 25% 55%",
  accent: "330 100% 75%",
  "accent-foreground": "250 15% 15%",
  destructive: "10 100% 75%",
  "destructive-foreground": "250 15% 15%",
  border: "250 15% 30%",
  input: "250 15% 30%",
  ring: "250 100% 75%",
  radius: "0.5rem",
  "accent-palette": {
    background: "#22212C",
    foreground: "#F8F8F2",
    selection: "#454158",
    comment: "#7970A9",
    cyan: "#80FFEA",
    green: "#8AFF80",
    orange: "#FFCA80",
    pink: "#FF80BF",
    purple: "#9580FF",
    red: "#FF9580",
    yellow: "#FFFF80",
    "current-line": "#2A293A",
  },
  brand: { primary: "#9580FF", secondary: "#80FFEA" },
  shadows: {
    glow: "0 0 15px 5px rgba(149, 128, 255, 0.3)",
    "glow-lg": "0 0 25px 10px rgba(149, 128, 255, 0.4)",
    card: "0px 10px 30px rgba(0, 0, 0, 0.3)",
    "card-hover": "0px 15px 35px rgba(0, 0, 0, 0.4)",
  },
  sidebar: {
    background: "250 17% 18%",
    foreground: "60 30% 96%",
    primary: "250 100% 75%",
    "primary-foreground": "250 15% 15%",
    accent: "250 15% 25%",
    "accent-foreground": "60 30% 96%",
    border: "250 15% 30%",
    ring: "250 100% 75%",
  },
  charts: [
    "250 100% 75%",
    "170 100% 75%",
    "330 100% 75%",
    "10 100% 75%",
    "45 100% 75%",
  ],
};
