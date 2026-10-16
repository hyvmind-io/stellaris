/**
 * Synthetic registry shaped like a real deployment: 22 modules published as
 * 1.0.0 in one batch, then a 1.0.1 of the first one (23 rows, 22 unique), and
 * one provider type with 14 prerelease versions plus 17 more types so the
 * provider list also spans two pages.
 */

const NAMESPACE = "acme";
const OWNER = "platform-team";
const MODULE_TAGS = ["cloudflare", "acme-cloudflare-modules"];

const ts = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

export interface FixtureModule {
  namespace: string;
  name: string;
  provider: string;
  version: string;
  owner: string;
  source: string;
  downloads: number;
  publishedAt: number;
  tags: string[];
}

export interface FixtureProvider {
  namespace: string;
  type: string;
  version: string;
  protocols: string[];
  publishedAt: number;
  platforms: { os: string; arch: string }[];
}

// Publish order, oldest first.
const MODULE_NAMES = [
  "cloudflare-access-application",
  "cloudflare-access-identity-provider",
  "cloudflare-access-policy",
  "cloudflare-access-service-token-readonly",
  "cloudflare-access-service-token",
  "cloudflare-ai-controls-mcp-portal",
  "cloudflare-ai-controls-mcp-server",
  "cloudflare-device-posture-rule",
  "cloudflare-device-profiles",
  "cloudflare-dlp-custom-profile",
  "cloudflare-dlp-predefined-profile",
  "cloudflare-dlp-profiles-combined",
  "cloudflare-dns-record",
  "cloudflare-gateway-list",
  "cloudflare-gateway-policy",
  "cloudflare-r2-bucket-cors",
  "cloudflare-r2-bucket",
  "cloudflare-ruleset",
  "cloudflare-tunnel",
  "cloudflare-workers-custom-domain",
  "cloudflare-zero-trust-access-group",
  "cloudflare-zone",
];

const REPUBLISHED = "cloudflare-zone";

function moduleRow(
  name: string,
  version: string,
  publishedAt: number,
  downloads: number,
): FixtureModule {
  return {
    namespace: NAMESPACE,
    name,
    provider: "cloudflare",
    version,
    owner: OWNER,
    source: `https://github.com/acme/terraform-cloudflare-modules/tree/main/${name}`,
    downloads,
    publishedAt,
    tags: MODULE_TAGS,
  };
}

const batchStart = ts("2026-10-15T20:40:30Z");

export const MODULES: FixtureModule[] = [
  ...MODULE_NAMES.map((name, i) =>
    moduleRow(name, "1.0.0", batchStart + i * 2, name === REPUBLISHED ? 3 : 5),
  ),
  moduleRow(REPUBLISHED, "1.0.1", ts("2026-10-15T20:54:36Z"), 4),
];

const ALL_PLATFORMS = ["darwin", "freebsd", "linux", "windows"].flatMap((os) =>
  ["amd64", "arm64"].map((arch) => ({ os, arch })),
);

const CLOUDFLARE_RELEASES: [string, string][] = [
  ["5.19.1-beta.1", "2026-05-27T01:37:56Z"],
  ["5.19.1-beta.2", "2026-05-29T12:27:39Z"],
  ["5.19.1-beta.3", "2026-05-30T00:05:31Z"],
  ["5.19.1-beta.4", "2026-05-30T15:37:50Z"],
  ["5.19.1-beta.5", "2026-06-03T14:23:00Z"],
  ["5.19.1-beta.6", "2026-07-15T19:30:30Z"],
  ["5.19.1-beta.7", "2026-07-16T13:09:39Z"],
  ["5.22.0-beta.1", "2026-07-16T19:26:31Z"],
  ["5.22.0-beta.2", "2026-07-16T23:11:43Z"],
  ["5.22.0-beta.3", "2026-07-19T13:11:41Z"],
  ["5.22.0-beta.4", "2026-07-20T19:34:41Z"],
  ["5.22.0-beta.5", "2026-07-21T15:08:32Z"],
  ["5.22.0-beta.6", "2026-07-21T18:49:26Z"],
  ["5.22.0-beta.7", "2026-07-23T16:43:59Z"],
];

const EXTRA_PROVIDER_TYPES = [
  "archive", "aws", "azurerm", "datadog", "dns", "external", "github", "google",
  "helm", "http", "kubernetes", "local", "null", "random", "time", "tls", "vault",
];

export const PROVIDERS: FixtureProvider[] = [
  ...CLOUDFLARE_RELEASES.map(([version, iso]) => ({
    namespace: NAMESPACE,
    type: "cloudflare",
    version,
    protocols: ["6.0"],
    publishedAt: ts(iso),
    platforms: ALL_PLATFORMS,
  })),
  ...EXTRA_PROVIDER_TYPES.flatMap((type, i) =>
    ["1.0.0", "1.1.0"].map((version, v) => ({
      namespace: NAMESPACE,
      type,
      version,
      protocols: ["5.0"],
      publishedAt: ts("2026-08-01T00:00:00Z") + i * 3600 + v * 86_400 * 30,
      platforms: [
        { os: "linux", arch: "amd64" },
        { os: "darwin", arch: "arm64" },
      ],
    })),
  ),
];

/** Newest row per key, ordered newest first: what browse lists must show. */
function latestPer<T extends { publishedAt: number }>(
  rows: T[],
  key: (row: T) => string,
): T[] {
  const latest = new Map<string, T>();
  for (const row of rows) {
    const current = latest.get(key(row));
    if (!current || row.publishedAt > current.publishedAt) latest.set(key(row), row);
  }
  return [...latest.values()].sort((a, b) => b.publishedAt - a.publishedAt);
}

export const EXPECTED_MODULES = latestPer(
  MODULES,
  (m) => `${m.namespace}/${m.name}/${m.provider}`,
);
export const EXPECTED_PROVIDERS = latestPer(
  PROVIDERS,
  (p) => `${p.namespace}/${p.type}`,
);
export const EXPECTED_MODULE_DOWNLOADS = MODULES.reduce(
  (sum, m) => sum + m.downloads,
  0,
);
