import { describe, it, expect } from "vitest";
import {
  namespaceSchema,
  nameSchema,
  providerSchema,
  typeSchema,
  versionSchema,
  osSchema,
  archSchema,
  moduleListQuery,
  providerListQuery,
  moduleVersionsParams,
  moduleDownloadParams,
  providerVersionsParams,
  providerDownloadParams,
  providerArtifactParams,
  modulePublishParams,
  createApiKeyBody,
  providerPublishData,
} from "@/lib/validation/registry";

// ============================================================================
// Helpers
// ============================================================================

/** Returns true when the schema parses successfully. */
function valid<T>(
  schema: { safeParse(v: unknown): { success: boolean } },
  value: T,
): boolean {
  return schema.safeParse(value).success;
}

/** Returns the first Zod issue message, or undefined on success. */
function errorMessage<T>(
  schema: {
    safeParse(v: unknown): {
      success: boolean;
      error?: { issues: { message: string }[] };
    };
  },
  value: T,
): string | undefined {
  const result = schema.safeParse(value);
  if (result.success) return undefined;
  return result.error?.issues[0]?.message;
}

// ============================================================================
// namespaceSchema
// ============================================================================

describe("namespaceSchema", () => {
  describe("valid inputs", () => {
    it.each([
      "a",
      "z",
      "abc",
      "abc-def",
      "my-org",
      "acme123",
      "123abc",
      "a1b2c3",
      "a".repeat(64),
    ])("accepts '%s'", (value) => {
      expect(valid(namespaceSchema, value)).toBe(true);
    });
  });

  describe("invalid inputs", () => {
    it("rejects empty string", () => {
      expect(valid(namespaceSchema, "")).toBe(false);
    });

    it("rejects string longer than 64 characters", () => {
      expect(valid(namespaceSchema, "a".repeat(65))).toBe(false);
    });

    it("rejects uppercase letters", () => {
      expect(valid(namespaceSchema, "MyOrg")).toBe(false);
    });

    it("rejects leading hyphen", () => {
      expect(valid(namespaceSchema, "-myorg")).toBe(false);
    });

    it("rejects trailing hyphen", () => {
      expect(valid(namespaceSchema, "myorg-")).toBe(false);
    });

    it("rejects spaces", () => {
      expect(valid(namespaceSchema, "my org")).toBe(false);
    });

    it("rejects underscores", () => {
      expect(valid(namespaceSchema, "my_org")).toBe(false);
    });

    it("rejects dots", () => {
      expect(valid(namespaceSchema, "my.org")).toBe(false);
    });

    it("includes a helpful error message on regex failure", () => {
      const msg = errorMessage(namespaceSchema, "MyOrg");
      expect(msg).toBe("Invalid namespace format");
    });
  });
});

// ============================================================================
// nameSchema
// ============================================================================

describe("nameSchema", () => {
  describe("valid inputs", () => {
    it.each(["a", "vpc", "my-module", "module123", "a".repeat(64)])(
      "accepts '%s'",
      (value) => {
        expect(valid(nameSchema, value)).toBe(true);
      },
    );
  });

  describe("invalid inputs", () => {
    it("rejects empty string", () => {
      expect(valid(nameSchema, "")).toBe(false);
    });

    it("rejects string longer than 64 characters", () => {
      expect(valid(nameSchema, "a".repeat(65))).toBe(false);
    });

    it("rejects uppercase letters", () => {
      expect(valid(nameSchema, "VPC")).toBe(false);
    });

    it("rejects leading hyphen", () => {
      expect(valid(nameSchema, "-vpc")).toBe(false);
    });

    it("rejects trailing hyphen", () => {
      expect(valid(nameSchema, "vpc-")).toBe(false);
    });

    it("includes a helpful error message on regex failure", () => {
      const msg = errorMessage(nameSchema, "VPC");
      expect(msg).toBe("Invalid name format");
    });
  });
});

// ============================================================================
// providerSchema
// ============================================================================

