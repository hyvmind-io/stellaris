"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { THEMES } from "@/app/generated/themes.manifest";
import {
  setUserThemeAction,
  clearUserThemeAction,
} from "@/app/actions/theme";
import { THEME_COOKIE_NAME, THEME_STORAGE_KEY } from "@/lib/theme/cookie-name";

/**
 * Theme axis provider (PRD-02 §7.2). Owns the `data-theme` attribute on
 * `<html>`, orthogonal to next-themes which owns the light/dark `.dark` class.
 *
 * The initial value is SSR-injected (resolved server-side in app/layout.tsx
 * from the user row / cookie / system default) so the first paint is already
 * correct — no flash (02-305). Switching is optimistic: we update the DOM
 * attribute + the (non-httpOnly) cookie immediately, then persist to the user
 * row via a server action in the background.
 */

interface ThemeAttributeContextValue {
  /** The active theme name (a compiled manifest theme). */
  theme: string;
  /** Whether per-user override is enabled (gates the picker UI). */
  overrideAllowed: boolean;
  /** Apply a theme optimistically + persist. No-op when override is disabled. */
  setTheme: (theme: string) => Promise<void>;
  /** Revert to the system default. */
  clearTheme: () => Promise<void>;
}

const ThemeAttributeContext =
  createContext<ThemeAttributeContextValue | null>(null);

const KNOWN_THEMES: ReadonlySet<string> = new Set(
  THEMES.map((t) => t.name),
);

/** Mirror the cookie client-side for the optimistic path (1-year expiry). */
function writeThemeCookie(theme: string): void {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${THEME_COOKIE_NAME}=${encodeURIComponent(theme)}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax${secure}`;
}

/** Apply the theme to the DOM attribute (no-op server-side). */
function applyThemeAttribute(theme: string): void {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = theme;
  }
}

/**
 * Broadcast a theme change to other tabs. The `storage` event fires only in
 * OTHER tabs, so writing here never re-triggers the listener in this tab — no
 * echo loop. A timestamp suffix guarantees the value changes even when the same
 * theme is re-selected, so the event always fires.
 */
function broadcastTheme(theme: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, `${theme}|${Date.now()}`);
  } catch {
    // localStorage may be unavailable (private mode/quota) — cross-tab sync is
    // a progressive enhancement; the same-tab path still works.
  }
}

export function ThemeAttributeProvider({
  initialTheme,
  overrideAllowed,
  children,
}: {
  initialTheme: string;
  overrideAllowed: boolean;
  children: React.ReactNode;
}) {
  const [theme, setThemeState] = useState(initialTheme);

  const setTheme = useCallback(
    async (next: string) => {
      if (!overrideAllowed) return;
      if (!KNOWN_THEMES.has(next)) return;
      if (next === theme) return;

      // Optimistic: update DOM + cookie + broadcast before the round-trip.
      const previous = theme;
      setThemeState(next);
      applyThemeAttribute(next);
      writeThemeCookie(next);
      broadcastTheme(next);

      const result = await setUserThemeAction(next);
      if (!result.success) {
        // Roll back on rejection (e.g. override turned off between paints).
        setThemeState(previous);
        applyThemeAttribute(previous);
        writeThemeCookie(previous);
        broadcastTheme(previous);
      }
    },
    [overrideAllowed, theme],
  );

  const clearTheme = useCallback(async () => {
    const result = await clearUserThemeAction();
    if (result.success && result.theme) {
      setThemeState(result.theme);
      applyThemeAttribute(result.theme);
      writeThemeCookie(result.theme);
      broadcastTheme(result.theme);
    }
  }, []);

  // Cross-tab sync: when another tab changes the theme it writes
  // THEME_STORAGE_KEY, firing a `storage` event here. Apply it locally (DOM +
  // cookie + state) WITHOUT re-persisting (the originating tab already wrote the
  // DB) and without re-broadcasting (avoids an echo loop).
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== THEME_STORAGE_KEY || !e.newValue) return;
      const next = e.newValue.split("|")[0];
      if (!next || !KNOWN_THEMES.has(next)) return;
      setThemeState((current) => {
        if (current === next) return current;
        applyThemeAttribute(next);
        writeThemeCookie(next);
        return next;
      });
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value = useMemo<ThemeAttributeContextValue>(
    () => ({ theme, overrideAllowed, setTheme, clearTheme }),
    [theme, overrideAllowed, setTheme, clearTheme],
  );

  return (
    <ThemeAttributeContext.Provider value={value}>
      {children}
    </ThemeAttributeContext.Provider>
  );
}

/** Read the active theme axis. Throws if used outside the provider. */
export function useThemeAttribute(): ThemeAttributeContextValue {
  const ctx = useContext(ThemeAttributeContext);
  if (!ctx) {
    throw new Error(
      "useThemeAttribute must be used within ThemeAttributeProvider",
    );
  }
  return ctx;
}
