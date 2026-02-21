import { describe, it, expect } from "vitest";
import {
  ifMatchHeaderValue,
  adminModuleUpdateBody,
  adminProviderCreateBody,
  adminProviderPlatformReplaceBody,
  adminProviderUpdateBody,
  createModuleAliasBody,
  createProviderAliasBody,
  moduleAliasDeleteParams,
  providerAliasDeleteParams,
} from "@/lib/validation/admin";

describe("ifMatchHeaderValue", () => {
  it("accepts weak ETag format", () => {
    const result = ifMatchHeaderValue.safeParse('W/"3"');
    expect(result.success).toBe(true);
  });

  it("accepts strong ETag format", () => {
    const result = ifMatchHeaderValue.safeParse('"3"');
    expect(result.success).toBe(true);
  });

  it("accepts bare numeric value", () => {
    const result = ifMatchHeaderValue.safeParse("3");
    expect(result.success).toBe(true);
  });

  it("rejects wildcard value", () => {
    const result = ifMatchHeaderValue.safeParse("*");
    expect(result.success).toBe(false);
  });

  it("rejects multiple ETag values", () => {
    const result = ifMatchHeaderValue.safeParse('W/"3", W/"4"');
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// adminModuleUpdateBody
// ============================================================================

describe("adminModuleUpdateBody", () => {
  it("accepts a valid update with description", () => {
    const result = adminModuleUpdateBody.safeParse({
      description: "Updated description",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid update with source", () => {
    const result = adminModuleUpdateBody.safeParse({
      source: "https://github.com/org/repo",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid update with owner", () => {
    const result = adminModuleUpdateBody.safeParse({ owner: "hashicorp" });
    expect(result.success).toBe(true);
  });

  it("accepts a valid update with tags", () => {
    const result = adminModuleUpdateBody.safeParse({
      tags: ["aws", "gcp"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts null for nullable fields (description, source)", () => {
    const result = adminModuleUpdateBody.safeParse({
      description: null,
      source: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts multiple fields at once", () => {
    const result = adminModuleUpdateBody.safeParse({
      description: "New desc",
      owner: "new-owner",
      tags: ["azure"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty object (no fields provided)", () => {
    const result = adminModuleUpdateBody.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects unknown fields", () => {
    const result = adminModuleUpdateBody.safeParse({
      description: "ok",
      version: "1.0.0", // unknown
    });
    expect(result.success).toBe(false);
  });

  it("rejects description exceeding max length", () => {
    const result = adminModuleUpdateBody.safeParse({
      description: "x".repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it("rejects tags exceeding max count", () => {
    const result = adminModuleUpdateBody.safeParse({
      tags: Array.from({ length: 21 }, (_, i) => `tag${i}`),
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid tag format", () => {
    const result = adminModuleUpdateBody.safeParse({
      tags: ["INVALID_TAG"],
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// adminProviderUpdateBody
// ============================================================================

describe("adminProviderUpdateBody", () => {
  it("accepts a valid update with protocols", () => {
    const result = adminProviderUpdateBody.safeParse({
      protocols: ["5.0"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty object", () => {
    const result = adminProviderUpdateBody.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects unknown fields", () => {
    const result = adminProviderUpdateBody.safeParse({
      protocols: ["5.0"],
      type: "aws", // unknown
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty protocols array", () => {
    const result = adminProviderUpdateBody.safeParse({
      protocols: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects protocols with empty strings", () => {
    const result = adminProviderUpdateBody.safeParse({
      protocols: [""],
    });
    expect(result.success).toBe(false);
  });
});

describe("adminProviderCreateBody", () => {
  const validBody = {
    version: "1.2.3",
    protocols: ["5.0"],
    platforms: [
      {
        os: "linux",
        arch: "amd64",
        filename: "terraform-provider-aws_1.2.3_linux_amd64.zip",
        shasum:
          "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        location: "providers/hashicorp/aws/1.2.3/terraform-provider-aws.zip",
      },
    ],
    gpg_public_keys: [
      {
        key_id: "ABCDEF",
        ascii_armor: "-----BEGIN PGP PUBLIC KEY BLOCK-----",
        source: "HashiCorp",
      },
    ],
  };

  it("accepts a valid create payload", () => {
    const result = adminProviderCreateBody.safeParse(validBody);
    expect(result.success).toBe(true);
  });

  it("rejects when version is missing", () => {
    const body = { ...validBody };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { version, ...withoutVersion } = body;
    const result = adminProviderCreateBody.safeParse(withoutVersion);
    expect(result.success).toBe(false);
  });

  it("rejects empty platforms", () => {
    const result = adminProviderCreateBody.safeParse({
      ...validBody,
      platforms: [],
    });
    expect(result.success).toBe(false);
  });
});

describe("adminProviderPlatformReplaceBody", () => {
  it("accepts valid replace payload", () => {
    const result = adminProviderPlatformReplaceBody.safeParse({
      filename: "terraform-provider-aws_1.2.3_linux_amd64.zip",
      shasum:
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      location: "providers/hashicorp/aws/1.2.3/terraform-provider-aws.zip",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid checksum", () => {
    const result = adminProviderPlatformReplaceBody.safeParse({
      filename: "terraform-provider-aws_1.2.3_linux_amd64.zip",
      shasum: "bad",
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// createModuleAliasBody
// ============================================================================

describe("createModuleAliasBody", () => {
  it("accepts a valid module alias", () => {
    const result = createModuleAliasBody.safeParse({
      source_namespace: "old-ns",
      source_name: "old-name",
      source_provider: "old-prov",
      target_namespace: "new-ns",
      target_name: "new-name",
      target_provider: "new-prov",
    });
    expect(result.success).toBe(true);
  });

  it("rejects when source equals target", () => {
    const result = createModuleAliasBody.safeParse({
      source_namespace: "ns",
      source_name: "name",
      source_provider: "prov",
      target_namespace: "ns",
      target_name: "name",
      target_provider: "prov",
    });
    expect(result.success).toBe(false);
  });

  it("accepts when only one coordinate differs", () => {
    const result = createModuleAliasBody.safeParse({
      source_namespace: "ns",
      source_name: "old-name",
      source_provider: "prov",
      target_namespace: "ns",
      target_name: "new-name",
      target_provider: "prov",
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown fields", () => {
    const result = createModuleAliasBody.safeParse({
      source_namespace: "ns",
      source_name: "name",
      source_provider: "prov",
      target_namespace: "ns2",
      target_name: "name2",
      target_provider: "prov2",
      extra: "field",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing required fields", () => {
    const result = createModuleAliasBody.safeParse({
      source_namespace: "ns",
      source_name: "name",
      // missing source_provider and targets
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid namespace format", () => {
    const result = createModuleAliasBody.safeParse({
      source_namespace: "INVALID",
      source_name: "name",
      source_provider: "prov",
      target_namespace: "ns",
      target_name: "name",
      target_provider: "prov",
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// createProviderAliasBody
// ============================================================================

describe("createProviderAliasBody", () => {
  it("accepts a valid provider alias", () => {
    const result = createProviderAliasBody.safeParse({
      source_namespace: "old-ns",
      source_type: "old-type",
      target_namespace: "new-ns",
      target_type: "new-type",
    });
    expect(result.success).toBe(true);
  });

  it("rejects when source equals target", () => {
    const result = createProviderAliasBody.safeParse({
      source_namespace: "ns",
      source_type: "type",
      target_namespace: "ns",
      target_type: "type",
    });
    expect(result.success).toBe(false);
  });

  it("accepts when namespace differs", () => {
    const result = createProviderAliasBody.safeParse({
      source_namespace: "old-ns",
      source_type: "type",
      target_namespace: "new-ns",
      target_type: "type",
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown fields", () => {
    const result = createProviderAliasBody.safeParse({
      source_namespace: "ns",
      source_type: "type",
      target_namespace: "ns2",
      target_type: "type2",
      version: "1.0.0",
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// moduleAliasDeleteParams
// ============================================================================

describe("moduleAliasDeleteParams", () => {
  it("accepts valid params", () => {
    const result = moduleAliasDeleteParams.safeParse({
      namespace: "hashicorp",
      name: "consul",
      provider: "aws",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid namespace format", () => {
    const result = moduleAliasDeleteParams.safeParse({
      namespace: "INVALID",
      name: "consul",
      provider: "aws",
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// providerAliasDeleteParams
// ============================================================================

describe("providerAliasDeleteParams", () => {
  it("accepts valid params", () => {
    const result = providerAliasDeleteParams.safeParse({
      namespace: "hashicorp",
      type: "aws",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid type format", () => {
    const result = providerAliasDeleteParams.safeParse({
      namespace: "hashicorp",
      type: "AWS_Invalid!",
    });
    expect(result.success).toBe(false);
  });
});
