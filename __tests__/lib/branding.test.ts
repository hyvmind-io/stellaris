import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getBranding, __resetBrandingForTests } from "@/lib/branding";

// `wrangler types` narrows `process.env.WHITELABEL_*` to whatever literal `vars`
// pin in wrangler.jsonc, which would block these tests from assigning and
// deleting the variables. Cast through a wider record type so the narrowing
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

describe("getBranding", () => {
  it("returns default Stellaris branding when whitelabel is disabled", () => {
    env.WHITELABEL_ENABLED = "false";
    const b = getBranding();

    expect(b.whitelabelEnabled).toBe(false);
    expect(b.brandName).toBeNull();
    expect(b.appTitle).toBe("Stellaris — Private Terraform Registry");
    expect(b.titleSuffix).toBe("Private Terraform Registry");
    expect(b.tagline).toBe(
      "Private Terraform/OpenTofu module and provider registry powered by Cloudflare Workers",
    );
    expect(b.description).toBe(
      "Private Terraform/OpenTofu module and provider registry on Cloudflare Workers",
    );
    expect(b.footerText).toBe("Powered by Next.js · Cloudflare Workers");
    expect(b.logoUrl).toBeNull();
    expect(b.faviconUrl).toBeNull();
    expect(b.showTechBranding).toBe(true);
  });

  it("defaults to disabled branding when WHITELABEL_ENABLED is unset", () => {
    const b = getBranding();
    expect(b.whitelabelEnabled).toBe(false);
    expect(b.appTitle).toBe("Stellaris — Private Terraform Registry");
    expect(b.showTechBranding).toBe(true);
  });

  it("composes title and footer when enabled with a brand name", () => {
    env.WHITELABEL_ENABLED = "true";
    env.WHITELABEL_BRAND_NAME = "Evil Corp";
    env.WHITELABEL_TITLE_SUFFIX = "Terraform Registry";
    env.WHITELABEL_TAGLINE = "Internal infrastructure registry";
    env.WHITELABEL_FOOTER_TEXT = "Evil Corp — {year}";
    const b = getBranding();

    expect(b.whitelabelEnabled).toBe(true);
    expect(b.brandName).toBe("Evil Corp");
    expect(b.titleSuffix).toBe("Terraform Registry");
    expect(b.appTitle).toBe("Evil Corp — Terraform Registry");
    expect(b.tagline).toBe("Internal infrastructure registry");
    expect(b.description).toBe("Internal infrastructure registry");
    expect(b.footerText).toBe(`Evil Corp — ${new Date().getUTCFullYear()}`);
    expect(b.showTechBranding).toBe(false);
  });

  it("degrades to generic when enabled without a brand name", () => {
    env.WHITELABEL_ENABLED = "true";
    const b = getBranding();

    expect(b.whitelabelEnabled).toBe(true);
    expect(b.brandName).toBeNull();
    expect(b.titleSuffix).toBe("Registry");
    expect(b.appTitle).toBe("Registry");
    expect(b.tagline).toBe("Private module and provider registry");
    expect(b.description).toBe("Private module and provider registry");
    expect(b.footerText).toBe(String(new Date().getUTCFullYear()));
    expect(b.showTechBranding).toBe(false);
  });

  it("interpolates {year} in the footer text", () => {
    const year = new Date().getUTCFullYear();
    env.WHITELABEL_ENABLED = "true";
    env.WHITELABEL_BRAND_NAME = "Acme";
    env.WHITELABEL_FOOTER_TEXT = "© {year} Acme. All {year} rights reserved.";
    const b = getBranding();

    expect(b.footerText).toBe(
      `© ${year} Acme. All ${year} rights reserved.`,
    );
  });

  it("applies valid logo and favicon URLs", () => {
    env.WHITELABEL_ENABLED = "true";
    env.WHITELABEL_BRAND_NAME = "Acme";
    env.WHITELABEL_LOGO_URL = "https://cdn.example.com/logo.svg";
    env.WHITELABEL_FAVICON_URL = "https://cdn.example.com/favicon.ico";
    const b = getBranding();

    expect(b.logoUrl).toBe("https://cdn.example.com/logo.svg");
    expect(b.faviconUrl).toBe("https://cdn.example.com/favicon.ico");
  });

  it("ignores invalid logo/favicon URLs and falls back to null", () => {
    env.WHITELABEL_ENABLED = "true";
    env.WHITELABEL_BRAND_NAME = "Acme";
    env.WHITELABEL_LOGO_URL = "not a url";
    env.WHITELABEL_FAVICON_URL = "also-not-valid";
    const b = getBranding();

    expect(b.whitelabelEnabled).toBe(true);
    expect(b.brandName).toBe("Acme");
    expect(b.logoUrl).toBeNull();
    expect(b.faviconUrl).toBeNull();
  });

  it("flips showTechBranding off when whitelabel is enabled", () => {
    env.WHITELABEL_ENABLED = "true";
    expect(getBranding().showTechBranding).toBe(false);

    __resetBrandingForTests();
    env.WHITELABEL_ENABLED = "false";
    expect(getBranding().showTechBranding).toBe(true);
  });

  it("memoizes the resolved branding until reset", () => {
    env.WHITELABEL_ENABLED = "false";
    const first = getBranding();
    // Mutating env without resetting must not change the memoized result.
    env.WHITELABEL_ENABLED = "true";
    expect(getBranding()).toBe(first);

    __resetBrandingForTests();
    expect(getBranding().whitelabelEnabled).toBe(true);
  });
});
