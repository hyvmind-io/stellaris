import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { Footer } from "@/components/layout/footer";
import { BrandingProvider } from "@/components/branding/branding-provider";
import type { Branding } from "@/lib/branding";

vi.mock("@/components/ui/separator", () => ({
  Separator: () => <hr />,
}));

const DEFAULT_BRANDING: Branding = {
  whitelabelEnabled: false,
  brandName: null,
  titleSuffix: "Private Terraform Registry",
  appTitle: "Stellaris — Private Terraform Registry",
  tagline:
    "Private Terraform/OpenTofu module and provider registry powered by Cloudflare Workers",
  description:
    "Private Terraform/OpenTofu module and provider registry on Cloudflare Workers",
  footerText: "Powered by Next.js · Cloudflare Workers",
  logoUrl: null,
  faviconUrl: null,
  showTechBranding: true,
};

const WHITELABEL_BRANDING: Branding = {
  whitelabelEnabled: true,
  brandName: "Evil Corp",
  titleSuffix: "Terraform Registry",
  appTitle: "Evil Corp — Terraform Registry",
  tagline: "Internal infrastructure registry",
  description: "Internal infrastructure registry",
  footerText: "Evil Corp — 2026",
  logoUrl: null,
  faviconUrl: null,
  showTechBranding: false,
};

function render(branding: Branding) {
  return renderToString(
    <BrandingProvider value={branding}>
      <Footer />
    </BrandingProvider>,
  );
}

describe("Footer", () => {
  it("shows sponsor and tech lines by default", () => {
    const html = render(DEFAULT_BRANDING);
    expect(html).toContain("Powered by Next.js");
    expect(html).toContain("nmindz");
    expect(html).toContain("Stellaris — Private Terraform Registry");
  });

  it("hides sponsor and tech lines when whitelabeled", () => {
    const html = render(WHITELABEL_BRANDING);
    expect(html).not.toContain("Powered by Next.js");
    expect(html).not.toContain("nmindz");
  });

  it("renders the whitelabel footer text with year", () => {
    const html = render(WHITELABEL_BRANDING);
    expect(html).toContain("Evil Corp — 2026");
  });
});
