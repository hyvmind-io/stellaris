import { describe, it, expect } from "vitest";
import {
  MAX_MODULE_SIZE,
  MAX_PROVIDER_ZIP_SIZE,
} from "@/lib/validation/limits";

describe("Upload size limits", () => {
  it("MAX_MODULE_SIZE is 50 MB", () => {
    expect(MAX_MODULE_SIZE).toBe(50 * 1024 * 1024);
  });

  it("MAX_PROVIDER_ZIP_SIZE is 100 MB", () => {
    expect(MAX_PROVIDER_ZIP_SIZE).toBe(100 * 1024 * 1024);
  });
});
