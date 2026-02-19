/**
 * Seed Admin Script
 *
 * Interactive CLI to create the first admin user in a Stellaris D1 database.
 * Run with: pnpm db:seed-admin
 *
 * Uses node:crypto for PBKDF2 hashing (compatible with lib/auth/password.ts Web Crypto format).
 * Hash format: "v1:{iterations}:{base64(salt)}:{base64(hash)}"
 */

import * as readline from "node:readline";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { randomBytes, pbkdf2 } from "node:crypto";
import { promisify } from "node:util";
import { execSync } from "node:child_process";

const pbkdf2Async = promisify(pbkdf2);

// ============================================================================
// Constants — must match lib/auth/password.ts exactly
// ============================================================================

const ITERATIONS = 100_000;
const KEY_LENGTH = 32; // bytes
const SALT_LENGTH = 16; // bytes
const VERSION = "v1";

// ============================================================================
// Validation
// ============================================================================

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,32}$/;
const MIN_PASSWORD_LENGTH = 8;

interface AdminInput {
  email: string;
  username: string;
  password: string;
}

// ============================================================================
// Helpers
// ============================================================================

function createRl(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

/**
 * Hash password with PBKDF2-HMAC-SHA256 via node:crypto.
 * Output format identical to lib/auth/password.ts (Web Crypto):
 *   "v1:{iterations}:{base64(salt)}:{base64(hash)}"
 */
async function hashPasswordNode(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const hash = await pbkdf2Async(
    password,
    salt,
    ITERATIONS,
    KEY_LENGTH,
    "sha256",
  );
  const saltB64 = salt.toString("base64");
  const hashB64 = hash.toString("base64");
  return `${VERSION}:${ITERATIONS}:${saltB64}:${hashB64}`;
}

// ============================================================================
// Input Collection
// ============================================================================

async function collectInput(rl: readline.Interface): Promise<AdminInput> {
  console.log("\n=================================");
  console.log("  Stellaris Admin Seed Script");
  console.log("=================================\n");

  let email: string;
  while (true) {
    email = await prompt(rl, "Email: ");
    if (!EMAIL_REGEX.test(email)) {
      console.log("  ❌ Invalid email format\n");
      continue;
    }
    break;
  }

  let username: string;
  while (true) {
    username = await prompt(rl, "Username: ");
    if (!USERNAME_REGEX.test(username)) {
      console.log(
        "  ❌ Username must be 3-32 chars: letters, numbers, hyphens, underscores\n",
      );
      continue;
    }
    break;
  }

  let password: string;
  while (true) {
    password = await prompt(rl, "Password: ");
    if (password.length < MIN_PASSWORD_LENGTH) {
      console.log(
        `  ❌ Password must be at least ${MIN_PASSWORD_LENGTH} characters\n`,
      );
      continue;
    }
    const confirm = await prompt(rl, "Confirm Password: ");
    if (password !== confirm) {
      console.log("  ❌ Passwords do not match\n");
      continue;
    }
    break;
  }

  return { email, username, password };
}

// ============================================================================
// SQL Generation
// ============================================================================

async function generateAdminSql(input: AdminInput): Promise<string> {
  const passwordHash = await hashPasswordNode(input.password);
  const nowSecs = Math.floor(Date.now() / 1000);

  // Escape single quotes for SQL safety
  const email = input.email.toLowerCase().replace(/'/g, "''");
  const username = input.username.replace(/'/g, "''");
  const hash = passwordHash.replace(/'/g, "''");

  return (
    `INSERT INTO users (email, username, password_hash, role, created_at, updated_at) ` +
    `VALUES ('${email}', '${username}', '${hash}', 'admin', ${nowSecs}, ${nowSecs});`
  );
}

// ============================================================================
// Execution
// ============================================================================

function runSql(sql: string, flag: "--local" | "--remote"): boolean {
  const label = flag === "--local" ? "local" : "remote";
  const tmpFile = path.join(os.tmpdir(), `seed-admin-${Date.now()}.sql`);
  try {
    console.log(
      `\n🚀 Executing SQL on ${label} D1 database (stellaris-db)...\n`,
    );
    fs.writeFileSync(tmpFile, sql);
    execSync(
      `npx wrangler d1 execute stellaris-db ${flag} --file="${tmpFile}"`,
      { stdio: "inherit" },
    );
    return true;
  } catch (error) {
    console.error(`❌ Failed to execute SQL on ${label}:`, error);
    return false;
  } finally {
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      /* ignore cleanup errors */
    }
  }
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const rl = createRl();
  try {
    const input = await collectInput(rl);
    const sql = await generateAdminSql(input);

    console.log("\n=================================");
    console.log("  Choose Target Database");
    console.log("=================================\n");

    const target = (
      await prompt(rl, "Execute on (l)ocal, (r)emote, or (b)oth? [l/r/b]: ")
    ).toLowerCase();

    let localOk = false;
    let remoteOk = false;

    if (["l", "local", "b", "both"].includes(target)) {
      localOk = runSql(sql, "--local");
    }
    if (["r", "remote", "b", "both"].includes(target)) {
      remoteOk = runSql(sql, "--remote");
    }
    if (!["l", "local", "r", "remote", "b", "both"].includes(target)) {
      console.log("\n⚠️  Invalid option. Defaulting to local...\n");
      localOk = runSql(sql, "--local");
    }

    console.log("\n=================================");
    console.log("  Result");
    console.log("=================================\n");

    if (localOk || remoteOk) {
      console.log("✅ Admin user created successfully!\n");
      console.log(`   Email:    ${input.email}`);
      console.log(`   Username: ${input.username}`);
      console.log(`   Role:     admin\n`);
      if (localOk) console.log("   ✓ Local database updated");
      if (remoteOk) console.log("   ✓ Remote database updated");
      console.log("");
    } else {
      console.log("❌ Failed to create admin user. Check errors above.\n");
      process.exit(1);
    }
  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  } finally {
    rl.close();
  }
}

main();
