import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import type { Branding } from "@/lib/branding";

const mockBrowseModules = vi.fn();
const mockBrowseProviders = vi.fn();
const mockGetRegistryStats = vi.fn();
const mockGetBranding = vi.fn<() => Branding>();

vi.mock("@/lib/data/modules", () => ({
  browseModules: (...args: unknown[]) => mockBrowseModules(...args),
}));

vi.mock("@/lib/data/providers", () => ({
  browseProviders: (...args: unknown[]) => mockBrowseProviders(...args),
}));

vi.mock("@/lib/data/stats", () => ({
  getRegistryStats: (...args: unknown[]) => mockGetRegistryStats(...args),
}));

vi.mock("@/lib/branding", () => ({
  getBranding: () => mockGetBranding(),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    [k: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));

vi.mock("@/components/ui/separator", () => ({
  Separator: () => <hr />,
}));

vi.mock("@/components/stat-card", () => ({
  StatCard: ({ title, value }: { title: string; value: number }) => (
    <div data-testid="stat-card">
      {title}: {value}
    </div>
  ),
}));

vi.mock("@/components/search-input", () => ({
  SearchInput: ({ placeholder }: { placeholder?: string }) => (
    <input placeholder={placeholder} readOnly />
  ),
}));

vi.mock("@/components/code-block", () => ({
  CodeBlock: ({ code }: { code: string }) => <pre>{code}</pre>,
}));

vi.mock("@/components/module-card", () => ({
  ModuleCard: () => <article />,
}));

vi.mock("@/components/provider-card", () => ({
  ProviderCard: () => <article />,
}));

import HomePage from "@/app/page";

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

async function renderPage(): Promise<string> {
  const element = await HomePage({ searchParams: Promise.resolve({}) });
  return renderToString(element);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetRegistryStats.mockResolvedValue({
    totalModules: 10,
    totalProviders: 7,
    totalDownloads: 120,
  });
});

describe("HomePage hero branding", () => {
  it("renders default Stellaris title, tagline, and tech badges", async () => {
    mockGetBranding.mockReturnValue(DEFAULT_BRANDING);
    const html = await renderPage();

    expect(html).toContain("Stellaris");
    expect(html).toContain(
      "Private Terraform/OpenTofu module and provider registry powered by",
    );
    expect(html).toContain("Next.js 16");
    expect(html).toContain("Drizzle ORM");
  });

  it("renders brand title and tagline when whitelabeled", async () => {
    mockGetBranding.mockReturnValue(WHITELABEL_BRANDING);
    const html = await renderPage();

    expect(html).toContain("Evil Corp");
    expect(html).toContain("Internal infrastructure registry");
  });

  it("hides the tech-badge row when whitelabeled", async () => {
    mockGetBranding.mockReturnValue(WHITELABEL_BRANDING);
    const html = await renderPage();

    expect(html).not.toContain("Next.js 16");
    expect(html).not.toContain("React 19");
    expect(html).not.toContain("Drizzle ORM");
  });
});
