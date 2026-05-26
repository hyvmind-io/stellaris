import "server-only";

import { THEMES } from "@/app/generated/themes.manifest";
import {
  getDefaultTheme,
  isThemeOverrideAllowed,
} from "@/lib/data/settings";

/**
 * Theme precedence resolver (PRD-02 §5). Determines the active `data-theme`
 * value for a request, validating every candidate against the compiled manifest
 * so an unknown/stale value can never reach the DOM (02-208 / 02-304).
 *
 * Precedence:
 *   - override OFF → forced system default (stored user theme ignored, 02-206)
 *   - override ON  → user theme → cookie theme → system default
 * Any candidate not present in the manifest falls back to the system default;
 * if that too is unknown, the built-in "default" theme (always present).
 */

export const BUILT_IN_DEFAULT = "default";

/** Pure resolver — testable without a DB. */
export function resolveTheme(opts: {
  userTheme?: string | null;
  cookieTheme?: string | null;
  defaultTheme: string;
  overrideAllowed: boolean;
  knownThemes: ReadonlySet<string>;
}): string {
  const { knownThemes } = opts;
  const safeDefault = knownThemes.has(opts.defaultTheme)
    ? opts.defaultTheme
    : BUILT_IN_DEFAULT;

  if (!opts.overrideAllowed) {
    return safeDefault;
  }

  const candidates = [opts.userTheme, opts.cookieTheme, opts.defaultTheme];
  for (const c of candidates) {
    if (c && knownThemes.has(c)) return c;
  }
  return safeDefault;
}

/** The set of compiled theme names (manifest-backed). */
export function getKnownThemes(): ReadonlySet<string> {
  return new Set(THEMES.map((t) => t.name));
}

/** True if `theme` is a compiled, selectable theme. */
export function isKnownTheme(theme: string | null | undefined): boolean {
  return !!theme && getKnownThemes().has(theme);
}

/**
 * Resolve the active theme for a request by reading the system settings and
 * combining them with the supplied user/cookie preferences.
 */
export async function resolveActiveTheme(opts: {
  userTheme?: string | null;
  cookieTheme?: string | null;
}): Promise<string> {
  const [defaultTheme, overrideAllowed] = await Promise.all([
    getDefaultTheme(),
    isThemeOverrideAllowed(),
  ]);

  return resolveTheme({
    userTheme: opts.userTheme,
    cookieTheme: opts.cookieTheme,
    defaultTheme,
    overrideAllowed,
    knownThemes: getKnownThemes(),
  });
}
