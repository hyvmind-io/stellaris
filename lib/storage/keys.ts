/**
 * Generate an R2 key for a module tarball.
 * Format: modules/{namespace}/{name}/{provider}/{version}.tar.gz
 */
export function generateModuleKey(
  namespace: string,
  name: string,
  provider: string,
  version: string,
): string {
  return `modules/${namespace}/${name}/${provider}/${version}.tar.gz`;
}

/**
 * Generate an R2 key for a provider zip archive.
 * Format: providers/{namespace}/{type}/{version}/terraform-provider-{type}_{version}_{os}_{arch}.zip
 */
export function generateProviderKey(
  namespace: string,
  type: string,
  version: string,
  os: string,
  arch: string,
): string {
  return `providers/${namespace}/${type}/${version}/terraform-provider-${type}_${version}_${os}_${arch}.zip`;
}

/**
 * Parse an R2 key back into its components.
 * Inverse of generateModuleKey().
 *
 * Format: modules/{namespace}/{name}/{provider}/{version}.tar.gz
 *
 * Returns null if the key does not match the expected format.
 */
export function parseModuleKey(key: string): {
  namespace: string;
  name: string;
  provider: string;
  version: string;
} | null {
  const parts = key.split("/");
  if (
    parts.length !== 5 ||
    parts[0] !== "modules" ||
    !parts[4]?.endsWith(".tar.gz")
  ) {
    return null;
  }
  return {
    // Safe: length === 5 check above guarantees all indices exist
    namespace: parts[1]!,
    name: parts[2]!,
    provider: parts[3]!,
    version: parts[4]!.slice(0, -".tar.gz".length),
  };
}
