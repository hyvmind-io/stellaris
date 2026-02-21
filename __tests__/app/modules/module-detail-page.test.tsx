import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToString } from "react-dom/server";

// ============================================================================
// Mocks — hoisted before any import of the module under test
// ============================================================================

const mockNotFound = vi.fn();
vi.mock("next/navigation", () => ({
  notFound: (...args: unknown[]) => mockNotFound(...args),
}));

const mockGetModuleLatestVersion = vi.fn();
const mockGetModuleVersions = vi.fn();
const mockResolveModuleTags = vi.fn();
vi.mock("@/lib/data/modules", () => ({
  getModuleLatestVersion: (...args: unknown[]) =>
    mockGetModuleLatestVersion(...args),
  getModuleVersions: (...args: unknown[]) => mockGetModuleVersions(...args),
  resolveModuleTags: (...args: unknown[]) => mockResolveModuleTags(...args),
}));

// Mock shadcn/ui and sub-components to simple HTML for testability
vi.mock("@/components/ui/badge", () => ({
  Badge: ({
    children,
    ...props
  }: {
    children: React.ReactNode;
    [k: string]: unknown;
  }) => (
    <span data-testid="badge" {...props}>
      {children}
    </span>
  ),
}));

vi.mock("@/components/ui/separator", () => ({
  Separator: () => <hr />,
}));

vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="scroll-area">{children}</div>
  ),
}));

vi.mock("@/components/code-block", () => ({
  CodeBlock: ({ code, title }: { code: string; title?: string }) => (
    <pre data-testid="code-block" data-title={title}>
      {code}
    </pre>
  ),
}));

// Mock lucide-react icons to simple spans with identifiable content
vi.mock("lucide-react", () => ({
  ArrowDownToLine: () => <span data-icon="arrow-down-to-line" />,
  Calendar: () => <span data-icon="calendar" />,
  ExternalLink: () => <span data-icon="external-link" />,
  Tag: () => <span data-icon="tag" />,
  User: () => <span data-icon="user" />,
  ChevronRight: () => <span data-icon="chevron-right" />,
}));

// ============================================================================
// Import page component AFTER mocks
// ============================================================================

import ModuleDetailPage from "@/app/(protected)/modules/[namespace]/[name]/[system]/page";
import type { Module } from "@/db/schema";

// ============================================================================
// Fixtures
// ============================================================================

function fakeModule(overrides: Partial<Module> = {}): Module {
  return {
    id: 1,
    namespace: "hashicorp",
    name: "consul",
    provider: "aws",
    version: "1.0.0",
    owner: "hashicorp",
    description: "HashiCorp Consul module",
    source: "https://github.com/hashicorp/consul",
    location: "modules/hashicorp/consul/aws/1.0.0.tar.gz",
    definition: null,
    downloads: 42,
    publishedAt: new Date("2025-06-01"),
    tags: '["aws","gcp"]',
    updatedAt: new Date("2025-06-01"),
    revision: 1,
    ...overrides,
  };
}

function makeParams(namespace = "hashicorp", name = "consul", system = "aws") {
  return { params: Promise.resolve({ namespace, name, system }) };
}

/** Render the async server component to an HTML string. */
async function renderPage(
  props: Parameters<typeof ModuleDetailPage>[0],
): Promise<string> {
  const element = await ModuleDetailPage(props);
  return renderToString(element);
}

