import { describe, it, expect } from "vitest";
import {
  generateModuleKey,
  generateProviderKey,
  parseModuleKey,
} from "@/lib/storage/keys";

// ============================================================================
// generateModuleKey
// ============================================================================

describe("generateModuleKey", () => {
  it("produces the correct path structure", () => {
    const key = generateModuleKey("myorg", "vpc", "aws", "1.0.0");
    expect(key).toBe("modules/myorg/vpc/aws/1.0.0.tar.gz");
  });

  it("starts with the 'modules/' prefix", () => {
    const key = generateModuleKey("ns", "name", "provider", "0.1.0");
    expect(key).toMatch(/^modules\//);
  });

  it("ends with '.tar.gz'", () => {
    const key = generateModuleKey("ns", "name", "provider", "0.1.0");
    expect(key).toMatch(/\.tar\.gz$/);
  });

  it("embeds namespace in the second path segment", () => {
    const key = generateModuleKey("acme", "app", "gcp", "2.3.4");
    const parts = key.split("/");
    // modules / namespace / name / provider / version.tar.gz
    expect(parts[1]).toBe("acme");
  });

  it("embeds name in the third path segment", () => {
    const key = generateModuleKey("acme", "app", "gcp", "2.3.4");
    const parts = key.split("/");
    expect(parts[2]).toBe("app");
  });

  it("embeds provider in the fourth path segment", () => {
    const key = generateModuleKey("acme", "app", "gcp", "2.3.4");
    const parts = key.split("/");
    expect(parts[3]).toBe("gcp");
  });

  it("embeds versioned filename in the fifth path segment", () => {
    const key = generateModuleKey("acme", "app", "gcp", "2.3.4");
    const parts = key.split("/");
    expect(parts[4]).toBe("2.3.4.tar.gz");
  });

  it("produces exactly 5 path segments", () => {
    const key = generateModuleKey("ns", "name", "provider", "1.0.0");
    expect(key.split("/")).toHaveLength(5);
  });

  it("handles hyphens in the namespace", () => {
    const key = generateModuleKey("my-org", "vpc", "aws", "1.0.0");
    expect(key).toBe("modules/my-org/vpc/aws/1.0.0.tar.gz");
  });

  it("handles hyphens in the module name", () => {
    const key = generateModuleKey("myorg", "my-module", "aws", "1.0.0");
    expect(key).toBe("modules/myorg/my-module/aws/1.0.0.tar.gz");
  });

  it("handles hyphens in the provider name", () => {
    const key = generateModuleKey("myorg", "vpc", "google-cloud", "1.0.0");
    expect(key).toBe("modules/myorg/vpc/google-cloud/1.0.0.tar.gz");
  });

  it("handles a pre-release version string", () => {
    const key = generateModuleKey("ns", "app", "provider", "1.0.0-alpha.1");
    expect(key).toBe("modules/ns/app/provider/1.0.0-alpha.1.tar.gz");
  });

  it("handles a long namespace value", () => {
    const longNs = "a".repeat(64);
    const key = generateModuleKey(longNs, "name", "provider", "1.0.0");
    expect(key).toBe(`modules/${longNs}/name/provider/1.0.0.tar.gz`);
  });

  it("does not double any slashes", () => {
    const key = generateModuleKey("ns", "name", "provider", "1.0.0");
    expect(key).not.toContain("//");
  });
});

// ============================================================================
// generateProviderKey
// ============================================================================

describe("generateProviderKey", () => {
  it("produces the correct path structure", () => {
    const key = generateProviderKey(
      "hashicorp",
      "aws",
      "4.0.0",
      "linux",
      "amd64",
    );
    expect(key).toBe(
      "providers/hashicorp/aws/4.0.0/terraform-provider-aws_4.0.0_linux_amd64.zip",
    );
  });

  it("starts with the 'providers/' prefix", () => {
    const key = generateProviderKey("ns", "type", "1.0.0", "darwin", "arm64");
    expect(key).toMatch(/^providers\//);
  });

  it("ends with '.zip'", () => {
    const key = generateProviderKey("ns", "type", "1.0.0", "darwin", "arm64");
    expect(key).toMatch(/\.zip$/);
  });

  it("embeds namespace in the second path segment", () => {
    const key = generateProviderKey("acme", "mytype", "1.0.0", "linux", "386");
    const parts = key.split("/");
    // providers / namespace / type / version / filename.zip
    expect(parts[1]).toBe("acme");
  });

  it("embeds type in the third path segment", () => {
    const key = generateProviderKey("acme", "mytype", "1.0.0", "linux", "386");
    const parts = key.split("/");
    expect(parts[2]).toBe("mytype");
  });

  it("embeds version in the fourth path segment", () => {
    const key = generateProviderKey("acme", "mytype", "1.0.0", "linux", "386");
    const parts = key.split("/");
    expect(parts[3]).toBe("1.0.0");
  });

  it("embeds the full filename in the fifth path segment", () => {
    const key = generateProviderKey("acme", "mytype", "1.0.0", "linux", "386");
    const parts = key.split("/");
    expect(parts[4]).toBe("terraform-provider-mytype_1.0.0_linux_386.zip");
  });

  it("produces exactly 5 path segments", () => {
    const key = generateProviderKey("ns", "type", "1.0.0", "linux", "amd64");
    expect(key.split("/")).toHaveLength(5);
  });

  it("uses 'terraform-provider-{type}' as the filename prefix", () => {
    const key = generateProviderKey("ns", "aws", "1.0.0", "linux", "amd64");
    expect(key).toContain("terraform-provider-aws");
  });

  it("uses underscores as separators inside the filename", () => {
    const key = generateProviderKey("ns", "aws", "1.0.0", "linux", "amd64");
    const filename = key.split("/")[4];
    // Format: terraform-provider-{type}_{version}_{os}_{arch}.zip
    expect(filename).toBe("terraform-provider-aws_1.0.0_linux_amd64.zip");
  });

  it("handles hyphens in the namespace", () => {
    const key = generateProviderKey("my-org", "aws", "1.0.0", "linux", "amd64");
    expect(key).toBe(
      "providers/my-org/aws/1.0.0/terraform-provider-aws_1.0.0_linux_amd64.zip",
    );
  });

  it("handles hyphens in the type", () => {
    const key = generateProviderKey(
      "ns",
      "google-beta",
      "1.0.0",
      "linux",
      "amd64",
    );
    expect(key).toBe(
      "providers/ns/google-beta/1.0.0/terraform-provider-google-beta_1.0.0_linux_amd64.zip",
    );
  });

  it("handles underscores in the os field", () => {
    const key = generateProviderKey(
      "ns",
      "aws",
      "1.0.0",
      "linux_musl",
      "amd64",
    );
    expect(key).toBe(
      "providers/ns/aws/1.0.0/terraform-provider-aws_1.0.0_linux_musl_amd64.zip",
    );
  });

  it("handles underscores in the arch field", () => {
    const key = generateProviderKey("ns", "aws", "1.0.0", "linux", "arm_v6");
    expect(key).toBe(
      "providers/ns/aws/1.0.0/terraform-provider-aws_1.0.0_linux_arm_v6.zip",
    );
  });

  it("handles a long namespace value", () => {
    const longNs = "z".repeat(64);
    const key = generateProviderKey(longNs, "aws", "1.0.0", "linux", "amd64");
    expect(key.startsWith(`providers/${longNs}/`)).toBe(true);
  });

  it("does not double any slashes", () => {
    const key = generateProviderKey("ns", "aws", "1.0.0", "linux", "amd64");
    expect(key).not.toContain("//");
  });
});

// ============================================================================
// parseModuleKey
// ============================================================================

describe("parseModuleKey", () => {
  it("parses a valid module key", () => {
    const result = parseModuleKey("modules/myorg/vpc/aws/1.0.0.tar.gz");
    expect(result).toEqual({
      namespace: "myorg",
      name: "vpc",
      provider: "aws",
      version: "1.0.0",
    });
  });

  it("round-trips with generateModuleKey", () => {
    const key = generateModuleKey("acme", "app", "gcp", "2.3.4");
    expect(parseModuleKey(key)).toEqual({
      namespace: "acme",
      name: "app",
      provider: "gcp",
      version: "2.3.4",
    });
  });

  it("returns null for a providers key", () => {
    expect(parseModuleKey("providers/ns/type/1.0.0/file.zip")).toBeNull();
  });

  it("returns null for a key with wrong segment count", () => {
    expect(parseModuleKey("modules/ns/name/1.0.0.tar.gz")).toBeNull();
  });

  it("returns null for a key that doesn't end with .tar.gz", () => {
    expect(parseModuleKey("modules/ns/name/provider/1.0.0.zip")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(parseModuleKey("")).toBeNull();
  });

  it("handles pre-release versions", () => {
    const result = parseModuleKey(
      "modules/ns/app/provider/1.0.0-alpha.1.tar.gz",
    );
    expect(result?.version).toBe("1.0.0-alpha.1");
  });
});
