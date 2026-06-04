/**
 * Seed Registry Script
 *
 * Inserts mock providers (with platforms + GPG signing keys) and modules
 * (with definition + tags) into a Stellaris D1 database so the UI — including
 * the version "info" details modal — has real data to render.
 *
 * Run with: pnpm db:seed-registry            (local, default)
 *           pnpm db:seed-registry --remote    (remote)
 *           pnpm db:seed-registry --both
 *
 * Idempotent: seed rows live under fixed namespaces and are deleted + re-inserted
 * on every run, so re-running never duplicates and always refreshes the data.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";

// ============================================================================
// Fixtures
// ============================================================================

/** All seed data lives under these namespaces — wiped clean before re-insert. */
const SEED_NAMESPACES = ["acme", "globex"];

/** Epoch seconds for deterministic, readable timestamps (timestamp-mode cols). */
const T = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

// A short, obviously-fake armored block — enough to exercise the key viewer.
const FAKE_ARMOR = `-----BEGIN PGP PUBLIC KEY BLOCK-----

mQENBF8kF2kBCADExampleFakeKeyForLocalTestingOnlyDoNotUseInProduction
AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8gISIjJCUmJygpKissLS4v
MDEyMzQ1Njc4OTo7PD0+P0BBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWltcXV5f
=AbCd
-----END PGP PUBLIC KEY BLOCK-----`;

interface SeedPlatform {
  os: string;
  arch: string;
  filename: string;
  shasum: string;
  location: string;
  shasumUrl: string;
  shasumSignatureUrl: string;
}

interface SeedGpgKey {
  keyId: string;
  asciiArmor: string;
  source: string;
  sourceUrl: string;
}

interface SeedProvider {
  namespace: string;
  type: string;
  version: string;
  protocols: string[];
  publishedAt: number;
  updatedAt: number;
  revision: number;
  platforms: SeedPlatform[];
  gpgKeys: SeedGpgKey[];
}

interface SeedModule {
  namespace: string;
  name: string;
  provider: string;
  version: string;
  owner: string;
  description: string;
  source: string;
  location: string;
  definition: unknown;
  downloads: number;
  publishedAt: number;
  updatedAt: number;
  revision: number;
  tags: string[];
}

function platform(os_: string, arch: string, ns: string, type: string, version: string): SeedPlatform {
  const filename = `terraform-provider-${type}_${version}_${os_}_${arch}.zip`;
  // Deterministic pseudo-hash (64 hex chars) derived from the platform tuple.
  const seed = `${ns}/${type}/${version}/${os_}/${arch}`;
  let h = "";
  for (let i = 0; i < 64; i++) {
    const c = seed.charCodeAt(i % seed.length) + i * 7;
    h += (c % 16).toString(16);
  }
  return {
    os: os_,
    arch,
    filename,
    shasum: h,
    location: `providers/${ns}/${type}/${version}/${filename}`,
    shasumUrl: `https://registry.local/${ns}/${type}/${version}/SHA256SUMS`,
    shasumSignatureUrl: `https://registry.local/${ns}/${type}/${version}/SHA256SUMS.sig`,
  };
}

function makeProvider(
  ns: string,
  type: string,
  version: string,
  protocols: string[],
  published: string,
  oses: [string, string][],
  withKey = true,
): SeedProvider {
  return {
    namespace: ns,
    type,
    version,
    protocols,
    publishedAt: T(published),
    updatedAt: T(published),
    revision: 1,
    platforms: oses.map(([o, a]) => platform(o, a, ns, type, version)),
    gpgKeys: withKey
      ? [
          {
            keyId: "34365D9472D7468F",
            asciiArmor: FAKE_ARMOR,
            source: `${ns} security team`,
            sourceUrl: `https://${ns}.example.com/security/gpg`,
          },
        ]
      : [],
  };
}

const ALL_PLATFORMS: [string, string][] = [
  ["linux", "amd64"],
  ["linux", "arm64"],
  ["darwin", "amd64"],
  ["darwin", "arm64"],
  ["windows", "amd64"],
];

