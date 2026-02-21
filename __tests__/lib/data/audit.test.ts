import { describe, it, expect, vi } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

const mockReturning = vi.fn().mockResolvedValue([
  {
    id: 1,
    action: "module.create",
    resourceType: "module",
    resourceId: "hashicorp/consul/aws/1.0.0",
    actorId: "admin-key",
    actorType: "api_key",
    metadata: null,
    createdAt: new Date("2025-01-01"),
  },
]);

const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
const mockInsert = vi.fn().mockReturnValue({ values: mockValues });

vi.mock("@/db/client", () => ({
  getDb: () => ({ insert: mockInsert }),
}));

vi.mock("@/db/schema", () => ({
  auditLogs: { _: "audit_logs_table" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
}));

import {
  writeAuditLog,
  buildModuleAuditMetadata,
  buildProviderAuditMetadata,
} from "@/lib/data/audit";
import type { WriteAuditLogParams } from "@/lib/data/audit";

// ============================================================================
// writeAuditLog
// ============================================================================

describe("writeAuditLog", () => {
  it("calls insert on the auditLogs table", async () => {
    const params: WriteAuditLogParams = {
      action: "module.create",
      resourceType: "module",
      resourceId: "hashicorp/consul/aws/1.0.0",
      actorId: "admin-key",
      actorType: "api_key",
    };

    const result = await writeAuditLog(params);
    expect(mockInsert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalled();
    expect(mockReturning).toHaveBeenCalled();
    expect(result.action).toBe("module.create");
  });

  it("passes metadata as null when not provided", async () => {
    await writeAuditLog({
      action: "module.delete",
      resourceType: "module",
      resourceId: "hashicorp/consul/aws/1.0.0",
    });

    const callArgs = mockValues.mock.calls[mockValues.mock.calls.length - 1];
    const insertedValues = callArgs?.[0] as Record<string, unknown>;
    expect(insertedValues.metadata).toBeNull();
  });

  it("passes metadata when provided", async () => {
    const metadata = { oldDescription: "old", newDescription: "new" };
    await writeAuditLog({
      action: "module.update",
      resourceType: "module",
      resourceId: "hashicorp/consul/aws/1.0.0",
      metadata,
    });

    const callArgs = mockValues.mock.calls[mockValues.mock.calls.length - 1];
    const insertedValues = callArgs?.[0] as Record<string, unknown>;
    expect(insertedValues.metadata).toEqual(metadata);
  });

  it("returns the created audit log entry", async () => {
    const result = await writeAuditLog({
      action: "module.create",
      resourceType: "module",
      resourceId: "hashicorp/consul/aws/1.0.0",
    });

    expect(result).toHaveProperty("id", 1);
    expect(result).toHaveProperty("action", "module.create");
    expect(result).toHaveProperty("resourceType", "module");
  });
});

describe("audit metadata builders", () => {
  it("builds module metadata with explicit entity shape", () => {
    const metadata = buildModuleAuditMetadata({
      namespace: "hashicorp",
      name: "consul",
      provider: "aws",
      version: "1.0.0",
      changedFields: ["description"],
      revision: {
        expectedRevision: 2,
        nextRevision: 3,
      },
    });

    expect(metadata.entity).toBe("module");
    expect(metadata.name).toBe("consul");
    expect(metadata.revision?.nextRevision).toBe(3);
  });

  it("builds provider metadata with explicit entity shape", () => {
    const metadata = buildProviderAuditMetadata({
      namespace: "hashicorp",
      type: "aws",
      version: "5.0.0",
      os: "linux",
      arch: "amd64",
      changedFields: ["protocols"],
    });

    expect(metadata.entity).toBe("provider");
    expect(metadata.type).toBe("aws");
    expect(metadata.os).toBe("linux");
  });
});