describe("providerSchema", () => {
  it("accepts lowercase alphanumeric values", () => {
    expect(valid(providerSchema, "aws")).toBe(true);
  });

  it("accepts values with hyphens", () => {
    expect(valid(providerSchema, "google-cloud")).toBe(true);
  });

  it("rejects empty string", () => {
    expect(valid(providerSchema, "")).toBe(false);
  });

  it("rejects values longer than 64 characters", () => {
    expect(valid(providerSchema, "a".repeat(65))).toBe(false);
  });

  it("rejects uppercase letters", () => {
    expect(valid(providerSchema, "AWS")).toBe(false);
  });

  it("includes a helpful error message on regex failure", () => {
    const msg = errorMessage(providerSchema, "AWS");
    expect(msg).toBe("Invalid provider/system format");
  });
});

// ============================================================================
// typeSchema
// ============================================================================

describe("typeSchema", () => {
  it("accepts valid type identifiers", () => {
    expect(valid(typeSchema, "google")).toBe(true);
    expect(valid(typeSchema, "azurerm")).toBe(true);
  });

  it("rejects empty string", () => {
    expect(valid(typeSchema, "")).toBe(false);
  });

  it("rejects values longer than 64 characters", () => {
    expect(valid(typeSchema, "a".repeat(65))).toBe(false);
  });

  it("rejects uppercase letters", () => {
    expect(valid(typeSchema, "Google")).toBe(false);
  });

  it("includes a helpful error message on regex failure", () => {
    const msg = errorMessage(typeSchema, "Google");
    expect(msg).toBe("Invalid type format");
  });
});

// ============================================================================
// versionSchema
// ============================================================================

describe("versionSchema", () => {
  describe("valid inputs", () => {
    it.each([
      "1.0.0",
      "0.1.0",
      "0.0.1",
      "1.2.3-alpha",
      "1.0.0-beta.1",
      "2.0.0-rc.1",
      "1.0.0+build.123",
      "1.0.0-alpha+sha.abc123",
    ])("accepts '%s'", (value) => {
      expect(valid(versionSchema, value)).toBe(true);
    });
  });

  describe("invalid inputs", () => {
    it("accepts 'v1.0.0' and normalizes it to '1.0.0'", () => {
      const result = versionSchema.safeParse("v1.0.0");
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toBe("1.0.0");
    });

    it("rejects '1.0' (missing patch)", () => {
      expect(valid(versionSchema, "1.0")).toBe(false);
    });

    it("rejects '1.0.0.0' (extra segment)", () => {
      expect(valid(versionSchema, "1.0.0.0")).toBe(false);
    });

    it("rejects empty string", () => {
      expect(valid(versionSchema, "")).toBe(false);
    });

    it("rejects 'abc' (non-numeric)", () => {
      expect(valid(versionSchema, "abc")).toBe(false);
    });

    it("includes a helpful error message on failure", () => {
      const msg = errorMessage(versionSchema, "not-a-version");
      expect(msg).toBe("Invalid semver version");
    });
  });
});

// ============================================================================
// osSchema
// ============================================================================

describe("osSchema", () => {
  describe("valid inputs", () => {
    it.each([
      "linux",
      "darwin",
      "windows",
      "freebsd",
      "linux_musl",
      "a".repeat(32),
    ])("accepts '%s'", (value) => {
      expect(valid(osSchema, value)).toBe(true);
    });
  });

  describe("invalid inputs", () => {
    it("rejects empty string", () => {
      expect(valid(osSchema, "")).toBe(false);
    });

    it("rejects values longer than 32 characters", () => {
      expect(valid(osSchema, "a".repeat(33))).toBe(false);
    });

    it("rejects uppercase letters", () => {
      expect(valid(osSchema, "Linux")).toBe(false);
    });

    it("rejects hyphens", () => {
      expect(valid(osSchema, "linux-gnu")).toBe(false);
    });

    it("rejects spaces", () => {
      expect(valid(osSchema, "linux gnu")).toBe(false);
    });

    it("includes a helpful error message on regex failure", () => {
      const msg = errorMessage(osSchema, "Linux");
      expect(msg).toBe("Invalid OS format");
    });
  });
});

