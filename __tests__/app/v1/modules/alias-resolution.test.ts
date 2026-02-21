import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/middleware", () => ({
  requireAuth: vi.fn(),
}));

vi.mock("@/lib/data/aliases", () => ({
  resolveCanonicalModuleCoordinates: vi.fn(),
}));

vi.mock("@/lib/data/modules", () => ({
  resolveModuleVersions: vi.fn(),
  resolveModuleLatestVersion: vi.fn(),
  resolveModule: vi.fn(),
  resolveModuleTags: vi.fn(() => ["aws"]),
}));

vi.mock("@/lib/upstream/proxy", () => ({
  proxyModuleJson: vi.fn(),
}));

import { requireAuth } from "@/lib/auth/middleware";
import { resolveCanonicalModuleCoordinates } from "@/lib/data/aliases";
import {
  resolveModule,
  resolveModuleLatestVersion,
  resolveModuleVersions,
} from "@/lib/data/modules";
import { GET as getVersions } from "@/app/v1/modules/[namespace]/[name]/[system]/versions/route";
import { GET as getLatest } from "@/app/v1/modules/[namespace]/[name]/[system]/route";
import { GET as getDownload } from "@/app/v1/modules/[namespace]/[name]/[system]/[version]/download/route";

const mockRequireAuth = vi.mocked(requireAuth);
const mockResolveCanonicalModuleCoordinates = vi.mocked(
  resolveCanonicalModuleCoordinates,
);
const mockResolveModuleVersions = vi.mocked(resolveModuleVersions);
const mockResolveModuleLatestVersion = vi.mocked(resolveModuleLatestVersion);
const mockResolveModule = vi.mocked(resolveModule);

const apiKey = {
  id: 1,
  keyHash: "hash",
  name: "reader",
  description: null,
  permissions: ["modules:read"],
  createdAt: new Date(),
  lastUsedAt: null,
  expiresAt: null,
  userId: null,
};

describe("public module alias resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(apiKey);
    mockResolveCanonicalModuleCoordinates.mockResolvedValue({
      namespace: "canonical-ns",
      name: "canonical-name",
      provider: "aws",
      aliased: true,
    });
  });

  it("resolves alias before listing versions", async () => {
    mockResolveModuleVersions.mockResolvedValue([{ version: "1.2.3" }]);

    const request = new NextRequest(
      "http://localhost/v1/modules/old/vpc/aws/versions",
      { method: "GET" },
    );

    const response = await getVersions(request, {
      params: Promise.resolve({ namespace: "old", name: "vpc", system: "aws" }),
    });

    expect(response.status).toBe(200);
    expect(mockResolveCanonicalModuleCoordinates).toHaveBeenCalledWith(
      "old",
      "vpc",
      "aws",
    );
    expect(mockResolveModuleVersions).toHaveBeenCalledWith(
      "canonical-ns",
      "canonical-name",
      "aws",
    );
  });

  it("resolves alias before latest lookup", async () => {
    mockResolveModuleLatestVersion.mockResolvedValue({
      id: 1,
      namespace: "canonical-ns",
      name: "canonical-name",
      provider: "aws",
      version: "2.0.0",
      owner: "owner",
      description: null,
      source: null,
      location: "canonical-ns/canonical-name/aws/2.0.0.tar.gz",
      definition: null,
      downloads: 0,
      publishedAt: new Date("2026-01-01T00:00:00.000Z"),
      tags: '["aws"]',
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      revision: 1,
    });

    const request = new NextRequest("http://localhost/v1/modules/old/vpc/aws", {
      method: "GET",
    });

    const response = await getLatest(request, {
      params: Promise.resolve({ namespace: "old", name: "vpc", system: "aws" }),
    });

    expect(response.status).toBe(200);
    expect(mockResolveModuleLatestVersion).toHaveBeenCalledWith(
      "canonical-ns",
      "canonical-name",
      "aws",
    );
  });

  it("resolves alias before version download", async () => {
    mockResolveModule.mockResolvedValue({
      id: 1,
      namespace: "canonical-ns",
      name: "canonical-name",
      provider: "aws",
      version: "2.0.0",
      owner: "owner",
      description: null,
      source: null,
      location: "canonical-ns/canonical-name/aws/2.0.0.tar.gz",
      definition: null,
      downloads: 0,
      publishedAt: new Date("2026-01-01T00:00:00.000Z"),
      tags: '["aws"]',
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      revision: 1,
    });

    const request = new NextRequest(
      "http://localhost/v1/modules/old/vpc/aws/2.0.0/download",
      { method: "GET" },
    );

    const response = await getDownload(request, {
      params: Promise.resolve({
        namespace: "old",
        name: "vpc",
        system: "aws",
        version: "2.0.0",
      }),
    });

    expect(response.status).toBe(200);
    expect(mockResolveModule).toHaveBeenCalledWith(
      "canonical-ns",
      "canonical-name",
      "aws",
      "2.0.0",
    );
  });
});
