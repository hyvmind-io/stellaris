/**
 * Theme compiler entrypoint (PRD-02 §5). Run at prebuild via tsx:
 *
 *   pnpm compile-themes   →   tsx scripts/compile-themes.ts
 *
 * Globs operator-authored theme files from themes/, validates + normalizes each
 * via the pure logic in lib/theme/compile.ts, and emits two generated artifacts
 * (both gitignored, regenerated each build):
 *
 *   app/generated/themes.css           — [data-theme="x"] light + .dark blocks
 *   app/generated/themes.manifest.ts   — typed THEMES list (always incl. default)
 *
 * Invalid themes are skipped with a console.warn; the build always continues and
 * the built-in default survives (02-106 / 02-209).
 */
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, extname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { compileThemes, type ParsedSource } from "../lib/theme/compile";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const THEMES_DIR = join(ROOT, "themes");
const OUT_DIR = join(ROOT, "app", "generated");
const OUT_CSS = join(OUT_DIR, "themes.css");
const OUT_MANIFEST = join(OUT_DIR, "themes.manifest.ts");

function collectSources(): ParsedSource[] {
  let entries: string[];
  try {
    entries = readdirSync(THEMES_DIR);
  } catch {
    // No themes/ directory → ship only the built-in default.
    return [];
  }

  const sources: ParsedSource[] = [];
  for (const entry of entries.sort()) {
    const ext = extname(entry).toLowerCase();
    const format =
      ext === ".yaml" || ext === ".yml"
        ? "yaml"
        : ext === ".jsonc"
          ? "jsonc"
          : null;
    if (!format) continue;
    const full = join(THEMES_DIR, entry);
    sources.push({
      file: relative(ROOT, full),
      content: readFileSync(full, "utf8"),
      format,
    });
  }
  return sources;
}

function main(): void {
  const sources = collectSources();
  const result = compileThemes(sources);

  for (const w of result.warnings) {
    console.warn(`[themes] ${w.file}: ${w.message}`);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_CSS, result.css, "utf8");
  writeFileSync(OUT_MANIFEST, result.manifest, "utf8");

  const names = result.themes.map((t) => t.name).join(", ");
  console.log(
    `[themes] compiled ${result.themes.length} theme(s): ${names}\n` +
      `[themes] → ${relative(ROOT, OUT_CSS)}\n` +
      `[themes] → ${relative(ROOT, OUT_MANIFEST)}`,
  );
}

main();
