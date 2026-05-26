"use server";

import { revalidatePath } from "next/cache";
import { getAuth } from "@/lib/auth/get-auth";
import { setUserTheme } from "@/lib/data/users";
import {
  getDefaultTheme,
  setDefaultTheme,
  isThemeOverrideAllowed,
  setThemeOverrideAllowed,
} from "@/lib/data/settings";
import { isKnownTheme } from "@/lib/theme/resolve";
import { setThemeCookie, clearThemeCookie } from "@/lib/theme/cookie";

// ============================================================================
// Result Types
// ============================================================================

export interface ThemeActionResult {
  success: boolean;
  error?: string;
  /** The theme that was applied (echoed for optimistic client confirmation). */
  theme?: string;
}

export interface ThemeSettingResult {
  success: boolean;
  error?: string;
  theme?: string;
  allowed?: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Verify the caller is an admin. Mirrors the local gate used in
 * app/actions/admin.ts (returns an error string rather than redirecting, so the
 * client can surface it inline).
 */
async function requireAdmin(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const auth = await getAuth();
  if (!auth) return { ok: false, error: "Not authenticated" };
  if (auth.user.role !== "admin") {
    return { ok: false, error: "Admin access required" };
  }
  return { ok: true };
}

// ============================================================================
// Per-User Theme Selection
// ============================================================================

/**
 * Persist the current user's theme (PRD-02 §6).
 *
 * Rejects when:
 *  - the caller is unauthenticated,
 *  - per-user override is disabled (02-206 — system default is forced), or
 *  - the requested theme is not a compiled manifest theme (02-207 / 02-304).
 *
 * On success the value is written to BOTH the user row (cross-device) and the
 * theme cookie (flash-free SSR mirror).
 */
export async function setUserThemeAction(
  theme: string,
): Promise<ThemeActionResult> {
  try {
    const auth = await getAuth();
    if (!auth) {
      return { success: false, error: "Not authenticated" };
    }

    if (!(await isThemeOverrideAllowed())) {
      return {
        success: false,
        error: "Theme selection is disabled by the administrator",
      };
    }

    if (!isKnownTheme(theme)) {
      return { success: false, error: "Unknown theme" };
    }

    await setUserTheme(auth.user.id, theme);
    await setThemeCookie(theme);

    // Re-render the root layout so SSR `data-theme` + the provider's resolved
    // values stay in sync with the new preference without a manual reload.
    revalidatePath("/", "layout");

    return { success: true, theme };
  } catch (error) {
    console.error("[Theme] setUserThemeAction error:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to set theme",
    };
  }
}

/**
 * Clear the current user's theme preference, reverting to the system default.
 * Removes both the stored value and the cookie mirror.
 */
export async function clearUserThemeAction(): Promise<ThemeActionResult> {
  try {
    const auth = await getAuth();
    if (!auth) {
      return { success: false, error: "Not authenticated" };
    }

    await setUserTheme(auth.user.id, null);
    await clearThemeCookie();

    revalidatePath("/", "layout");

    return { success: true, theme: await getDefaultTheme() };
  } catch (error) {
    console.error("[Theme] clearUserThemeAction error:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to clear theme",
    };
  }
}

// ============================================================================
// Admin Theme Settings
// ============================================================================

/**
 * Set the deployment-wide default theme (admin-gated). The value must be a
 * compiled manifest theme; an unknown value is rejected so the setting can
 * never point at a non-existent theme.
 */
export async function setDefaultThemeAction(
  theme: string,
): Promise<ThemeSettingResult> {
  const check = await requireAdmin();
  if (!check.ok) {
    return { success: false, error: check.error };
  }

  if (!isKnownTheme(theme)) {
    return { success: false, error: "Unknown theme" };
  }

  try {
    await setDefaultTheme(theme);
    // System-wide change: re-render the layout so every subsequent render
    // (and the admin's own view) picks up the new default immediately.
    revalidatePath("/", "layout");
    return { success: true, theme };
  } catch (error) {
    console.error("[Theme] setDefaultThemeAction error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to set default theme",
    };
  }
}

/**
 * Toggle whether users may override the system theme (admin-gated).
 */
export async function setThemeOverrideAllowedAction(
  allowed: boolean,
): Promise<ThemeSettingResult> {
  const check = await requireAdmin();
  if (!check.ok) {
    return { success: false, error: check.error };
  }

  try {
    await setThemeOverrideAllowed(allowed);
    // Toggling override changes the provider's `overrideAllowed` prop (gates the
    // profile picker + the optimistic setTheme path). Revalidate the layout so
    // the profile reflects it without a manual reload.
    revalidatePath("/", "layout");
    return { success: true, allowed };
  } catch (error) {
    console.error("[Theme] setThemeOverrideAllowedAction error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to update theme override setting",
    };
  }
}

// ============================================================================
// Read Helpers (for admin UI hydration)
// ============================================================================

/**
 * Read the current theme settings for the admin panel. Not admin-gated — the
 * admin route already guards access, and these values are non-sensitive.
 */
export async function getThemeSettingsAction(): Promise<{
  defaultTheme: string;
  overrideAllowed: boolean;
}> {
  const [defaultTheme, overrideAllowed] = await Promise.all([
    getDefaultTheme(),
    isThemeOverrideAllowed(),
  ]);
  return { defaultTheme, overrideAllowed };
}
