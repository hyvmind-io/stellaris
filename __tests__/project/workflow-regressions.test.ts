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
    expect(packageJson.scripts.prebuild).toBe("pnpm cf-typegen");
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

    expect(types).toContain(
      "interface CloudflareEnv extends Cloudflare.Env {}",
    );
    expect(types).toContain("DB: D1Database;");
    expect(types).toContain("MODULES_STORAGE: R2Bucket;");
  });
});
