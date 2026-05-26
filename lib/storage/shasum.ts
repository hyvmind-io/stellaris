/**
 * Shared SHA256 helpers for provider artifact ingestion.
 *
 * Used by both the UI server action (`app/actions/admin-providers.ts`) and the
 * admin REST multipart paths so the compute + SHA256SUMS-line-parse behavior is
 * defined in exactly one place.
 */

/**
 * Compute the lowercase hex SHA-256 digest of a File's bytes.
 *
 * Uses the Web Crypto API (`crypto.subtle`), available in both the Node.js dev
 * runtime and Cloudflare Workers.
 */
export async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Parse a SHA256SUMS file body and extract the checksum for a given filename.
 *
 * SHA256SUMS lines follow the `sha256sum`/`shasum -a 256` format:
 *   `<64-hex>  <filename>`   (text mode, two spaces)
 *   `<64-hex> *<filename>`   (binary mode, space + asterisk)
 *
 * Returns the lowercased 64-hex checksum if a matching line is found and the
 * checksum is well-formed, otherwise `undefined` (caller keeps the computed
 * digest).
 */
export function extractShasumForFile(
  shasumsText: string,
  filename: string,
): string | undefined {
  const match = shasumsText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .find((line) => line.includes(filename));

  if (!match) return undefined;

  const [fromFile] = match.split(/\s+\*?/);
  if (fromFile && /^[a-f0-9]{64}$/i.test(fromFile)) {
    return fromFile.toLowerCase();
  }
  return undefined;
}
