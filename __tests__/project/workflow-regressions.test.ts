import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import packageJson from "@/package.json";

describe("workflow regressions (REV-001/REV-002)", () => {
  it("keeps Cloudflare type generation wired into build/type-check lifecycles", () => {
    expect(packageJson.scripts["cf-typegen"]).toContain(
      "--env-interface CloudflareEnv",
    );
    expect(packageJson.scripts["cf-typegen"]).toContain("cloudflare-env.d.ts");
    expect(packageJson.scripts["pretype-check"]).toBe("pnpm cf-typegen");
    // prebuild must keep cf-typegen wired in (REV-001/REV-002); the theme
    // compiler (PRD-02) is chained after it, so assert containment not equality.
    expect(packageJson.scripts.prebuild).toContain("pnpm cf-typegen");
    expect(packageJson.scripts.prebuild).toContain("pnpm compile-themes");
  });

  it("keeps lint script on ESLint CLI (Next.js 16 compatible)", () => {
    expect(packageJson.scripts.lint).toContain("eslint");
    expect(packageJson.scripts.lint).not.toContain("next lint");
  });

  it("documents typegen and lint workflow expectations in CONTRIBUTING", () => {
    const docs = readFileSync(
      resolve(process.cwd(), "CONTRIBUTING.md"),
      "utf8",
    );

    expect(docs).toContain(
      "pnpm type-check` automatically refreshes Cloudflare binding types (`cloudflare-env.d.ts`) via `pnpm cf-typegen`",
    );
    expect(docs).toContain(
      "`pnpm lint` runs ESLint directly (Next.js 16-compatible workflow).",
    );
  });

  it("keeps generated CloudflareEnv bindings present for DB and storage", () => {
    const types = readFileSync(
      resolve(process.cwd(), "cloudflare-env.d.ts"),
      "utf8",
    );

    // Assert the bindings exist, not the exact wrapper interface. `wrangler
    // types` changes the CloudflareEnv declaration shape depending on the
    // wrangler.jsonc vars present (e.g. it may extend a generated
    // `__BaseEnv_CloudflareEnv` rather than `Cloudflare.Env`). Pinning that
    // wrapper text made this test break on unrelated var additions. The
    // regression we actually guard against is the DB + storage bindings
    // disappearing from the generated types.
    expect(types).toMatch(/interface\s+CloudflareEnv\b/);
    expect(types).toMatch(/\bDB:\s*D1Database;/);
    expect(types).toMatch(/\bMODULES_STORAGE:\s*R2Bucket;/);
  });
});
