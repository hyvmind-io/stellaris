import "server-only";

import { cookies } from "next/headers";
import { THEME_COOKIE_NAME } from "@/lib/theme/cookie-name";

/**
 * Theme cookie (PRD-02). Mirrors the per-user theme preference so SSR can emit
 * the correct `data-theme` on the first paint without a DB round-trip on every
 * request, and so anonymous visitors keep a chosen theme.
 *
 * NOT httpOnly: the client `ThemeAttributeProvider` reads/writes it for the
 * optimistic update path. The value is always validated against the compiled
 * manifest before it is applied (02-304), so a tampered cookie can at most
 * select another *compiled* theme — never inject markup or an unknown value.
 *
 * The cookie NAME lives in lib/theme/cookie-name.ts so client code can import
 * it without pulling in this `server-only` module.
 */
export { THEME_COOKIE_NAME };

/** One year — themes are a durable preference, not a session artifact. */
const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Read the raw theme cookie value (unvalidated). */
export async function getThemeCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(THEME_COOKIE_NAME)?.value ?? null;
}

/** Persist the theme cookie. */
export async function setThemeCookie(theme: string): Promise<void> {
  const store = await cookies();
  store.set(THEME_COOKIE_NAME, theme, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: THEME_COOKIE_MAX_AGE,
  });
}

/** Remove the theme cookie (e.g. when a user clears their preference). */
export async function clearThemeCookie(): Promise<void> {
  const store = await cookies();
  store.delete(THEME_COOKIE_NAME);
}
