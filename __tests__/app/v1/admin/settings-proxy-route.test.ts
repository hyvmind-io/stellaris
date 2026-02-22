import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/lib/auth/middleware", () => ({
  requireAuth: vi.fn(),
}));

vi.mock("@/lib/validation/registry", () => ({
  proxySettingsPatch: {
    safeParse: vi.fn(),
  },
}));

vi.mock("@/lib/upstream/config-service", () => ({
  getProxySettingsSnapshot: vi.fn(),
  updateProxySettings: vi.fn(),
}));

import { GET, PATCH } from "@/app/v1/admin/settings/proxy/route";
import { requireAuth } from "@/lib/auth/middleware";
import { proxySettingsPatch } from "@/lib/validation/registry";
import {
  getProxySettingsSnapshot,
  updateProxySettings,
} from "@/lib/upstream/config-service";

const mockRequireAuth = vi.mocked(requireAuth);
const mockProxySettingsPatch = vi.mocked(proxySettingsPatch);
const mockGetProxySettingsSnapshot = vi.mocked(getProxySettingsSnapshot);
const mockUpdateProxySettings = vi.mocked(updateProxySettings);

describe("/v1/admin/settings/proxy route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({
      id: 1,
      name: "admin-key",
      permissions: ["admin"],
    } as never);
  });

  describe("GET", () => {
    it("returns auth response when permission check fails", async () => {
      mockRequireAuth.mockResolvedValue(
        NextResponse.json({ errors: ["Unauthorized"] }, { status: 401 }),
      );

      const request = new NextRequest(
        "http://localhost/v1/admin/settings/proxy",
      );
      const response = await GET(request);

      expect(response.status).toBe(401);
      expect(mockGetProxySettingsSnapshot).not.toHaveBeenCalled();
    });

    it("returns effective settings plus raw overrides", async () => {
      mockGetProxySettingsSnapshot.mockResolvedValue({
        module_proxy_enabled: true,
        provider_proxy_enabled: false,
        module_upstream_registries: ["https://registry.opentofu.org"],
        provider_upstream_registries: ["https://registry.terraform.io"],
        overrides: {
          module_proxy_enabled: "true",
          provider_proxy_enabled: null,
          module_upstream_registries: null,
          provider_upstream_registries: ["https://registry.terraform.io"],
        },
      });

      const request = new NextRequest(
        "http://localhost/v1/admin/settings/proxy",
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockRequireAuth).toHaveBeenCalledWith(request, "admin");
      expect(mockGetProxySettingsSnapshot).toHaveBeenCalledWith({
        includeOverrides: true,
      });
      expect(await response.json()).toEqual({
        module_proxy_enabled: true,
        provider_proxy_enabled: false,
        module_upstream_registries: ["https://registry.opentofu.org"],
        provider_upstream_registries: ["https://registry.terraform.io"],
        overrides: {
          module_proxy_enabled: "true",
          provider_proxy_enabled: null,
          module_upstream_registries: null,
          provider_upstream_registries: ["https://registry.terraform.io"],
        },
      });
    });

    it("returns 500 when service read fails", async () => {
      mockGetProxySettingsSnapshot.mockRejectedValue(
        new Error("D1 read error"),
      );

      const request = new NextRequest(
        "http://localhost/v1/admin/settings/proxy",
      );
      const response = await GET(request);

      expect(response.status).toBe(500);
    });
  });

  describe("PATCH", () => {
    it("returns auth response when permission check fails", async () => {
      mockRequireAuth.mockResolvedValue(
        NextResponse.json({ errors: ["Forbidden"] }, { status: 403 }),
      );

      const request = new NextRequest(
        "http://localhost/v1/admin/settings/proxy",
        {
          method: "PATCH",
          body: JSON.stringify({ module_proxy_enabled: true }),
        },
      );

      const response = await PATCH(request);
      expect(response.status).toBe(403);
      expect(mockProxySettingsPatch.safeParse).not.toHaveBeenCalled();
    });

    it("returns 422 for validation errors", async () => {
      mockProxySettingsPatch.safeParse.mockReturnValue({
        success: false,
        error: {
          issues: [{ message: "At least one field must be provided" }],
        },
      } as never);

      const request = new NextRequest(
        "http://localhost/v1/admin/settings/proxy",
        {
          method: "PATCH",
          body: JSON.stringify({}),
        },
      );

      const response = await PATCH(request);

      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({
        errors: ["At least one field must be provided"],
      });
      expect(mockUpdateProxySettings).not.toHaveBeenCalled();
    });

    it("updates via shared service and returns effective settings", async () => {
      const parsedData = {
        module_proxy_enabled: true,
        provider_upstream_registries: ["https://registry.terraform.io"],
      };

      mockProxySettingsPatch.safeParse.mockReturnValue({
        success: true,
        data: parsedData,
      } as never);

      mockUpdateProxySettings.mockResolvedValue({
        module_proxy_enabled: true,
        provider_proxy_enabled: false,
        module_upstream_registries: ["https://registry.opentofu.org"],
        provider_upstream_registries: ["https://registry.terraform.io"],
      });

      const request = new NextRequest(
        "http://localhost/v1/admin/settings/proxy",
        {
          method: "PATCH",
          body: JSON.stringify(parsedData),
        },
      );

      const response = await PATCH(request);

      expect(response.status).toBe(200);
      expect(mockUpdateProxySettings).toHaveBeenCalledWith(parsedData);
      expect(await response.json()).toEqual({
        module_proxy_enabled: true,
        provider_proxy_enabled: false,
        module_upstream_registries: ["https://registry.opentofu.org"],
        provider_upstream_registries: ["https://registry.terraform.io"],
      });
    });

    it("passes through null values to clear DB overrides", async () => {
      const parsedData = {
        module_upstream_registries: null,
        provider_upstream_registries: null,
      };

      mockProxySettingsPatch.safeParse.mockReturnValue({
        success: true,
        data: parsedData,
      } as never);

      mockUpdateProxySettings.mockResolvedValue({
        module_proxy_enabled: true,
        provider_proxy_enabled: true,
        module_upstream_registries: ["https://registry.opentofu.org"],
        provider_upstream_registries: ["https://registry.terraform.io"],
      });

      const request = new NextRequest(
        "http://localhost/v1/admin/settings/proxy",
        {
          method: "PATCH",
          body: JSON.stringify(parsedData),
        },
      );

      const response = await PATCH(request);

      expect(response.status).toBe(200);
      expect(mockUpdateProxySettings).toHaveBeenCalledWith(parsedData);
    });

    it("passes through explicit empty arrays to disable upstream fallback", async () => {
      const parsedData = {
        module_upstream_registries: [],
        provider_upstream_registries: [],
      };

      mockProxySettingsPatch.safeParse.mockReturnValue({
        success: true,
        data: parsedData,
      } as never);

      mockUpdateProxySettings.mockResolvedValue({
        module_proxy_enabled: true,
        provider_proxy_enabled: true,
        module_upstream_registries: [],
        provider_upstream_registries: [],
      });

      const request = new NextRequest(
        "http://localhost/v1/admin/settings/proxy",
        {
          method: "PATCH",
          body: JSON.stringify(parsedData),
        },
      );

      const response = await PATCH(request);

      expect(response.status).toBe(200);
      expect(mockUpdateProxySettings).toHaveBeenCalledWith(parsedData);
    });

    it("returns 500 when service update fails", async () => {
      mockProxySettingsPatch.safeParse.mockReturnValue({
        success: true,
        data: { module_proxy_enabled: false },
      } as never);
      mockUpdateProxySettings.mockRejectedValue(new Error("D1 write error"));

      const request = new NextRequest(
        "http://localhost/v1/admin/settings/proxy",
        {
          method: "PATCH",
          body: JSON.stringify({ module_proxy_enabled: false }),
        },
      );

      const response = await PATCH(request);
      expect(response.status).toBe(500);
    });
  });
});
