import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { systemSettings } from "@/db/schema";

// ============================================================================
// Constants
// ============================================================================

export const SIGNUP_ENABLED_KEY = "signup_enabled";

// ============================================================================
// Signup Settings
// ============================================================================

/**
 * Check if public signup is enabled.
 * Defaults to true if the key is not set in the DB (safe default: open registry).
 */
export async function isSignupEnabled(): Promise<boolean> {
  try {
    const db = getDb();
    const setting = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, SIGNUP_ENABLED_KEY))
      .get();

    if (!setting) return true; // default open
    return setting.value === "true";
  } catch (error) {
    console.error("[Settings] Error reading signup status:", error);
    return true; // fail-open: don't block signups on DB error
  }
}

/**
 * Enable or disable public signup.
 */
export async function setSignupEnabled(enabled: boolean): Promise<void> {
  const db = getDb();
  await db
    .insert(systemSettings)
    .values({ key: SIGNUP_ENABLED_KEY, value: enabled.toString() })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value: enabled.toString(), updatedAt: new Date() },
    });
}

// ============================================================================
// Generic Settings
// ============================================================================

/**
 * Get a single setting by key. Returns defaultValue if not found.
 */
export async function getSystemSetting(
  key: string,
  defaultValue?: string,
): Promise<string | undefined> {
  const db = getDb();
  const setting = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, key))
    .get();

  return setting?.value ?? defaultValue;
}

/**
 * Set (upsert) a setting.
 */
export async function setSystemSetting(
  key: string,
  value: string,
): Promise<void> {
  const db = getDb();
  await db
    .insert(systemSettings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value, updatedAt: new Date() },
    });
}

/**
 * Get all settings as a key→value map.
 */
export async function getSystemSettings(): Promise<Record<string, string>> {
  const db = getDb();
  const rows = await db.select().from(systemSettings);

  return rows.reduce<Record<string, string>>((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});
}