const PROVIDERS: SeedProvider[] = [
  makeProvider("acme", "cloud", "2.1.0", ["5.0", "6.0"], "2025-05-20T10:00:00Z", ALL_PLATFORMS),
  makeProvider("acme", "cloud", "2.0.0", ["5.0", "6.0"], "2025-03-12T09:30:00Z", ALL_PLATFORMS.slice(0, 3)),
  makeProvider("acme", "cloud", "1.9.4", ["5.0"], "2024-12-01T08:00:00Z", [["linux", "amd64"], ["darwin", "amd64"]]),
  makeProvider("acme", "dns", "1.4.2", ["6.0"], "2025-04-18T14:15:00Z", [["linux", "amd64"], ["darwin", "arm64"]]),
  makeProvider("globex", "vault", "0.3.0", ["5.0", "6.0"], "2025-02-28T11:45:00Z", ALL_PLATFORMS.slice(0, 4), false),
];

const VPC_DEFINITION = {
  root: { variables: { cidr_block: { type: "string", default: "10.0.0.0/16" } } },
  outputs: { vpc_id: { value: "${aws_vpc.this.id}" } },
  required_providers: { aws: { source: "hashicorp/aws", version: ">= 5.0" } },
};

const MODULES: SeedModule[] = [
  {
    namespace: "acme",
    name: "vpc",
    provider: "aws",
    version: "3.2.0",
    owner: "acme-platform",
    description: "Opinionated AWS VPC with public/private subnets, NAT, and flow logs.",
    source: "https://github.com/acme/terraform-aws-vpc",
    location: "modules/acme/vpc/aws/3.2.0.tar.gz",
    definition: VPC_DEFINITION,
    downloads: 18423,
    publishedAt: T("2025-05-22T16:00:00Z"),
    updatedAt: T("2025-05-22T16:00:00Z"),
    revision: 1,
    tags: ["aws"],
  },
  {
    namespace: "acme",
    name: "vpc",
    provider: "aws",
    version: "3.1.0",
    owner: "acme-platform",
    description: "Opinionated AWS VPC with public/private subnets and NAT.",
    source: "https://github.com/acme/terraform-aws-vpc",
    location: "modules/acme/vpc/aws/3.1.0.tar.gz",
    definition: VPC_DEFINITION,
    downloads: 9100,
    publishedAt: T("2025-02-10T12:00:00Z"),
    updatedAt: T("2025-02-10T12:00:00Z"),
    revision: 1,
    tags: ["aws"],
  },
  {
    namespace: "acme",
    name: "k8s-cluster",
    provider: "multi",
    version: "1.0.0",
    owner: "acme-platform",
    description: "Managed Kubernetes cluster, portable across AWS/GCP/Azure.",
    source: "https://github.com/acme/terraform-k8s-cluster",
    location: "modules/acme/k8s-cluster/multi/1.0.0.tar.gz",
    definition: { engine: "kubernetes", version: "1.30" },
    downloads: 542,
    publishedAt: T("2025-04-01T09:00:00Z"),
    updatedAt: T("2025-04-01T09:00:00Z"),
    revision: 1,
    tags: ["aws", "gcp", "azure"],
  },
  {
    namespace: "globex",
    name: "logging",
    provider: "gcp",
    version: "2.5.1",
    owner: "globex-sre",
    description: "Centralised logging sink + BigQuery export for GCP projects.",
    source: "https://github.com/globex/terraform-gcp-logging",
    location: "modules/globex/logging/gcp/2.5.1.tar.gz",
    definition: { sink: "bigquery", retention_days: 90 },
    downloads: 3310,
    publishedAt: T("2025-03-30T13:20:00Z"),
    updatedAt: T("2025-03-30T13:20:00Z"),
    revision: 1,
    tags: ["gcp"],
  },
];

// ============================================================================
// SQL Generation
// ============================================================================

/** Escape a value for a single-quoted SQL string literal. */
function q(v: string): string {
  return `'${v.replace(/'/g, "''")}'`;
}

function providerRef(p: { namespace: string; type: string; version: string }): string {
  return (
    `(SELECT id FROM providers WHERE namespace = ${q(p.namespace)} ` +
    `AND type = ${q(p.type)} AND version = ${q(p.version)})`
  );
}

