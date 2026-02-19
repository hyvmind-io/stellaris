import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/middleware";

vi.mock("@/lib/auth/api-keys", () => ({
  validateApiKey: vi.fn(),
}));

import { validateApiKey } from "@/lib/auth/api-keys";
const mockValidateApiKey = vi.mocked(validateApiKey);

const MOCK_API_KEY = {
  id: 1,
  keyHash: "abc",
  name: "test-key",
  description: null,
  permissions: null,
  createdAt: new Date(),
  lastUsedAt: null,
  expiresAt: null,
  userId: null,
};

function makeRequest(authHeader?: string): NextRequest {
  return new NextRequest("http://localhost/v1/test", {
    headers: authHeader ? { Authorization: authHeader } : {},
  });
}

describe("requireAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("missing Authorization header", () => {
    it("returns 401 with error message", async () => {
      const result = await requireAuth(makeRequest());
      expect(result).toBeInstanceOf(Response);
      expect((result as Response).status).toBe(401);
      const body = (await (result as Response).json()) as { errors: string[] };
      expect(body.errors[0]).toContain("Missing Authorization header");
    });
  });

  describe("empty Bearer token", () => {
    it("returns 401 when Bearer value is empty", async () => {
      const result = await requireAuth(makeRequest("Bearer "));
      expect(result).toBeInstanceOf(Response);
      expect((result as Response).status).toBe(401);
    });
  });

  describe("invalid API key", () => {
    it("returns 401 when validateApiKey returns null", async () => {
      mockValidateApiKey.mockResolvedValue(null);
      const result = await requireAuth(makeRequest("Bearer stlr_invalid"));
      expect(result).toBeInstanceOf(Response);
      expect((result as Response).status).toBe(401);
      const body = (await (result as Response).json()) as { errors: string[] };
      expect(body.errors[0]).toContain("Invalid or expired API key");
    });
  });

  describe("valid Bearer token", () => {
    it("returns the ApiKey record on success", async () => {
      mockValidateApiKey.mockResolvedValue(MOCK_API_KEY);
      const result = await requireAuth(makeRequest("Bearer stlr_valid"));
      expect(result).not.toBeInstanceOf(Response);
      expect(result).toEqual(MOCK_API_KEY);
    });

    it("extracts the key by stripping 'Bearer ' prefix", async () => {
      mockValidateApiKey.mockResolvedValue(MOCK_API_KEY);
      await requireAuth(makeRequest("Bearer my-key-value"));
      expect(mockValidateApiKey).toHaveBeenCalledWith("my-key-value");
    });
  });

  describe("raw token (no Bearer prefix)", () => {
    it("accepts raw API key without Bearer prefix", async () => {
      mockValidateApiKey.mockResolvedValue(MOCK_API_KEY);
      const result = await requireAuth(makeRequest("stlr_rawkey"));
      expect(result).not.toBeInstanceOf(Response);
      expect(mockValidateApiKey).toHaveBeenCalledWith("stlr_rawkey");
    });
  });

  // ==========================================================================
  // Permission enforcement (SEC-008)
  // ==========================================================================

  describe("permission enforcement", () => {
    it("allows access when no permission is required (backward compat)", async () => {
      mockValidateApiKey.mockResolvedValue(MOCK_API_KEY);

      const result = await requireAuth(makeRequest("Bearer stlr_valid"));

      expect(result).not.toBeInstanceOf(Response);
      expect(result).toEqual(MOCK_API_KEY);
    });

    it("returns 403 when key has null permissions and permission is required", async () => {
      mockValidateApiKey.mockResolvedValue({
        ...MOCK_API_KEY,
        permissions: null,
      });

      const result = await requireAuth(
        makeRequest("Bearer stlr_valid"),
        "modules:read",
      );

      expect(result).toBeInstanceOf(Response);
      expect((result as Response).status).toBe(403);
    });

    it("allows access when key has the required permission", async () => {
      mockValidateApiKey.mockResolvedValue({
        ...MOCK_API_KEY,
        permissions: ["modules:read", "modules:write"],
      });

      const result = await requireAuth(
        makeRequest("Bearer stlr_valid"),
        "modules:read",
      );

      expect(result).not.toBeInstanceOf(Response);
      expect(result).toHaveProperty("name", "test-key");
    });

    it("returns 403 when key lacks the required permission", async () => {
      mockValidateApiKey.mockResolvedValue({
        ...MOCK_API_KEY,
        permissions: ["modules:read"],
      });

      const result = await requireAuth(
        makeRequest("Bearer stlr_valid"),
        "providers:write",
      );

      expect(result).toBeInstanceOf(Response);
      expect((result as Response).status).toBe(403);
    });

    it("admin permission grants access to any required permission", async () => {
      const adminKey = {
        ...MOCK_API_KEY,
        permissions: ["admin"],
      };

      mockValidateApiKey.mockResolvedValue(adminKey);

      // Test across multiple different permissions
      for (const perm of [
        "modules:read",
        "modules:write",
        "providers:read",
        "providers:write",
      ]) {
        const result = await requireAuth(
          makeRequest("Bearer stlr_admin"),
          perm,
        );
        expect(result).not.toBeInstanceOf(Response);
        expect(result).toHaveProperty("name", "test-key");
      }
    });

    it("returns 403 with descriptive message including the missing permission", async () => {
      mockValidateApiKey.mockResolvedValue({
        ...MOCK_API_KEY,
        permissions: ["modules:read"],
      });

      const result = await requireAuth(
        makeRequest("Bearer stlr_valid"),
        "providers:write",
      );

      expect(result).toBeInstanceOf(Response);
      expect((result as Response).status).toBe(403);
      const body = (await (result as Response).json()) as { errors: string[] };
      expect(body.errors[0]).toContain("providers:write");
    });
  });
});
