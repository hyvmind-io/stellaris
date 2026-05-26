/**
 * Theme cookie name (PRD-02). Isolated from lib/theme/cookie.ts (which is
 * `server-only`) so client components — the optimistic ThemeAttributeProvider —
 * can import just the constant without pulling in next/headers.
 */
export const THEME_COOKIE_NAME = "stlr_theme";

/**
 * localStorage key mirrored on every theme change to broadcast it across tabs.
 * The browser `storage` event fires in OTHER tabs (not the originating one) only
 * for localStorage/sessionStorage writes — cookies don't trigger it — so the
 * provider mirrors the active theme here purely to drive cross-tab sync.
 */
export const THEME_STORAGE_KEY = "stlr_theme_sync";
