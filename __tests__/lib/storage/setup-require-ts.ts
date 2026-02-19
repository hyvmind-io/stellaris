/**
 * Setup: Register .ts extension with Node.js require() so that
 * lib/storage/index.ts's dynamic require("./local") calls can resolve.
 *
 * lib/storage/index.ts uses CJS require() at runtime for lazy backend loading.
 * Vitest processes TypeScript via Vite/ESM, but the runtime require() created
 * by createRequire() uses Node.js's native resolution which only knows about
 * .js/.json/.node. This shim adds .ts support by piping through the existing
 * .js handler (which in Vitest's module environment handles transpilation).
 */

import { Module } from "node:module";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const extensions = (Module as any)._extensions as Record<
  string,
  (module: NodeJS.Module, filename: string) => void
>;

// Register .ts extension using the same handler as .js
// (Vitest's Vite transform already handles .ts → JS transpilation
//  for modules loaded through the Vite module graph; this registration
//  ensures native require() can FIND and LOAD .ts files by extension)
if (!extensions[".ts"]) {
  extensions[".ts"] = extensions[".js"]!;
}
