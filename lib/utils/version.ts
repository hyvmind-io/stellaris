const SEMVER_REGEX =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

/**
 * Check if a string is a valid semver version.
 */
export function isValidSemver(version: string): boolean {
  return SEMVER_REGEX.test(version);
}

/**
 * Compare two semver strings.
 * Returns: -1 if a < b, 0 if a == b, 1 if a > b.
 * Only compares major.minor.patch (ignores pre-release).
 */
export function compareVersions(a: string, b: string): number {
  const aParts = a.split("-")[0].split(".").map(Number);
  const bParts = b.split("-")[0].split(".").map(Number);

  for (let i = 0; i < 3; i++) {
    const aPart = aParts[i] ?? 0;
    const bPart = bParts[i] ?? 0;
    if (aPart > bPart) return 1;
    if (aPart < bPart) return -1;
  }
  return 0;
}

/**
 * Sort versions in descending order (newest first).
 */
export function sortVersionsDesc(versions: string[]): string[] {
  return [...versions].sort((a, b) => compareVersions(b, a));
}
