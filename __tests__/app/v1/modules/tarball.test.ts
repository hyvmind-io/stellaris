import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ============================================================================
// Mocks — must be hoisted before any import that transitively loads the mocked
// modules. vi.mock() is statically hoisted by Vitest's transformer.
// ============================================================================

vi.mock("@/lib/auth/registry-mode", () => ({
  isStrictMode: vi.fn(),
}));

vi.mock("@/lib/auth/middleware", () => ({
  requireAuth: vi.fn(),
}));

vi.mock("@/lib/storage", () => ({
  getModuleTarball: vi.fn(),
}));

vi.mock("@/lib/data/modules", () => ({
  incrementModuleDownloads: vi.fn(),
}));

vi.mock("@/lib/storage/keys", () => ({
  parseModuleKey: vi.fn(),
}));

// ============================================================================
// Import mocked modules and route handler AFTER vi.mock() declarations
// ============================================================================

import { isStrictMode } from "@/lib/auth/registry-mode";
import { requireAuth } from "@/lib/auth/middleware";
import { getModuleTarball } from "@/lib/storage";
import { incrementModuleDownloads } from "@/lib/data/modules";
import { parseModuleKey } from "@/lib/storage/keys";
import { GET } from "@/app/v1/modules/tarball/[...path]/route";

const mockIsStrictMode = vi.mocked(isStrictMode);
const mockRequireAuth = vi.mocked(requireAuth);
const mockGetModuleTarball = vi.mocked(getModuleTarball);
const mockIncrementModuleDownloads = vi.mocked(incrementModuleDownloads);
const mockParseModuleKey = vi.mocked(parseModuleKey);

// ============================================================================
// Shared fixtures
// ============================================================================

const MOCK_TARBALL_PATH = ["hashicorp", "consul", "aws", "0.1.0.tar.gz"];

const MOCK_API_KEY = {
  id: 1,
  keyHash: "abc",
  name: "test-key",
  description: null,
  permissions: ["modules:read"],
  createdAt: new Date(),
  lastUsedAt: null,
  expiresAt: null,
  userId: null,
};

const MOCK_TARBALL_OBJECT = {
  body: new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("fake-tarball-data"));
      controller.close();
    },
  }),
};

function makeRequest(authHeader?: string): NextRequest {
  return new NextRequest(
    `http://localhost/v1/modules/tarball/${MOCK_TARBALL_PATH.join("/")}`,
    { headers: authHeader ? { Authorization: authHeader } : {} },
  );
}

function makeParams(path: string[] = MOCK_TARBALL_PATH): {
  params: Promise<{ path: string[] }>;
} {
  return { params: Promise.resolve({ path }) };
}

// ============================================================================
// Tests
// ============================================================================

describe("GET /v1/modules/tarball/[...path]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: tarball exists, download counter succeeds, key parses correctly
    mockGetModuleTarball.mockResolvedValue(
      MOCK_TARBALL_OBJECT as unknown as Awaited<
        ReturnType<typeof getModuleTarball>
      >,
    );
    mockIncrementModuleDownloads.mockResolvedValue(undefined);
    mockParseModuleKey.mockReturnValue({
      namespace: "hashicorp",
      name: "consul",
      provider: "aws",
      version: "0.1.0",
    });
  });

  describe("relaxed mode", () => {
    beforeEach(() => {
      mockIsStrictMode.mockReturnValue(false);
    });

    it("serves tarball without authentication", async () => {
      const response = await GET(makeRequest(), makeParams());
      expect(response.status).toBe(200);
      expect(mockGetModuleTarball).toHaveBeenCalledWith(
        MOCK_TARBALL_PATH.join("/"),
      );
    });

    it("does not call requireAuth even when auth header is present", async () => {
      const response = await GET(
        makeRequest("Bearer stlr_somekey"),
        makeParams(),
      );
      expect(mockRequireAuth).not.toHaveBeenCalled();
      expect(response.status).toBe(200);
    });
  });

  describe("strict mode", () => {
    beforeEach(() => {
      mockIsStrictMode.mockReturnValue(true);
    });

    it("returns 401 when no Authorization header is provided", async () => {
      const unauthorizedResponse = new Response(
        JSON.stringify({ errors: ["Missing Authorization header"] }),
        { status: 401 },
      );
      mockRequireAuth.mockResolvedValue(unauthorizedResponse);

      const response = await GET(makeRequest(), makeParams());

      expect(response.status).toBe(401);
      expect(mockGetModuleTarball).not.toHaveBeenCalled();
    });

    it("returns 401 when API key is invalid", async () => {
      const unauthorizedResponse = new Response(
        JSON.stringify({ errors: ["Invalid or expired API key"] }),
        { status: 401 },
      );
      mockRequireAuth.mockResolvedValue(unauthorizedResponse);

      const response = await GET(
        makeRequest("Bearer stlr_invalid"),
        makeParams(),
      );

      expect(response.status).toBe(401);
      expect(mockGetModuleTarball).not.toHaveBeenCalled();
    });

    it("returns 403 when API key lacks modules:read permission", async () => {
      const forbiddenResponse = new Response(
        JSON.stringify({
          errors: ["Missing required permission: modules:read"],
        }),
        { status: 403 },
      );
      mockRequireAuth.mockResolvedValue(forbiddenResponse);

      const response = await GET(
        makeRequest("Bearer stlr_noperm"),
        makeParams(),
      );

      expect(response.status).toBe(403);
      expect(mockGetModuleTarball).not.toHaveBeenCalled();
    });

    it("serves tarball with valid Bearer + modules:read permission", async () => {
      mockRequireAuth.mockResolvedValue(MOCK_API_KEY);

      const response = await GET(
        makeRequest("Bearer stlr_valid"),
        makeParams(),
      );

      expect(mockRequireAuth).toHaveBeenCalledWith(
        expect.anything(),
        "modules:read",
      );
      expect(response.status).toBe(200);
    });

    it("serves tarball with admin permission", async () => {
      const adminKey = { ...MOCK_API_KEY, permissions: ["admin"] };
      mockRequireAuth.mockResolvedValue(adminKey);

      const response = await GET(
        makeRequest("Bearer stlr_admin"),
        makeParams(),
      );

      expect(response.status).toBe(200);
      expect(mockGetModuleTarball).toHaveBeenCalled();
    });
  });
});
