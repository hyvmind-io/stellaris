import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks — hoisted before any import of the module under test
// ============================================================================

// Core mock primitives — declared up-front so beforeEach can reset them
const mockGet = vi.fn();
const mockSelect = vi.fn();

vi.mock("@/db/client", () => ({
  getDb: () => ({
    select: mockSelect,
  }),
}));

vi.mock("@/db/schema", () => ({
  systemSettings: {
    key: "key",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a, b) => ({ column: a, value: b })),
}));

import { isSignupEnabled, SIGNUP_ENABLED_KEY } from "@/lib/data/settings";

// ============================================================================
// Helpers — rebuild the Drizzle fluent-query chain
// ============================================================================

/**
 * Rebuilds the select().from().where().get() chain for each test so that
 * individual `mockGet` implementations don't bleed across tests.
 */
function setupChain() {
  const mockWhere = vi.fn(() => ({ get: mockGet }));
  const mockFrom = vi.fn(() => ({ where: mockWhere }));
  mockSelect.mockReturnValue({ from: mockFrom });
}

// ============================================================================
// isSignupEnabled
// ============================================================================

describe("isSignupEnabled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockReset();
    setupChain();
  });

  it("returns true when no DB record exists (default)", async () => {
    mockGet.mockResolvedValue(undefined);

    const result = await isSignupEnabled();

    expect(result).toBe(true);
  });

  it("returns true when value is 'true'", async () => {
    mockGet.mockResolvedValue({ key: SIGNUP_ENABLED_KEY, value: "true" });

    const result = await isSignupEnabled();

    expect(result).toBe(true);
  });

  it("returns false when value is 'false'", async () => {
    mockGet.mockResolvedValue({ key: SIGNUP_ENABLED_KEY, value: "false" });

    const result = await isSignupEnabled();

    expect(result).toBe(false);
  });

  it("fails open (returns true) on DB error", async () => {
    mockGet.mockRejectedValue(new Error("D1_ERROR: connection timeout"));

    const result = await isSignupEnabled();

    expect(result).toBe(true);
  });
});

// ============================================================================
// SIGNUP_ENABLED_KEY constant
// ============================================================================

describe("SIGNUP_ENABLED_KEY", () => {
  it("constant is 'signup_enabled'", () => {
    expect(SIGNUP_ENABLED_KEY).toBe("signup_enabled");
  });
});
