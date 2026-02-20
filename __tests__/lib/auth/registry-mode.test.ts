import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// NOTE: vi.mock() calls are hoisted by Vitest to the top of the file at
// compile-time, but we need per-test control over the env value.
// Strategy: mock @/lib/env as a getter so each test can swap it, then use
// vi.resetModules() + dynamic import() to re-run the module-level side effect.

vi.mock("@/lib/env", () => ({
  env: { PRIVATE_REGISTRY_MODE: "relaxed" },
}));

describe("isStrictMode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns false when PRIVATE_REGISTRY_MODE is relaxed", async () => {
    // Re-mock env with "relaxed" value before importing the module
    vi.doMock("@/lib/env", () => ({
      env: { PRIVATE_REGISTRY_MODE: "relaxed" },
    }));

    const { isStrictMode } = await import("@/lib/auth/registry-mode");
    expect(isStrictMode()).toBe(false);
  });

  it("returns true when PRIVATE_REGISTRY_MODE is strict", async () => {
    vi.doMock("@/lib/env", () => ({
      env: { PRIVATE_REGISTRY_MODE: "strict" },
    }));

    const { isStrictMode } = await import("@/lib/auth/registry-mode");
    expect(isStrictMode()).toBe(true);
  });

  it("emits console.warn at module load when strict mode is active", async () => {
    vi.doMock("@/lib/env", () => ({
      env: { PRIVATE_REGISTRY_MODE: "strict" },
    }));

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await import("@/lib/auth/registry-mode");

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("PRIVATE_REGISTRY_MODE=strict"),
    );
  });
});
