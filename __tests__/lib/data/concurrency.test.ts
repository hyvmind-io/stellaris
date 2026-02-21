import { describe, it, expect } from "vitest";
import { RevisionConflictError } from "@/lib/data/concurrency";

// ============================================================================
// RevisionConflictError
// ============================================================================

describe("RevisionConflictError", () => {
  it("is an instance of Error", () => {
    const error = new RevisionConflictError(3, 4);
    expect(error).toBeInstanceOf(Error);
  });

  it("has the correct name", () => {
    const error = new RevisionConflictError(3, 4);
    expect(error.name).toBe("RevisionConflictError");
  });

  it("includes the expected revision in the message", () => {
    const error = new RevisionConflictError(5, 6);
    expect(error.message).toContain("5");
    expect(error.message).toContain("revision");
  });

  it("stores the expectedRevision as a property", () => {
    const error = new RevisionConflictError(7, 8);
    expect(error.expectedRevision).toBe(7);
  });

  it("stores the currentRevision as a property", () => {
    const error = new RevisionConflictError(7, 8);
    expect(error.currentRevision).toBe(8);
  });

  it("works with revision 0", () => {
    const error = new RevisionConflictError(0, 1);
    expect(error.expectedRevision).toBe(0);
    expect(error.message).toContain("0");
  });

  it("supports unknown current revision", () => {
    const error = new RevisionConflictError(2, null);
    expect(error.currentRevision).toBeNull();
    expect(error.message).toContain("unknown");
  });

  it("has a stack trace", () => {
    const error = new RevisionConflictError(1, 2);
    expect(error.stack).toBeDefined();
  });

  it("can be caught as Error in try/catch", () => {
    try {
      throw new RevisionConflictError(2, 3);
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect(e).toBeInstanceOf(RevisionConflictError);
      if (e instanceof RevisionConflictError) {
        expect(e.expectedRevision).toBe(2);
        expect(e.currentRevision).toBe(3);
      }
    }
  });
});
