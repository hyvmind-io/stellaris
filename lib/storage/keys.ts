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
