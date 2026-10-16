/**
 * Rebuilds the isolated e2e D1 database: wipes .wrangler/e2e, applies every
 * drizzle migration, then inserts the fixture registry, a login user and
 * scoped API keys.
 *
 * Run with: pnpm test:e2e:seed   (also runs before the Playwright dev server)
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { hashApiKey } from "@/lib/auth/api-keys";
import { hashPassword } from "@/lib/auth/password";
import {
  E2E_API_KEYS,
  E2E_PERSIST_DIR,
  E2E_USER,
  E2E_WRANGLER_CONFIG,
} from "./config";
import { MODULES, PROVIDERS } from "./fixtures";

const quote = (value: string | null) =>
  value === null ? "NULL" : `'${value.replaceAll("'", "''")}'`;

// Same wrangler build the Next dev server loads via @opennextjs/cloudflare.
const rootRequire = createRequire(path.join(process.cwd(), "package.json"));
const wranglerBin = createRequire(
  rootRequire.resolve("@opennextjs/cloudflare"),
).resolve("wrangler/bin/wrangler.js");

function wrangler(...args: string[]): void {
  execFileSync(
    process.execPath,
    [
      wranglerBin,
      ...args,
      "--local",
      "--config",
      E2E_WRANGLER_CONFIG,
      "--persist-to",
      E2E_PERSIST_DIR,
    ],
    { stdio: ["ignore", "ignore", "inherit"] },
  );
}

async function buildSeedSql(): Promise<string> {
  const statements: string[] = [];

  for (const m of MODULES) {
    statements.push(
      `INSERT INTO modules (namespace, name, provider, version, owner, description, source, location, definition, downloads, published_at, tags, updated_at, revision) VALUES (` +
        [
          quote(m.namespace),
          quote(m.name),
          quote(m.provider),
          quote(m.version),
          quote(m.owner),
          "NULL",
          quote(m.source),
          quote(`${m.namespace}/${m.name}/${m.provider}/${m.version}.tar.gz`),
          "NULL",
          m.downloads,
          m.publishedAt,
          quote(JSON.stringify(m.tags)),
          m.publishedAt,
          1,
        ].join(", ") +
        `);`,
    );
  }

  for (const p of PROVIDERS) {
    statements.push(
      `INSERT INTO providers (namespace, type, version, protocols, published_at, updated_at, revision) VALUES (` +
        `${quote(p.namespace)}, ${quote(p.type)}, ${quote(p.version)}, ${quote(JSON.stringify(p.protocols))}, ${p.publishedAt}, ${p.publishedAt}, 1);`,
    );
    const providerId = `(SELECT id FROM providers WHERE namespace = ${quote(p.namespace)} AND type = ${quote(p.type)} AND version = ${quote(p.version)})`;
    for (const { os, arch } of p.platforms) {
      const filename = `terraform-provider-${p.type}_${p.version}_${os}_${arch}.zip`;
      statements.push(
        `INSERT INTO provider_platforms (provider_id, os, arch, filename, shasum) VALUES (` +
          `${providerId}, ${quote(os)}, ${quote(arch)}, ${quote(filename)}, ${quote("0".repeat(64))});`,
      );
    }
  }

  const now = Math.floor(Date.now() / 1000);
  statements.push(
    `INSERT INTO users (email, username, password_hash, role, created_at, updated_at) VALUES (` +
      `${quote(E2E_USER.email)}, ${quote(E2E_USER.username)}, ${quote(await hashPassword(E2E_USER.password))}, 'admin', ${now}, ${now});`,
  );

  for (const [name, { key, permissions }] of Object.entries(E2E_API_KEYS)) {
    statements.push(
      `INSERT INTO api_keys (key_hash, name, permissions, created_at) VALUES (` +
        `${quote(await hashApiKey(key))}, ${quote(`e2e-${name}`)}, ${quote(JSON.stringify(permissions))}, ${now});`,
    );
  }

  return statements.join("\n") + "\n";
}

async function main(): Promise<void> {
  rmSync(E2E_PERSIST_DIR, { recursive: true, force: true });
  mkdirSync(E2E_PERSIST_DIR, { recursive: true });

  wrangler("d1", "migrations", "apply", "stellaris-db");

  const seedFile = path.join(E2E_PERSIST_DIR, "seed.sql");
  writeFileSync(seedFile, await buildSeedSql());
  wrangler("d1", "execute", "stellaris-db", "--file", seedFile);

  console.log(
    `Seeded ${MODULES.length} module rows, ${PROVIDERS.length} provider rows into ${E2E_PERSIST_DIR}`,
  );
}

main().catch((error) => {
  console.error("e2e seed failed:", error);
  process.exit(1);
});
