import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks — hoisted before any import of the module under test
// ============================================================================

const mockGetAuth = vi.fn();
const mockIsSignupEnabled = vi.fn();
const mockSetSignupEnabled = vi.fn();

vi.mock("@/lib/auth/get-auth", () => ({
  getAuth: () => mockGetAuth(),
}));

vi.mock("@/lib/data/settings", () => ({
  isSignupEnabled: () => mockIsSignupEnabled(),
  setSignupEnabled: (enabled: boolean) => mockSetSignupEnabled(enabled),
}));

import { getSignupStatusAction, toggleSignupAction } from "@/app/actions/admin";

// ============================================================================
// Shared fixtures
// ============================================================================

const adminUser = {
  user: {
    id: 1,
    email: "admin@example.com",
    username: "admin",
    role: "admin" as const,
    passwordHash: "hash",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  sessionId: "session-123",
};

// ============================================================================
// getSignupStatusAction
// ============================================================================

describe("getSignupStatusAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when signup is enabled", async () => {
    mockIsSignupEnabled.mockResolvedValue(true);

    const result = await getSignupStatusAction();

    expect(result).toBe(true);
  });

  it("returns false when signup is disabled", async () => {
    mockIsSignupEnabled.mockResolvedValue(false);

    const result = await getSignupStatusAction();

    expect(result).toBe(false);
  });

  it("returns true (fail-open) on error", async () => {
    mockIsSignupEnabled.mockRejectedValue(new Error("DB unavailable"));

    const result = await getSignupStatusAction();

    expect(result).toBe(true);
  });
});

// ============================================================================
// toggleSignupAction
// ============================================================================

describe("toggleSignupAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // Auth guard
  // --------------------------------------------------------------------------

  it("returns error when not authenticated", async () => {
    mockGetAuth.mockResolvedValue(null);

    const result = await toggleSignupAction(false);

    expect(result).toEqual({ success: false, error: "Not authenticated" });
    expect(mockSetSignupEnabled).not.toHaveBeenCalled();
  });

  it("returns error when not admin (role: user)", async () => {
    mockGetAuth.mockResolvedValue({
      user: { role: "user" },
      sessionId: "s1",
    });

    const result = await toggleSignupAction(false);

    expect(result).toEqual({ success: false, error: "Admin access required" });
    expect(mockSetSignupEnabled).not.toHaveBeenCalled();
  });

  it("returns error when not admin (role: guest)", async () => {
    mockGetAuth.mockResolvedValue({
      user: { role: "guest" },
      sessionId: "s2",
    });

    const result = await toggleSignupAction(false);

    expect(result).toEqual({ success: false, error: "Admin access required" });
    expect(mockSetSignupEnabled).not.toHaveBeenCalled();
  });

  // --------------------------------------------------------------------------
  // Successful toggle
  // --------------------------------------------------------------------------

  it("successfully toggles signup off when admin", async () => {
    mockGetAuth.mockResolvedValue(adminUser);
    mockSetSignupEnabled.mockResolvedValue(undefined);

    const result = await toggleSignupAction(false);

    expect(result).toEqual({ success: true, enabled: false });
    expect(mockSetSignupEnabled).toHaveBeenCalledWith(false);
  });

  it("successfully toggles signup on when admin", async () => {
    mockGetAuth.mockResolvedValue(adminUser);
    mockSetSignupEnabled.mockResolvedValue(undefined);

    const result = await toggleSignupAction(true);

    expect(result).toEqual({ success: true, enabled: true });
    expect(mockSetSignupEnabled).toHaveBeenCalledWith(true);
  });

  // --------------------------------------------------------------------------
  // setSignupEnabled failure
  // --------------------------------------------------------------------------

  it("returns error when setSignupEnabled throws", async () => {
    mockGetAuth.mockResolvedValue(adminUser);
    mockSetSignupEnabled.mockRejectedValue(new Error("D1_ERROR: disk full"));

    const result = await toggleSignupAction(true);

    expect(result).toEqual({ success: false, error: "D1_ERROR: disk full" });
  });
});