// ============================================================================
// archSchema
// ============================================================================

describe("archSchema", () => {
  describe("valid inputs", () => {
    it.each(["amd64", "arm64", "386", "arm", "arm_v6", "a".repeat(32)])(
      "accepts '%s'",
      (value) => {
        expect(valid(archSchema, value)).toBe(true);
      },
    );
  });

  describe("invalid inputs", () => {
    it("rejects empty string", () => {
      expect(valid(archSchema, "")).toBe(false);
    });

    it("rejects values longer than 32 characters", () => {
      expect(valid(archSchema, "a".repeat(33))).toBe(false);
    });

    it("rejects uppercase letters", () => {
      expect(valid(archSchema, "AMD64")).toBe(false);
    });

    it("rejects hyphens", () => {
      expect(valid(archSchema, "arm-v6")).toBe(false);
    });

    it("includes a helpful error message on regex failure", () => {
      const msg = errorMessage(archSchema, "AMD64");
      expect(msg).toBe("Invalid arch format");
    });
  });
});

// ============================================================================
// moduleListQuery
// ============================================================================

describe("moduleListQuery", () => {
  it("uses default offset=0 and limit=15 when not supplied", () => {
    const result = moduleListQuery.parse({});
    expect(result.offset).toBe(0);
    expect(result.limit).toBe(15);
  });

  it("coerces string numbers for offset and limit", () => {
    const result = moduleListQuery.parse({ offset: "10", limit: "25" });
    expect(result.offset).toBe(10);
    expect(result.limit).toBe(25);
  });

  it("accepts all optional fields", () => {
    const result = moduleListQuery.parse({
      q: "vpc",
      namespace: "myorg",
      provider: "aws",
    });
    expect(result.q).toBe("vpc");
    expect(result.namespace).toBe("myorg");
    expect(result.provider).toBe("aws");
  });

  it("returns undefined for absent optional fields", () => {
    const result = moduleListQuery.parse({});
    expect(result.q).toBeUndefined();
    expect(result.namespace).toBeUndefined();
    expect(result.provider).toBeUndefined();
  });

  it("rejects offset below 0", () => {
    expect(valid(moduleListQuery, { offset: -1 })).toBe(false);
  });

  it("rejects limit below 1", () => {
    expect(valid(moduleListQuery, { limit: 0 })).toBe(false);
  });

  it("rejects limit above 100", () => {
    expect(valid(moduleListQuery, { limit: 101 })).toBe(false);
  });

  it("rejects q longer than 128 characters", () => {
    expect(valid(moduleListQuery, { q: "a".repeat(129) })).toBe(false);
  });

  it("rejects invalid namespace format", () => {
    expect(valid(moduleListQuery, { namespace: "MyOrg" })).toBe(false);
  });

  it("rejects invalid provider format", () => {
    expect(valid(moduleListQuery, { provider: "AWS" })).toBe(false);
  });
});

// ============================================================================
// providerListQuery
// ============================================================================

describe("providerListQuery", () => {
  it("uses default offset=0 and limit=15 when not supplied", () => {
    const result = providerListQuery.parse({});
    expect(result.offset).toBe(0);
    expect(result.limit).toBe(15);
  });

  it("coerces string numbers for offset and limit", () => {
    const result = providerListQuery.parse({ offset: "5", limit: "50" });
    expect(result.offset).toBe(5);
    expect(result.limit).toBe(50);
  });

  it("accepts all optional fields", () => {
    const result = providerListQuery.parse({
      q: "google",
      namespace: "hashicorp",
      type: "google",
    });
    expect(result.q).toBe("google");
    expect(result.namespace).toBe("hashicorp");
    expect(result.type).toBe("google");
  });

  it("returns undefined for absent optional fields", () => {
    const result = providerListQuery.parse({});
    expect(result.q).toBeUndefined();
    expect(result.namespace).toBeUndefined();
    expect(result.type).toBeUndefined();
  });

  it("rejects limit above 100", () => {
    expect(valid(providerListQuery, { limit: 101 })).toBe(false);
  });

  it("rejects invalid type format", () => {
    expect(valid(providerListQuery, { type: "Google" })).toBe(false);
  });
});