// ============================================================================
// Tests
// ============================================================================

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ModuleDetailPage", () => {
  // --------------------------------------------------------------------------
  // Requirement 1: system segment removed from visible labels
  // --------------------------------------------------------------------------

  describe("system segment removed from display", () => {
    it("does not show system in the breadcrumb text", async () => {
      const mod = fakeModule();
      mockGetModuleLatestVersion.mockResolvedValue(mod);
      mockGetModuleVersions.mockResolvedValue([{ version: "1.0.0" }]);
      mockResolveModuleTags.mockReturnValue(["aws", "gcp"]);

      const html = await renderPage(makeParams());

      // The breadcrumb <nav> contains the current page label in a <span>.
      // Extract the nav content and check the final breadcrumb segment.
      const navMatch = html.match(/<nav[\s\S]*?<\/nav>/);
      expect(navMatch).not.toBeNull();
      const navHtml = navMatch![0];

      // Strip React comment nodes (<!-- -->) inserted between JSX expressions
      // so we can match the visible text content.
      const navText = navHtml
        .replace(/<!--.*?-->/g, "")
        .replace(/<[^>]+>/g, "");

      // The breadcrumb visible text should include "hashicorp/consul"
      expect(navText).toContain("hashicorp/consul");
      // Must NOT include system segment in the breadcrumb label
      expect(navText).not.toContain("hashicorp/consul/aws");
    });

    it("does not show system in the h1 title", async () => {
      const mod = fakeModule();
      mockGetModuleLatestVersion.mockResolvedValue(mod);
      mockGetModuleVersions.mockResolvedValue([{ version: "1.0.0" }]);
      mockResolveModuleTags.mockReturnValue(["aws", "gcp"]);

      const html = await renderPage(makeParams());

      // The <h1> should contain "hashicorp / consul" but NOT "/ aws" as a
      // separate title segment. Extract h1 content to verify.
      const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
      expect(h1Match).not.toBeNull();
      const h1Content = h1Match![1];
      expect(h1Content).toContain("hashicorp");
      expect(h1Content).toContain("consul");
      // The old code had `<span ...> / {system}</span>` — this must be gone
      expect(h1Content).not.toMatch(/\/\s*aws\s*</);
    });

    it("does not render a standalone system badge", async () => {
      const mod = fakeModule({ provider: "multi", tags: '["aws","gcp"]' });
      mockGetModuleLatestVersion.mockResolvedValue(mod);
      mockGetModuleVersions.mockResolvedValue([{ version: "1.0.0" }]);
      mockResolveModuleTags.mockReturnValue(["aws", "gcp"]);

      const html = await renderPage(makeParams("hashicorp", "consul", "aws"));

      // Previously there was `<Badge variant="secondary">{system}</Badge>` — a
      // bare system badge with no icon. That has been replaced with tag badges
      // that each contain a Tag icon.
      //
      // Every secondary badge that appears in the header area now has a tag icon.
      // The sidebar also has one secondary badge for the version count (no icon).
      // We verify that no secondary badge contains bare "aws" text without a tag icon.
      // The tag badges render as: <span ... variant="secondary" ...><span data-icon="tag"></span>aws</span>
      // So we confirm that "aws" appears as a tag badge (with icon), not standalone.
      expect(html).toContain('data-icon="tag"');

      // Count tag icons — should equal the number of resolved tags (2: aws, gcp)
      const tagIconCount = (html.match(/data-icon="tag"/g) || []).length;
      expect(tagIconCount).toBe(2);
    });
  });

  // --------------------------------------------------------------------------
  // Requirement 2: provider tags displayed prominently
  // --------------------------------------------------------------------------

  describe("provider tags from module data", () => {
    it("renders tag badges from resolveModuleTags", async () => {
      const mod = fakeModule({ tags: '["aws","gcp","azure"]' });
      mockGetModuleLatestVersion.mockResolvedValue(mod);
      mockGetModuleVersions.mockResolvedValue([{ version: "1.0.0" }]);
      mockResolveModuleTags.mockReturnValue(["aws", "gcp", "azure"]);

      const html = await renderPage(makeParams());

      expect(html).toContain("aws");
      expect(html).toContain("gcp");
      expect(html).toContain("azure");
      // All three should have tag icons
      const tagIconCount = (html.match(/data-icon="tag"/g) || []).length;
      expect(tagIconCount).toBe(3);
    });

    it("calls resolveModuleTags with the fetched module", async () => {
      const mod = fakeModule();
      mockGetModuleLatestVersion.mockResolvedValue(mod);
      mockGetModuleVersions.mockResolvedValue([{ version: "1.0.0" }]);
      mockResolveModuleTags.mockReturnValue(["aws"]);

      await renderPage(makeParams());

      expect(mockResolveModuleTags).toHaveBeenCalledWith(mod);
    });

    it("renders single tag when module has one provider", async () => {
      const mod = fakeModule({ tags: '["aws"]', provider: "aws" });
      mockGetModuleLatestVersion.mockResolvedValue(mod);
      mockGetModuleVersions.mockResolvedValue([{ version: "1.0.0" }]);
      mockResolveModuleTags.mockReturnValue(["aws"]);

      const html = await renderPage(makeParams());

      const tagIconCount = (html.match(/data-icon="tag"/g) || []).length;
      expect(tagIconCount).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // Preserved behavior: usage snippet keeps system in source path
  // --------------------------------------------------------------------------

  describe("usage snippet", () => {
    it("keeps system in the Terraform source path", async () => {
      const mod = fakeModule();
      mockGetModuleLatestVersion.mockResolvedValue(mod);
      mockGetModuleVersions.mockResolvedValue([{ version: "1.0.0" }]);
      mockResolveModuleTags.mockReturnValue(["aws"]);

      const html = await renderPage(makeParams());

      // The code block should still include the full path with system
      expect(html).toContain("stellaris.example.com/hashicorp/consul/aws");
    });
  });

  // --------------------------------------------------------------------------
  // Edge case: notFound when module is missing
  // --------------------------------------------------------------------------

  describe("error handling", () => {
    it("calls notFound when module is not found", async () => {
      mockGetModuleLatestVersion.mockResolvedValue(undefined);
      mockGetModuleVersions.mockResolvedValue([]);

      // notFound() in Next.js throws, so we simulate that behavior
      mockNotFound.mockImplementation(() => {
        throw new Error("NEXT_NOT_FOUND");
      });

      await expect(renderPage(makeParams())).rejects.toThrow("NEXT_NOT_FOUND");
      expect(mockNotFound).toHaveBeenCalled();
    });

    it("calls notFound when data fetch throws", async () => {
      mockGetModuleLatestVersion.mockRejectedValue(new Error("DB error"));
      mockGetModuleVersions.mockRejectedValue(new Error("DB error"));

      mockNotFound.mockImplementation(() => {
        throw new Error("NEXT_NOT_FOUND");
      });

      await expect(renderPage(makeParams())).rejects.toThrow("NEXT_NOT_FOUND");
      expect(mockNotFound).toHaveBeenCalled();
    });
  });
});
