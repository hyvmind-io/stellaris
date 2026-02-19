import "server-only";

/**
 * PBKDF2-HMAC-SHA-256 password hashing — Cloudflare Workers compatible.
 *
 * Uses Web Crypto API (crypto.subtle) — no native Node.js dependencies.
 * Format: "v1:{iterations}:{base64(salt)}:{base64(hash)}"
 */

const ALGORITHM = "PBKDF2";
const HASH = "SHA-256";
const ITERATIONS = 100_000;
const KEY_LENGTH = 32; // bytes
const SALT_LENGTH = 16; // bytes
const VERSION = "v1";

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    ALGORITHM,
    false,
    ["deriveBits"],
  );
  const hashBuffer = await crypto.subtle.deriveBits(
    {
      name: ALGORITHM,
      salt: salt.buffer as ArrayBuffer,
      iterations: ITERATIONS,
      hash: HASH,
    },
    keyMaterial,
    KEY_LENGTH * 8,
  );
  return `${VERSION}:${ITERATIONS}:${toBase64(salt)}:${toBase64(new Uint8Array(hashBuffer))}`;
}

export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  const parts = storedHash.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) return false;

  const iterations = parseInt(parts[1]!, 10);
  if (isNaN(iterations)) return false;

  const salt = fromBase64(parts[2]!);
  const expectedHash = fromBase64(parts[3]!);

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    ALGORITHM,
    false,
    ["deriveBits"],
  );
  const hashBuffer = await crypto.subtle.deriveBits(
    {
      name: ALGORITHM,
      salt: salt.buffer as ArrayBuffer,
      iterations,
      hash: HASH,
    },
    keyMaterial,
    KEY_LENGTH * 8,
  );
  const computedHash = new Uint8Array(hashBuffer);

  // Constant-time comparison
  if (computedHash.length !== expectedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < computedHash.length; i++) {
    diff |= computedHash[i]! ^ expectedHash[i]!;
  }
  return diff === 0;
}

/**
 * Perform a dummy hash verification to prevent user-enumeration timing attacks.
 * Call this when a user is not found, before returning an error.
 */
export async function dummyVerify(): Promise<void> {
  await verifyPassword(
    "dummy",
    "v1:100000:AAAAAAAAAAAAAAAAAAAAAA==:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  );
}