// ============================================================================
// moduleVersionsParams
// ============================================================================

describe("moduleVersionsParams", () => {
  const validInput = { namespace: "myorg", name: "vpc", system: "aws" };

  it("accepts valid params", () => {
    expect(valid(moduleVersionsParams, validInput)).toBe(true);
  });

  it("parses to the correct shape", () => {
    const result = moduleVersionsParams.parse(validInput);
    expect(result).toEqual(validInput);
  });

  it("rejects missing namespace", () => {
    expect(valid(moduleVersionsParams, { name: "vpc", system: "aws" })).toBe(
      false,
    );
  });

  it("rejects missing name", () => {
    expect(
      valid(moduleVersionsParams, { namespace: "myorg", system: "aws" }),
    ).toBe(false);
  });

  it("rejects missing system", () => {
    expect(
      valid(moduleVersionsParams, { namespace: "myorg", name: "vpc" }),
    ).toBe(false);
  });

  it("rejects invalid namespace", () => {
    expect(
      valid(moduleVersionsParams, { ...validInput, namespace: "MyOrg" }),
    ).toBe(false);
  });

  it("rejects invalid name", () => {
    expect(valid(moduleVersionsParams, { ...validInput, name: "-vpc" })).toBe(
      false,
    );
  });

  it("rejects invalid system", () => {
    expect(valid(moduleVersionsParams, { ...validInput, system: "AWS" })).toBe(
      false,
    );
  });
});

// ============================================================================
// moduleDownloadParams
// ============================================================================

