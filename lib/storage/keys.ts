/**
 * Generate an R2 key for a module tarball.
 * Format: {namespace}/{name}/{provider}/{version}.tar.gz
 *
 * The key does NOT include a "modules/" prefix — that prefix belongs only in
 * the URL route structure (/v1/modules/tarball/{key}).
 */
export function generateModuleKey(
  namespace: string,
  name: string,
  provider: string,
  version: string,
): string {
  return `${namespace}/${name}/${provider}/${version}.tar.gz`;
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
 * Format: {namespace}/{name}/{provider}/{version}.tar.gz
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
  if (parts.length !== 4 || !parts[3]?.endsWith(".tar.gz")) {
    return null;
  }
  return {
    // Safe: length === 4 check above guarantees all indices exist
    namespace: parts[0]!,
    name: parts[1]!,
    provider: parts[2]!,
    version: parts[3]!.slice(0, -".tar.gz".length),
  };
}
