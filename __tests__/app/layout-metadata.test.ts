import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// next/font/google is a build-time transform and is not a callable function in
// the vitest SSR runtime — stub it so importing the layout module succeeds.
vi.mock("next/font/google", () => ({
  Inter: () => ({ variable: "--font-inter", className: "font-inter" }),
}));

import { generateMetadata } from "@/app/layout";
import { __resetBrandingForTests } from "@/lib/branding";

// `wrangler types` narrows `process.env.WHITELABEL_*` to the literal `vars`
// pinned in wrangler.jsonc. Cast through a wider record type so the narrowing
// doesn't reach the test code.
const env = process.env as unknown as Record<string, string | undefined>;

const WHITELABEL_KEYS = [
  "WHITELABEL_ENABLED",
  "WHITELABEL_BRAND_NAME",
  "WHITELABEL_TITLE_SUFFIX",
  "WHITELABEL_TAGLINE",
  "WHITELABEL_LOGO_URL",
  "WHITELABEL_FAVICON_URL",
  "WHITELABEL_FOOTER_TEXT",
] as const;

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of WHITELABEL_KEYS) {
    saved[k] = env[k];
    delete env[k];
  }
  __resetBrandingForTests();
});

afterEach(() => {
  for (const k of WHITELABEL_KEYS) {
    if (saved[k] === undefined) delete env[k];
    else env[k] = saved[k];
  }
  __resetBrandingForTests();
});

describe("generateMetadata", () => {
  it("uses default Stellaris title/description and no custom favicon", () => {
    env.WHITELABEL_ENABLED = "false";
    const meta = generateMetadata();

    expect(meta.title).toBe("Stellaris — Private Terraform Registry");
    expect(meta.description).toBe(
      "Private Terraform/OpenTofu module and provider registry on Cloudflare Workers",
    );
    expect(meta.icons).toBeUndefined();
  });

  it("reflects whitelabel branding title/description/favicon", () => {
    env.WHITELABEL_ENABLED = "true";
    env.WHITELABEL_BRAND_NAME = "Evil Corp";
    env.WHITELABEL_TITLE_SUFFIX = "Terraform Registry";
    env.WHITELABEL_TAGLINE = "Internal infrastructure registry";
    env.WHITELABEL_FAVICON_URL = "https://cdn.example.com/favicon.ico";
    const meta = generateMetadata();

    expect(meta.title).toBe("Evil Corp — Terraform Registry");
    expect(meta.description).toBe("Internal infrastructure registry");
    expect(meta.icons).toEqual({ icon: "https://cdn.example.com/favicon.ico" });
  });
});
