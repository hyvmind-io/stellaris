import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks — hoisted before any import of the module under test
// ============================================================================

const mockLimit = vi.fn().mockResolvedValue([]);
const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

const mockReturning = vi.fn().mockResolvedValue([]);
const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
const mockInsert = vi.fn().mockReturnValue({ values: mockValues });

const mockDeleteWhere = vi.fn().mockReturnValue({ returning: mockReturning });
const mockDeleteFrom = vi.fn().mockReturnValue({ where: mockDeleteWhere });

vi.mock("@/db/client", () => ({
  getDb: () => ({
    select: mockSelect,
    insert: mockInsert,
    delete: mockDeleteFrom,
  }),
}));

vi.mock("@/db/schema", () => ({
  moduleAliases: { _: "module_aliases_table" },
  providerAliases: { _: "provider_aliases_table" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => ({ _op: "eq", args })),
  and: vi.fn((...args: unknown[]) => ({ _op: "and", args })),
}));

import {
  resolveModuleAlias,
  findModuleAlias,
  resolveCanonicalModuleCoordinates,
  createModuleAlias,
  deleteModuleAlias,
  deleteModuleAliasesByTarget,
  resolveProviderAlias,
  findProviderAlias,
  createProviderAlias,
  deleteProviderAlias,
} from "@/lib/data/aliases";

// ============================================================================
// Setup
// ============================================================================

beforeEach(() => {
  vi.clearAllMocks();
  // Reset default returns
  mockLimit.mockResolvedValue([]);
  mockReturning.mockResolvedValue([]);
});

// ============================================================================
// resolveModuleAlias
// ============================================================================

describe("resolveModuleAlias", () => {
  it("returns undefined when no alias exists", async () => {
    mockLimit.mockResolvedValueOnce([]);
    const result = await resolveModuleAlias("old-ns", "old-name", "old-prov");
    expect(result).toBeUndefined();
  });

  it("returns target coordinates when alias exists", async () => {
    const target = {
      namespace: "new-ns",
      name: "new-name",
      provider: "new-prov",
    };
    mockLimit.mockResolvedValueOnce([target]);
    const result = await resolveModuleAlias("old-ns", "old-name", "old-prov");
    expect(result).toEqual(target);
  });

  it("calls select/from/where/limit in the right order", async () => {
    await resolveModuleAlias("ns", "name", "prov");
    expect(mockSelect).toHaveBeenCalled();
    expect(mockFrom).toHaveBeenCalled();
    expect(mockWhere).toHaveBeenCalled();
    expect(mockLimit).toHaveBeenCalledWith(1);
  });
});

// ============================================================================
// findModuleAlias
// ============================================================================

describe("findModuleAlias", () => {
  it("returns undefined when no alias exists", async () => {
    mockLimit.mockResolvedValueOnce([]);
    const result = await findModuleAlias("ns", "name", "prov");
    expect(result).toBeUndefined();
  });

  it("returns the full alias record when found", async () => {
    const alias = {
      id: 1,
      sourceNamespace: "old-ns",
      sourceName: "old-name",
      sourceProvider: "old-prov",
      targetNamespace: "new-ns",
      targetName: "new-name",
      targetProvider: "new-prov",
      createdBy: "admin",
      createdAt: new Date("2025-01-01"),
    };
    mockLimit.mockResolvedValueOnce([alias]);
    const result = await findModuleAlias("old-ns", "old-name", "old-prov");
    expect(result).toEqual(alias);
  });
});

describe("resolveCanonicalModuleCoordinates", () => {
  it("returns source coordinates when alias does not exist", async () => {
    mockLimit.mockResolvedValueOnce([]);
    const result = await resolveCanonicalModuleCoordinates(
      "ns",
      "name",
      "prov",
    );
    expect(result).toEqual({
      namespace: "ns",
      name: "name",
      provider: "prov",
      aliased: false,
    });
  });

  it("returns target coordinates when alias exists", async () => {
    mockLimit.mockResolvedValueOnce([
      { namespace: "new-ns", name: "new-name", provider: "new-prov" },
    ]);
    const result = await resolveCanonicalModuleCoordinates(
      "old",
      "name",
      "prov",
    );
    expect(result).toEqual({
      namespace: "new-ns",
      name: "new-name",
      provider: "new-prov",
      aliased: true,
    });
  });
});

// ============================================================================
// createModuleAlias
// ============================================================================

describe("createModuleAlias", () => {
  it("inserts and returns the created alias", async () => {
    const created = {
      id: 1,
      sourceNamespace: "old-ns",
      sourceName: "old-name",
      sourceProvider: "old-prov",
      targetNamespace: "new-ns",
      targetName: "new-name",
      targetProvider: "new-prov",
      createdBy: "admin",
      createdAt: new Date("2025-01-01"),
    };
    mockReturning.mockResolvedValueOnce([created]);

    const result = await createModuleAlias({
      sourceNamespace: "old-ns",
      sourceName: "old-name",
      sourceProvider: "old-prov",
      targetNamespace: "new-ns",
      targetName: "new-name",
      targetProvider: "new-prov",
      createdBy: "admin",
    });

    expect(result).toEqual(created);
    expect(mockInsert).toHaveBeenCalled();
  });
});

