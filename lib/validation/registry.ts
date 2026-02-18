import { z } from "zod";

// ============================================================================
// Base Schemas
// ============================================================================

/** Lowercase alphanumeric + hyphens, 1-64 chars, no leading/trailing hyphens. */
export const namespaceSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, "Invalid namespace format");

/** Lowercase alphanumeric + hyphens, 1-64 chars, no leading/trailing hyphens. */
export const nameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, "Invalid name format");

/** Provider/system identifier — same pattern as namespace. */
export const providerSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, "Invalid provider/system format");

/** Provider type identifier — same pattern as namespace. */
export const typeSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, "Invalid type format");

/** Strict semver (major.minor.patch with optional pre-release and build metadata). */
export const versionSchema = z
  .string()
  .regex(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/,
    "Invalid semver version",
  );

/** Operating system identifier — lowercase alphanumeric + underscores. */
export const osSchema = z
  .string()
  .min(1)
  .max(32)
  .regex(/^[a-z0-9_]+$/, "Invalid OS format");

/** Architecture identifier — lowercase alphanumeric + underscores. */
export const archSchema = z
  .string()
  .min(1)
  .max(32)
  .regex(/^[a-z0-9_]+$/, "Invalid arch format");

// ============================================================================
// Composite Schemas — Route Parameters
// ============================================================================

/** GET /v1/modules/:namespace/:name/:system/versions */
export const moduleVersionsParams = z.object({
  namespace: namespaceSchema,
  name: nameSchema,
  system: providerSchema, // Terraform calls it "system" in the URL
});

/** GET /v1/modules/:namespace/:name/:system/:version/download */
export const moduleDownloadParams = z.object({
  namespace: namespaceSchema,
  name: nameSchema,
  system: providerSchema,
  version: versionSchema,
});

/** GET /v1/providers/:namespace/:type/versions */
export const providerVersionsParams = z.object({
  namespace: namespaceSchema,
  type: typeSchema,
});

/** GET /v1/providers/:namespace/:type/:version/download/:os/:arch */
export const providerDownloadParams = z.object({
  namespace: namespaceSchema,
  type: typeSchema,
  version: versionSchema,
  os: osSchema,
  arch: archSchema,
});

/** Shared params for provider artifacts (SHA sums, signing keys, etc.) */
export const providerArtifactParams = z.object({
  namespace: namespaceSchema,
  type: typeSchema,
  version: versionSchema,
});

// ============================================================================
// Query Parameter Schemas — List/Search Endpoints
// ============================================================================

/** Pagination + filter params for GET /v1/modules */
export const moduleListQuery = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(15),
  q: z.string().max(128).optional(),
  namespace: namespaceSchema.optional(),
  provider: providerSchema.optional(),
});

/** Pagination + filter params for GET /v1/providers */
export const providerListQuery = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(15),
  q: z.string().max(128).optional(),
  namespace: namespaceSchema.optional(),
  type: typeSchema.optional(),
});

// ============================================================================
// Publish Schemas — Write Endpoints
// ============================================================================

/** POST /v1/modules/:namespace/:name/:system/:version — route params */
export const modulePublishParams = z.object({
  namespace: namespaceSchema,
  name: nameSchema,
  system: providerSchema, // URL says "system", maps to "provider" in DB
  version: versionSchema,
});

/** POST /v1/providers/:namespace/:type/:version — route params (reuses providerArtifactParams) */
export const providerPublishParams = providerArtifactParams;

/** JSON body inside multipart `data` field for provider publish */
export const providerPublishData = z.object({
  protocols: z.array(z.string().min(1)).min(1),
  platforms: z
    .array(
      z.object({
        os: osSchema,
        arch: archSchema,
        shasum: z.string().min(1),
        filename: z.string().min(1),
      }),
    )
    .min(1),
  gpg_public_keys: z
    .array(
      z.object({
        key_id: z.string().min(1),
        ascii_armor: z.string().min(1),
        source: z.string().default(""),
        source_url: z.string().url().nullish(),
      }),
    )
    .min(1),
});

// ============================================================================
// GET-specific Params — Read Endpoints
// ============================================================================

/** GET /v1/modules/:namespace/:name/:system/:version */
export const moduleGetParams = moduleDownloadParams;

/** GET /v1/modules/:namespace/:name/:system (latest) */
export const moduleLatestParams = moduleVersionsParams;

/** GET /v1/providers/:namespace/:type/:version */
export const providerGetParams = providerArtifactParams;

// ============================================================================
// Inferred Types
// ============================================================================

export type ModuleListQuery = z.infer<typeof moduleListQuery>;
export type ProviderListQuery = z.infer<typeof providerListQuery>;
export type ProviderPublishData = z.infer<typeof providerPublishData>;
