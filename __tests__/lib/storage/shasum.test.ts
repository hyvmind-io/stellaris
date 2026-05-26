import { describe, it, expect } from "vitest";
import { extractShasumForFile, sha256Hex } from "@/lib/storage/shasum";

describe("sha256Hex", () => {
  it("computes the lowercase hex SHA-256 of a file", async () => {
    // SHA-256 of the empty string.
    const file = new File([], "empty.zip");
    expect(await sha256Hex(file)).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});

describe("extractShasumForFile", () => {
  const sum =
    "abababababababababababababababababababababababababababababababab";

  it("extracts the checksum from a two-space (text mode) line", () => {
    const text = `${sum}  terraform-provider-foo_1.0.0_linux_amd64.zip\n`;
    expect(
      extractShasumForFile(text, "terraform-provider-foo_1.0.0_linux_amd64.zip"),
    ).toBe(sum);
  });

  it("extracts the checksum from a binary-mode (space + asterisk) line", () => {
    const text = `${sum} *terraform-provider-foo_1.0.0_darwin_arm64.zip\n`;
    expect(
      extractShasumForFile(
        text,
        "terraform-provider-foo_1.0.0_darwin_arm64.zip",
      ),
    ).toBe(sum);
  });

  it("returns undefined when no line matches the filename", () => {
    const text = `${sum}  other.zip\n`;
    expect(extractShasumForFile(text, "missing.zip")).toBeUndefined();
  });

  it("returns undefined when the matched checksum is malformed", () => {
    const text = `notahash  terraform-provider-foo_1.0.0_linux_amd64.zip\n`;
    expect(
      extractShasumForFile(text, "terraform-provider-foo_1.0.0_linux_amd64.zip"),
    ).toBeUndefined();
  });
});