function buildSql(): string {
  const lines: string[] = [];

  lines.push("-- Stellaris registry seed (idempotent)");
  lines.push("PRAGMA foreign_keys = ON;");

  // 1. Wipe existing seed rows (children first; FK enforcement is not guaranteed).
  const nsList = SEED_NAMESPACES.map(q).join(", ");
  lines.push("");
  lines.push("-- Clear previous seed data");
  lines.push(
    `DELETE FROM gpg_public_keys WHERE provider_id IN ` +
      `(SELECT id FROM providers WHERE namespace IN (${nsList}));`,
  );
  lines.push(
    `DELETE FROM provider_platforms WHERE provider_id IN ` +
      `(SELECT id FROM providers WHERE namespace IN (${nsList}));`,
  );
  lines.push(`DELETE FROM providers WHERE namespace IN (${nsList});`);
  lines.push(`DELETE FROM modules WHERE namespace IN (${nsList});`);

  // 2. Providers + platforms + keys
  lines.push("");
  lines.push("-- Providers");
  for (const p of PROVIDERS) {
    lines.push(
      `INSERT INTO providers (namespace, type, version, protocols, published_at, updated_at, revision) VALUES (` +
        `${q(p.namespace)}, ${q(p.type)}, ${q(p.version)}, ${q(JSON.stringify(p.protocols))}, ` +
        `${p.publishedAt}, ${p.updatedAt}, ${p.revision});`,
    );
    for (const pl of p.platforms) {
      lines.push(
        `INSERT INTO provider_platforms (provider_id, os, arch, filename, shasum, location, shasum_url, shasum_signature_url) VALUES (` +
          `${providerRef(p)}, ${q(pl.os)}, ${q(pl.arch)}, ${q(pl.filename)}, ${q(pl.shasum)}, ` +
          `${q(pl.location)}, ${q(pl.shasumUrl)}, ${q(pl.shasumSignatureUrl)});`,
      );
    }
    for (const k of p.gpgKeys) {
      lines.push(
        `INSERT INTO gpg_public_keys (provider_id, key_id, ascii_armor, source, source_url) VALUES (` +
          `${providerRef(p)}, ${q(k.keyId)}, ${q(k.asciiArmor)}, ${q(k.source)}, ${q(k.sourceUrl)});`,
      );
    }
  }

  // 3. Modules
  lines.push("");
  lines.push("-- Modules");
  for (const m of MODULES) {
    lines.push(
      `INSERT INTO modules (namespace, name, provider, version, owner, description, source, location, definition, downloads, published_at, updated_at, revision, tags) VALUES (` +
        `${q(m.namespace)}, ${q(m.name)}, ${q(m.provider)}, ${q(m.version)}, ${q(m.owner)}, ` +
        `${q(m.description)}, ${q(m.source)}, ${q(m.location)}, ${q(JSON.stringify(m.definition))}, ` +
        `${m.downloads}, ${m.publishedAt}, ${m.updatedAt}, ${m.revision}, ${q(JSON.stringify(m.tags))});`,
    );
  }

  return lines.join("\n") + "\n";
}

// ============================================================================
// Execution
// ============================================================================

function runSql(sql: string, flag: "--local" | "--remote"): boolean {
  const label = flag === "--local" ? "local" : "remote";
  const tmpFile = path.join(os.tmpdir(), `seed-registry-${Date.now()}.sql`);
  try {
    console.log(`\n🚀 Seeding ${label} D1 database (stellaris-db)...\n`);
    fs.writeFileSync(tmpFile, sql);
    execSync(`npx wrangler d1 execute stellaris-db ${flag} --file="${tmpFile}"`, {
      stdio: "inherit",
    });
    return true;
  } catch (error) {
    console.error(`❌ Failed to seed ${label}:`, error);
    return false;
  } finally {
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      /* ignore cleanup errors */
    }
  }
}

function main(): void {
  const args = process.argv.slice(2);
  const remote = args.includes("--remote") || args.includes("--both");
  const local = args.includes("--local") || args.includes("--both") || !remote;

  const sql = buildSql();

  let ok = false;
  if (local) ok = runSql(sql, "--local") || ok;
  if (remote) ok = runSql(sql, "--remote") || ok;

  if (!ok) {
    console.log("\n❌ Seeding failed. Check errors above.\n");
    process.exit(1);
  }

  const providerVersions = PROVIDERS.length;
  const providerNames = new Set(PROVIDERS.map((p) => `${p.namespace}/${p.type}`)).size;
  const moduleVersions = MODULES.length;
  const moduleNames = new Set(MODULES.map((m) => `${m.namespace}/${m.name}/${m.provider}`)).size;

  console.log("\n✅ Registry seeded!\n");
  console.log(`   Providers: ${providerNames} (${providerVersions} versions)`);
  console.log(`   Modules:   ${moduleNames} (${moduleVersions} versions)\n`);
  console.log("   Try:");
  console.log("     /providers/acme/cloud");
  console.log("     /modules/acme/vpc/aws");
  console.log("     /modules/acme/k8s-cluster/aws  (multi-system)\n");
}

main();
