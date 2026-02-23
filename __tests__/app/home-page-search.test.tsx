import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";

const mockBrowseModules = vi.fn();
const mockBrowseProviders = vi.fn();
const mockGetRegistryStats = vi.fn();

vi.mock("@/lib/data/modules", () => ({
  browseModules: (...args: unknown[]) => mockBrowseModules(...args),
}));

vi.mock("@/lib/data/providers", () => ({
  browseProviders: (...args: unknown[]) => mockBrowseProviders(...args),
}));

vi.mock("@/lib/data/stats", () => ({
  getRegistryStats: (...args: unknown[]) => mockGetRegistryStats(...args),
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
  SearchInput: ({
    placeholder,
    className,
  }: {
    placeholder?: string;
    className?: string;
  }) => <input className={className} placeholder={placeholder} readOnly />,
}));

vi.mock("@/components/code-block", () => ({
  CodeBlock: ({ code }: { code: string }) => <pre>{code}</pre>,
}));

vi.mock("@/components/module-card", () => ({
  ModuleCard: ({
    module,
  }: {
    module: { namespace: string; name: string; provider: string };
  }) => (
    <article data-testid="module-card">
      {module.namespace}/{module.name}/{module.provider}
    </article>
  ),
}));

vi.mock("@/components/provider-card", () => ({
  ProviderCard: ({
    provider,
  }: {
    provider: { namespace: string; type: string };
  }) => (
    <article data-testid="provider-card">
      {provider.namespace}/{provider.type}
    </article>
  ),
}));

import HomePage from "@/app/page";

async function renderPage(q?: string): Promise<string> {
  const element = await HomePage({
    searchParams: Promise.resolve(q === undefined ? {} : { q }),
  });
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

describe("HomePage query search", () => {
  it("renders default homepage without unified results when q is missing", async () => {
    const html = await renderPage();

    expect(mockBrowseModules).not.toHaveBeenCalled();
    expect(mockBrowseProviders).not.toHaveBeenCalled();
    expect(html).not.toContain('Search results for "');
    expect(html).toContain('href="/modules"');
    expect(html).toContain('href="/providers"');
  });

  it("calls browse queries with expected args and renders unified sections when q exists", async () => {
    mockBrowseModules.mockResolvedValue({
      modules: [{ namespace: "hashicorp", name: "vpc", provider: "aws" }],
      meta: { offset: 0, limit: 6, total: 1 },
    });
    mockBrowseProviders.mockResolvedValue({
      providers: [{ namespace: "hashicorp", type: "aws", platformCount: 3 }],
      meta: { offset: 0, limit: 6, total: 1 },
    });

    const html = await renderPage("  aws  ");

    expect(mockBrowseModules).toHaveBeenCalledWith({
      q: "aws",
      offset: 0,
      limit: 6,
    });
    expect(mockBrowseProviders).toHaveBeenCalledWith({
      q: "aws",
      offset: 0,
      limit: 6,
    });
    expect(html).toContain("Search results for");
    expect(html).toContain("aws");
    expect(html).toContain("Modules (");
    expect(html).toContain("Providers (");
    expect(html).toContain('data-testid="module-card"');
    expect(html).toContain('data-testid="provider-card"');
  });

  it("shows empty state when both searches have no matches", async () => {
    mockBrowseModules.mockResolvedValue({
      modules: [],
      meta: { offset: 0, limit: 6, total: 0 },
    });
    mockBrowseProviders.mockResolvedValue({
      providers: [],
      meta: { offset: 0, limit: 6, total: 0 },
    });

    const html = await renderPage("nothing");

    expect(html).toContain("No matches found");
    expect(html).toContain("matching");
    expect(html).toContain("nothing");
  });

  it("preserves q in modules and providers links", async () => {
    mockBrowseModules.mockResolvedValue({
      modules: [{ namespace: "hashicorp", name: "vpc", provider: "aws" }],
      meta: { offset: 0, limit: 6, total: 1 },
    });
    mockBrowseProviders.mockResolvedValue({
      providers: [{ namespace: "hashicorp", type: "aws", platformCount: 1 }],
      meta: { offset: 0, limit: 6, total: 1 },
    });

    const html = await renderPage("aws gcp");

    const moduleLinks = html.match(/href="\/modules\?q=aws%20gcp"/g) ?? [];
    const providerLinks = html.match(/href="\/providers\?q=aws%20gcp"/g) ?? [];

    expect(moduleLinks.length).toBeGreaterThanOrEqual(2);
    expect(providerLinks.length).toBeGreaterThanOrEqual(2);
  });
});
