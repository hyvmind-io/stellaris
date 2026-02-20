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
  getObject: vi.fn(),
}));

vi.mock("@/lib/validation/registry", () => ({
  providerArtifactParams: {
    safeParse: vi.fn(),
  },
}));

// ============================================================================
// Import mocked modules and route handler AFTER vi.mock() declarations
// ============================================================================

import { isStrictMode } from "@/lib/auth/registry-mode";
import { requireAuth } from "@/lib/auth/middleware";
import { getObject } from "@/lib/storage";
import { providerArtifactParams } from "@/lib/validation/registry";
import { GET } from "@/app/v1/providers/[namespace]/[type]/[version]/sha256sums.sig/route";

const mockIsStrictMode = vi.mocked(isStrictMode);
const mockRequireAuth = vi.mocked(requireAuth);
const mockGetObject = vi.mocked(getObject);
const mockProviderArtifactParams = vi.mocked(providerArtifactParams);

// ============================================================================
// Shared fixtures
// ============================================================================

const MOCK_PARAMS = {
  namespace: "hashicorp",
  type: "aws",
  version: "5.0.0",
};

const MOCK_API_KEY = {
  id: 1,
  keyHash: "abc",
  name: "test-key",
  description: null,
  permissions: ["providers:read"],
  createdAt: new Date(),
  lastUsedAt: null,
  expiresAt: null,
  userId: null,
};

const MOCK_SIG_OBJECT = {
  body: new ReadableStream(),
  text: vi.fn().mockResolvedValue(""),
  arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(64)),
};

function makeRequest(authHeader?: string): NextRequest {
  return new NextRequest(
    `http://localhost/v1/providers/${MOCK_PARAMS.namespace}/${MOCK_PARAMS.type}/${MOCK_PARAMS.version}/sha256sums.sig`,
    { headers: authHeader ? { Authorization: authHeader } : {} },
  );
}

function makeRouteParams(overrides?: Partial<typeof MOCK_PARAMS>): {
  params: Promise<typeof MOCK_PARAMS>;
} {
  return { params: Promise.resolve({ ...MOCK_PARAMS, ...overrides }) };
}

// ============================================================================
// Tests
// ============================================================================

describe("GET /v1/providers/[namespace]/[type]/[version]/sha256sums.sig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: validation passes, sig object exists
    mockProviderArtifactParams.safeParse.mockReturnValue({
      success: true,
      data: MOCK_PARAMS,
    } as ReturnType<typeof providerArtifactParams.safeParse>);
    mockGetObject.mockResolvedValue(
      MOCK_SIG_OBJECT as unknown as Awaited<ReturnType<typeof getObject>>,
    );
  });

  describe("relaxed mode", () => {
    beforeEach(() => {
      mockIsStrictMode.mockReturnValue(false);
    });

    it("serves SHA256SUMS.sig without authentication", async () => {
      const response = await GET(makeRequest(), makeRouteParams());
      expect(response.status).toBe(200);
      expect(mockGetObject).toHaveBeenCalledWith(
        `providers/${MOCK_PARAMS.namespace}/${MOCK_PARAMS.type}/${MOCK_PARAMS.version}/SHA256SUMS.sig`,
      );
    });

    it("does not call requireAuth even when auth header is present", async () => {
      const response = await GET(
        makeRequest("Bearer stlr_somekey"),
        makeRouteParams(),
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

      const response = await GET(makeRequest(), makeRouteParams());

      expect(response.status).toBe(401);
      expect(mockGetObject).not.toHaveBeenCalled();
    });

    it("returns 401 when API key is invalid", async () => {
      const unauthorizedResponse = new Response(
        JSON.stringify({ errors: ["Invalid or expired API key"] }),
        { status: 401 },
      );
      mockRequireAuth.mockResolvedValue(unauthorizedResponse);

      const response = await GET(
        makeRequest("Bearer stlr_invalid"),
        makeRouteParams(),
      );

      expect(response.status).toBe(401);
      expect(mockGetObject).not.toHaveBeenCalled();
    });

    it("returns 403 when API key lacks providers:read permission", async () => {
      const forbiddenResponse = new Response(
        JSON.stringify({
          errors: ["Missing required permission: providers:read"],
        }),
        { status: 403 },
      );
      mockRequireAuth.mockResolvedValue(forbiddenResponse);

      const response = await GET(
        makeRequest("Bearer stlr_noperm"),
        makeRouteParams(),
      );

      expect(response.status).toBe(403);
      expect(mockGetObject).not.toHaveBeenCalled();
    });

    it("serves SHA256SUMS.sig with valid Bearer + providers:read permission", async () => {
      mockRequireAuth.mockResolvedValue(MOCK_API_KEY);

      const response = await GET(
        makeRequest("Bearer stlr_valid"),
        makeRouteParams(),
      );

      expect(mockRequireAuth).toHaveBeenCalledWith(
        expect.anything(),
        "providers:read",
      );
      expect(response.status).toBe(200);
    });

    it("serves SHA256SUMS.sig with admin permission", async () => {
      const adminKey = { ...MOCK_API_KEY, permissions: ["admin"] };
      mockRequireAuth.mockResolvedValue(adminKey);

      const response = await GET(
        makeRequest("Bearer stlr_admin"),
        makeRouteParams(),
      );

      expect(response.status).toBe(200);
      expect(mockGetObject).toHaveBeenCalled();
    });
  });
});