// ============================================================================
// deleteModuleAlias
// ============================================================================

describe("deleteModuleAlias", () => {
  it("returns undefined when alias does not exist", async () => {
    mockReturning.mockResolvedValueOnce([]);
    const result = await deleteModuleAlias("ns", "name", "prov");
    expect(result).toBeUndefined();
  });

  it("returns the deleted alias when found", async () => {
    const deleted = {
      id: 1,
      sourceNamespace: "ns",
      sourceName: "name",
      sourceProvider: "prov",
      targetNamespace: "t-ns",
      targetName: "t-name",
      targetProvider: "t-prov",
      createdBy: null,
      createdAt: new Date("2025-01-01"),
    };
    mockReturning.mockResolvedValueOnce([deleted]);
    const result = await deleteModuleAlias("ns", "name", "prov");
    expect(result).toEqual(deleted);
  });
});

describe("deleteModuleAliasesByTarget", () => {
  it("returns deleted aliases targeting canonical tuple", async () => {
    const deletedRows = [
      {
        id: 1,
        sourceNamespace: "old",
        sourceName: "name",
        sourceProvider: "prov",
        targetNamespace: "new",
        targetName: "name",
        targetProvider: "prov",
        createdBy: null,
        createdAt: new Date("2025-01-01"),
      },
    ];
    mockReturning.mockResolvedValueOnce(deletedRows);

    const result = await deleteModuleAliasesByTarget("new", "name", "prov");
    expect(result).toEqual(deletedRows);
  });
});

// ============================================================================
// resolveProviderAlias
// ============================================================================

describe("resolveProviderAlias", () => {
  it("returns undefined when no alias exists", async () => {
    mockLimit.mockResolvedValueOnce([]);
    const result = await resolveProviderAlias("old-ns", "old-type");
    expect(result).toBeUndefined();
  });

  it("returns target coordinates when alias exists", async () => {
    const target = { namespace: "new-ns", type: "new-type" };
    mockLimit.mockResolvedValueOnce([target]);
    const result = await resolveProviderAlias("old-ns", "old-type");
    expect(result).toEqual(target);
  });
});

// ============================================================================
// findProviderAlias
// ============================================================================

describe("findProviderAlias", () => {
  it("returns undefined when no alias exists", async () => {
    mockLimit.mockResolvedValueOnce([]);
    const result = await findProviderAlias("ns", "type");
    expect(result).toBeUndefined();
  });

  it("returns the full alias record when found", async () => {
    const alias = {
      id: 1,
      sourceNamespace: "old-ns",
      sourceType: "old-type",
      targetNamespace: "new-ns",
      targetType: "new-type",
      createdBy: null,
      createdAt: new Date("2025-01-01"),
    };
    mockLimit.mockResolvedValueOnce([alias]);
    const result = await findProviderAlias("old-ns", "old-type");
    expect(result).toEqual(alias);
  });
});

// ============================================================================
// createProviderAlias
// ============================================================================

describe("createProviderAlias", () => {
  it("inserts and returns the created alias", async () => {
    const created = {
      id: 1,
      sourceNamespace: "old-ns",
      sourceType: "old-type",
      targetNamespace: "new-ns",
      targetType: "new-type",
      createdBy: "admin",
      createdAt: new Date("2025-01-01"),
    };
    mockReturning.mockResolvedValueOnce([created]);

    const result = await createProviderAlias({
      sourceNamespace: "old-ns",
      sourceType: "old-type",
      targetNamespace: "new-ns",
      targetType: "new-type",
      createdBy: "admin",
    });

    expect(result).toEqual(created);
    expect(mockInsert).toHaveBeenCalled();
  });
});

// ============================================================================
// deleteProviderAlias
// ============================================================================

describe("deleteProviderAlias", () => {
  it("returns undefined when alias does not exist", async () => {
    mockReturning.mockResolvedValueOnce([]);
    const result = await deleteProviderAlias("ns", "type");
    expect(result).toBeUndefined();
  });

  it("returns the deleted alias when found", async () => {
    const deleted = {
      id: 1,
      sourceNamespace: "ns",
      sourceType: "type",
      targetNamespace: "t-ns",
      targetType: "t-type",
      createdBy: null,
      createdAt: new Date("2025-01-01"),
    };
    mockReturning.mockResolvedValueOnce([deleted]);
    const result = await deleteProviderAlias("ns", "type");
    expect(result).toEqual(deleted);
  });
});