describe("moduleDownloadParams", () => {
  const validInput = {
    namespace: "myorg",
    name: "vpc",
    system: "aws",
    version: "1.2.3",
  };

  it("accepts valid params", () => {
    expect(valid(moduleDownloadParams, validInput)).toBe(true);
  });

  it("parses to the correct shape", () => {
    const result = moduleDownloadParams.parse(validInput);
    expect(result).toEqual(validInput);
  });

  it("rejects missing version", () => {
    const { version: _, ...rest } = validInput;
    expect(valid(moduleDownloadParams, rest)).toBe(false);
  });

  it("normalizes a v-prefixed version (v1.2.3 → 1.2.3)", () => {
    const result = moduleDownloadParams.safeParse({
      ...validInput,
      version: "v1.2.3",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.version).toBe("1.2.3");
  });

  it("accepts version with pre-release tag", () => {
    expect(
      valid(moduleDownloadParams, { ...validInput, version: "1.2.3-rc.1" }),
    ).toBe(true);
  });
});

// ============================================================================
// providerVersionsParams
// ============================================================================

describe("providerVersionsParams", () => {
  const validInput = { namespace: "hashicorp", type: "aws" };

  it("accepts valid params", () => {
    expect(valid(providerVersionsParams, validInput)).toBe(true);
  });

  it("parses to the correct shape", () => {
    const result = providerVersionsParams.parse(validInput);
    expect(result).toEqual(validInput);
  });

  it("rejects missing namespace", () => {
    expect(valid(providerVersionsParams, { type: "aws" })).toBe(false);
  });

  it("rejects missing type", () => {
    expect(valid(providerVersionsParams, { namespace: "hashicorp" })).toBe(
      false,
    );
  });

  it("rejects invalid namespace", () => {
    expect(
      valid(providerVersionsParams, { ...validInput, namespace: "HashiCorp" }),
    ).toBe(false);
  });

  it("rejects invalid type", () => {
    expect(valid(providerVersionsParams, { ...validInput, type: "AWS" })).toBe(
      false,
    );
  });
});

// ============================================================================
// providerDownloadParams
// ============================================================================

describe("providerDownloadParams", () => {
  const validInput = {
    namespace: "hashicorp",
    type: "aws",
    version: "4.0.0",
    os: "linux",
    arch: "amd64",
  };

  it("accepts valid params", () => {
    expect(valid(providerDownloadParams, validInput)).toBe(true);
  });

  it("parses to the correct shape", () => {
    const result = providerDownloadParams.parse(validInput);
    expect(result).toEqual(validInput);
  });

  it("rejects missing os", () => {
    const { os: _, ...rest } = validInput;
    expect(valid(providerDownloadParams, rest)).toBe(false);
  });

  it("rejects missing arch", () => {
    const { arch: _, ...rest } = validInput;
    expect(valid(providerDownloadParams, rest)).toBe(false);
  });

  it("rejects invalid os format (uppercase)", () => {
    expect(valid(providerDownloadParams, { ...validInput, os: "Linux" })).toBe(
      false,
    );
  });

  it("rejects invalid arch format (hyphen)", () => {
    expect(
      valid(providerDownloadParams, { ...validInput, arch: "arm-v6" }),
    ).toBe(false);
  });

  it("accepts os with underscores", () => {
    expect(
      valid(providerDownloadParams, { ...validInput, os: "linux_musl" }),
    ).toBe(true);
  });

  it("accepts arch with underscores", () => {
    expect(
      valid(providerDownloadParams, { ...validInput, arch: "arm_v6" }),
    ).toBe(true);
  });

  it("normalizes a v-prefixed version (v4.0.0 → 4.0.0)", () => {
    const result = providerDownloadParams.safeParse({
      ...validInput,
      version: "v4.0.0",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.version).toBe("4.0.0");
  });
});

// ============================================================================
// providerArtifactParams
// ============================================================================

describe("providerArtifactParams", () => {
  const validInput = { namespace: "hashicorp", type: "aws", version: "4.0.0" };

  it("accepts valid params", () => {
    expect(valid(providerArtifactParams, validInput)).toBe(true);
  });

  it("rejects invalid version", () => {
    expect(
      valid(providerArtifactParams, { ...validInput, version: "latest" }),
    ).toBe(false);
  });
});

// ============================================================================
// modulePublishParams
// ============================================================================

describe("modulePublishParams", () => {
  const validInput = {
    namespace: "myorg",
    name: "vpc",
    system: "aws",
    version: "1.0.0",
  };

  it("accepts valid params", () => {
    expect(valid(modulePublishParams, validInput)).toBe(true);
  });

  it("rejects missing version", () => {
    const { version: _, ...rest } = validInput;
    expect(valid(modulePublishParams, rest)).toBe(false);
  });

  it("rejects invalid version", () => {
    expect(valid(modulePublishParams, { ...validInput, version: "1.0" })).toBe(
      false,
    );
  });
});

// ============================================================================
// createApiKeyBody
// ============================================================================

describe("createApiKeyBody", () => {
  it("accepts a minimal valid body with name only", () => {
    expect(createApiKeyBody.safeParse({ name: "my-key" }).success).toBe(true);
  });

  it("accepts all optional fields", () => {
    const result = createApiKeyBody.safeParse({
      name: "my-key",
      description: "A test key",
      permissions: ["read", "write"],
      expires_at: "2030-01-01T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    expect(createApiKeyBody.safeParse({ name: "" }).success).toBe(false);
  });

  it("rejects missing name", () => {
    expect(createApiKeyBody.safeParse({}).success).toBe(false);
  });

  it("rejects permissions with non-string elements", () => {
    expect(
      createApiKeyBody.safeParse({ name: "k", permissions: [1, 2] }).success,
    ).toBe(false);
  });

  it("rejects invalid expires_at format (not ISO 8601)", () => {
    expect(
      createApiKeyBody.safeParse({ name: "k", expires_at: "tomorrow" }).success,
    ).toBe(false);
  });

  it("rejects expires_at as a non-string", () => {
    expect(
      createApiKeyBody.safeParse({ name: "k", expires_at: 12345 }).success,
    ).toBe(false);
  });

  it("rejects unknown fields (strict mode)", () => {
    expect(
      createApiKeyBody.safeParse({ name: "k", unknown_field: true }).success,
    ).toBe(false);
  });

  it("returns correct parsed data shape", () => {
    const result = createApiKeyBody.parse({ name: "  my-key  " });
    expect(result.name).toBe("  my-key  ");
    expect(result.description).toBeUndefined();
    expect(result.permissions).toBeUndefined();
    expect(result.expires_at).toBeUndefined();
  });
});

// ============================================================================
// providerPublishData — shasum validation (SEC-011)
// ============================================================================

describe("providerPublishData — shasum validation", () => {
  /** Build a valid providerPublishData payload, overriding only the shasum. */
  function withShasum(shasum: string) {
    return {
      protocols: ["5.0"],
      platforms: [
        {
          os: "linux",
          arch: "amd64",
          shasum,
          filename: "terraform-provider-aws_4.0.0_linux_amd64.zip",
        },
      ],
      gpg_public_keys: [
        {
          key_id: "ABC123",
          ascii_armor: "-----BEGIN PGP PUBLIC KEY BLOCK-----",
        },
      ],
    };
  }

  it("accepts a valid 64-char lowercase hex shasum", () => {
    expect(valid(providerPublishData, withShasum("a".repeat(64)))).toBe(true);
  });

  it("accepts a valid 64-char uppercase hex shasum", () => {
    expect(valid(providerPublishData, withShasum("A".repeat(64)))).toBe(true);
  });

  it("rejects a shasum shorter than 64 chars", () => {
    expect(valid(providerPublishData, withShasum("a".repeat(63)))).toBe(false);
  });

  it("rejects a shasum longer than 64 chars", () => {
    expect(valid(providerPublishData, withShasum("a".repeat(65)))).toBe(false);
  });

  it("rejects a shasum with non-hex chars", () => {
    expect(valid(providerPublishData, withShasum("g".repeat(64)))).toBe(false);
  });

  it("rejects an empty string shasum", () => {
    expect(valid(providerPublishData, withShasum(""))).toBe(false);
  });
});

// ============================================================================
// providerPublishData — filename validation (SEC-013)
// ============================================================================

describe("providerPublishData — filename validation", () => {
  /** Build a valid providerPublishData payload, overriding only the filename. */
  function withFilename(filename: string) {
    return {
      protocols: ["5.0"],
      platforms: [
        {
          os: "linux",
          arch: "amd64",
          shasum: "a".repeat(64),
          filename,
        },
      ],
      gpg_public_keys: [
        {
          key_id: "ABC123",
          ascii_armor: "-----BEGIN PGP PUBLIC KEY BLOCK-----",
        },
      ],
    };
  }

  it("accepts a standard Terraform provider filename", () => {
    expect(
      valid(
        providerPublishData,
        withFilename("terraform-provider-aws_4.0.0_linux_amd64.zip"),
      ),
    ).toBe(true);
  });

  it("accepts a simple filename", () => {
    expect(valid(providerPublishData, withFilename("provider.zip"))).toBe(true);
  });

  it("rejects a filename with spaces", () => {
    expect(valid(providerPublishData, withFilename("my file.zip"))).toBe(false);
  });

  it("rejects a filename with path separators", () => {
    expect(valid(providerPublishData, withFilename("../etc/passwd"))).toBe(
      false,
    );
  });

  it("rejects a filename with special characters", () => {
    expect(valid(providerPublishData, withFilename('file"name.zip'))).toBe(
      false,
    );
  });

  it("rejects an empty string filename", () => {
    expect(valid(providerPublishData, withFilename(""))).toBe(false);
  });

  it("rejects a filename over 255 characters", () => {
    expect(
      valid(providerPublishData, withFilename("a".repeat(256) + ".zip")),
    ).toBe(false);
  });
});
