const SEMVER_REGEX =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

/**
 * Check if a string is a valid semver version (strict — no v-prefix).
 * Used for runtime validation and assertions. Production input normalization
 * (v-prefix stripping) happens at the Zod schema boundary in lib/validation/registry.ts.
 */
export function isValidSemver(version: string): boolean {
  return SEMVER_REGEX.test(version);
}

/**
 * Compare two semver strings per semver spec §11.
 * Returns: -1 if a < b, 0 if a == b, 1 if a > b.
 *
 * Precedence rules:
 *   1. Compare major, minor, patch numerically.
 *   2. Pre-release has LOWER precedence than release: 1.0.0-alpha < 1.0.0
 *   3. When both have pre-release, compare dot-separated identifiers left-to-right:
 *      - All-numeric identifiers compared numerically.
 *      - Alphanumeric identifiers compared lexically (ASCII sort order).
 *      - Numeric < alphanumeric (e.g., "1" < "alpha").
 *      - Larger set of fields > smaller set (1.0.0-alpha.1 > 1.0.0-alpha).
 *   4. Build metadata (+) is ignored for comparison.
 */
export function compareVersions(a: string, b: string): number {
  // Strip build metadata (everything after '+')
  const aNoBuild = a.split("+")[0]!;
  const bNoBuild = b.split("+")[0]!;

  // Split into core and optional pre-release at the first '-'
  const aDashIdx = aNoBuild.indexOf("-");
  const bDashIdx = bNoBuild.indexOf("-");

  const aCoreStr = aDashIdx >= 0 ? aNoBuild.slice(0, aDashIdx) : aNoBuild;
  const bCoreStr = bDashIdx >= 0 ? bNoBuild.slice(0, bDashIdx) : bNoBuild;
  const aPreStr = aDashIdx >= 0 ? aNoBuild.slice(aDashIdx + 1) : "";
  const bPreStr = bDashIdx >= 0 ? bNoBuild.slice(bDashIdx + 1) : "";

  // 1. Compare major.minor.patch numerically
  const aCore = aCoreStr.split(".").map(Number);
  const bCore = bCoreStr.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const aPart = aCore[i] ?? 0;
    const bPart = bCore[i] ?? 0;
    if (aPart > bPart) return 1;
    if (aPart < bPart) return -1;
  }

  // 2. Core equal — compare pre-release presence
  const aHasPre = aPreStr.length > 0;
  const bHasPre = bPreStr.length > 0;
  if (!aHasPre && !bHasPre) return 0;
  if (aHasPre && !bHasPre) return -1; // pre-release < release
  if (!aHasPre && bHasPre) return 1; // release > pre-release

  // 3. Both have pre-release — compare dot-separated identifiers
  const aIds = aPreStr.split(".");
  const bIds = bPreStr.split(".");
  for (let i = 0; i < Math.max(aIds.length, bIds.length); i++) {
    if (i >= aIds.length) return -1; // fewer identifiers → lower precedence
    if (i >= bIds.length) return 1;
    const aId = aIds[i]!;
    const bId = bIds[i]!;
    const aIsNum = /^\d+$/.test(aId);
    const bIsNum = /^\d+$/.test(bId);
    if (aIsNum && bIsNum) {
      const diff = Number(aId) - Number(bId);
      if (diff !== 0) return diff > 0 ? 1 : -1;
    } else if (aIsNum) {
      return -1; // numeric < alphanumeric
    } else if (bIsNum) {
      return 1; // alphanumeric > numeric
    } else {
      const cmp = aId < bId ? -1 : aId > bId ? 1 : 0;
      if (cmp !== 0) return cmp;
    }
  }
  return 0;
}

/**
 * Sort semver strings in descending order (newest first).
 * Uses compareVersions() which fully implements semver §11 precedence rules,
 * including pre-release ordering (e.g., 1.0.0 > 1.0.0-rc.1 > 1.0.0-alpha).
 *
 * Used by: tests, and available as a utility for any code that needs
 * client-side version sorting (DB queries prefer ORDER BY published_at DESC).
 */
export function sortVersionsDesc(versions: string[]): string[] {
  return [...versions].sort((a, b) => compareVersions(b, a));
}

/**
 * Normalize a version string by stripping a leading 'v' or 'V' prefix.
 *
 * OpenTofu and some Terraform providers emit versions with a 'v' prefix
 * (e.g. 'v1.0.0'). This function normalizes them to bare semver ('1.0.0').
 *
 * Note: isValidSemver() intentionally remains strict and does NOT accept
 * v-prefixed versions. In production, normalization happens automatically
 * at the Zod schema boundary via `versionSchema` in lib/validation/registry.ts.
 * This function is exposed separately for use in tests and as a utility for
 * any code outside the Zod validation pipeline.
 */
export function normalizeVersion(version: string): string {
  return version.replace(/^[vV]/, "");
}
