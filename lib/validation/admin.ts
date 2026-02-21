import { z } from "zod";
import {
  namespaceSchema,
  nameSchema,
  providerSchema,
  typeSchema,
  versionSchema,
  osSchema,
  archSchema,
} from "./registry";

const IF_MATCH_VALUE_REGEX = /^(?:W\/)?"?\d+"?$/;

// ============================================================================
// Shared Admin Header Contracts
// ============================================================================

/**
 * Mutable admin writes require a single revision-based If-Match value.
 * Accepted values: W/"3", "3", 3
 */
export const ifMatchHeaderValue = z
  .string()
  .trim()
  .min(1, "If-Match header is required")
  .regex(IF_MATCH_VALUE_REGEX, 'If-Match must be a revision ETag (e.g. W/"3")')
  .refine((value) => !value.includes(","), {
    message: "If-Match must contain a single revision ETag",
  });

export type IfMatchHeaderValue = z.infer<typeof ifMatchHeaderValue>;

// ============================================================================
// Module Admin Schemas
// ============================================================================

/**
 * PATCH body for updating module metadata (admin).
 * All fields are optional — only provided fields are updated.
 * At least one field must be present.
 */
export const adminModuleUpdateBody = z
  .object({
    description: z.string().max(2000).nullable().optional(),
    source: z.string().max(500).nullable().optional(),
    owner: z.string().max(100).optional(),
    tags: z.array(providerSchema).max(20, "Maximum 20 tags allowed").optional(),
  })
  .strict({ message: "Unknown fields are not allowed" })
  .refine(
    (data) =>
      data.description !== undefined ||
      data.source !== undefined ||
      data.owner !== undefined ||
      data.tags !== undefined,
    { message: "At least one field must be provided" },
  );

export type AdminModuleUpdateBody = z.infer<typeof adminModuleUpdateBody>;

/**
 * POST body fields for creating a module version via admin API.
 * Used after multipart form-data extraction.
 */
export const adminModuleCreateBody = z
  .object({
    version: versionSchema,
    owner: z.string().max(100).optional(),
    description: z.string().max(2000).nullable().optional(),
    source: z.string().max(500).nullable().optional(),
    tags: z.array(providerSchema).max(20, "Maximum 20 tags allowed").optional(),
  })
  .strict({ message: "Unknown fields are not allowed" });

export type AdminModuleCreateBody = z.infer<typeof adminModuleCreateBody>;

// ============================================================================
// Provider Admin Schemas
// ============================================================================

/**
 * PATCH body for updating provider metadata (admin).
 * Currently only protocols can be edited.
 */
export const adminProviderUpdateBody = z
  .object({
    protocols: z
      .array(z.string().min(1))
      .min(1, "At least one protocol is required")
      .optional(),
  })
  .strict({ message: "Unknown fields are not allowed" })
  .refine((data) => data.protocols !== undefined, {
    message: "At least one field must be provided",
  });

export type AdminProviderUpdateBody = z.infer<typeof adminProviderUpdateBody>;

/**
 * POST body for creating a provider version via admin API.
 */
export const adminProviderCreateBody = z
  .object({
    version: versionSchema,
    protocols: z.array(z.string().min(1)).min(1),
    platforms: z
      .array(
        z
          .object({
            os: osSchema,
            arch: archSchema,
            filename: z
              .string()
              .min(1)
              .max(255)
              .regex(
                /^[a-zA-Z0-9._-]+$/,
                "Invalid filename — only alphanumeric characters, dots, hyphens, and underscores are allowed",
              ),
            shasum: z
              .string()
              .regex(
                /^[a-f0-9]{64}$/i,
                "Invalid SHA-256 hash — must be 64 hex characters",
              ),
            location: z.string().min(1).optional(),
            shasum_url: z.string().url().optional(),
            shasum_signature_url: z.string().url().optional(),
          })
          .strict({ message: "Unknown fields are not allowed" }),
      )
      .min(1),
    gpg_public_keys: z
      .array(
        z
          .object({
            key_id: z.string().min(1),
            ascii_armor: z.string().min(1),
            source: z.string().default(""),
            source_url: z.string().url().nullish(),
          })
          .strict({ message: "Unknown fields are not allowed" }),
      )
      .min(1),
  })
  .strict({ message: "Unknown fields are not allowed" });

export type AdminProviderCreateBody = z.infer<typeof adminProviderCreateBody>;

/**
 * PUT body for replacing a provider platform artifact via admin API.
 */
export const adminProviderPlatformReplaceBody = z
  .object({
    filename: z
      .string()
      .min(1)
      .max(255)
      .regex(
        /^[a-zA-Z0-9._-]+$/,
        "Invalid filename — only alphanumeric characters, dots, hyphens, and underscores are allowed",
      ),
    shasum: z
      .string()
      .regex(
        /^[a-f0-9]{64}$/i,
        "Invalid SHA-256 hash — must be 64 hex characters",
      ),
    location: z.string().min(1).optional(),
    shasum_url: z.string().url().optional(),
    shasum_signature_url: z.string().url().optional(),
  })
  .strict({ message: "Unknown fields are not allowed" });

export type AdminProviderPlatformReplaceBody = z.infer<
  typeof adminProviderPlatformReplaceBody
>;

// ============================================================================
// Alias Schemas
// ============================================================================

/**
 * Body for creating a module alias (redirect).
 * Source = the old/alias coordinates that will be looked up.
 * Target = the real coordinates to resolve to.
 */
export const createModuleAliasBody = z
  .object({
    source_namespace: namespaceSchema,
    source_name: nameSchema,
    source_provider: providerSchema,
    target_namespace: namespaceSchema,
    target_name: nameSchema,
    target_provider: providerSchema,
  })
  .strict({ message: "Unknown fields are not allowed" })
  .refine(
    (data) =>
      data.source_namespace !== data.target_namespace ||
      data.source_name !== data.target_name ||
      data.source_provider !== data.target_provider,
    { message: "Source and target must differ" },
  );

export type CreateModuleAliasBody = z.infer<typeof createModuleAliasBody>;

/**
 * Body for creating a provider alias (redirect).
 */
export const createProviderAliasBody = z
  .object({
    source_namespace: namespaceSchema,
    source_type: typeSchema,
    target_namespace: namespaceSchema,
    target_type: typeSchema,
  })
  .strict({ message: "Unknown fields are not allowed" })
  .refine(
    (data) =>
      data.source_namespace !== data.target_namespace ||
      data.source_type !== data.target_type,
    { message: "Source and target must differ" },
  );

export type CreateProviderAliasBody = z.infer<typeof createProviderAliasBody>;

// ============================================================================
// Alias Delete Params (route params for DELETE endpoints)
// ============================================================================

/** DELETE /v1/admin/aliases/modules/:namespace/:name/:provider */
export const moduleAliasDeleteParams = z.object({
  namespace: namespaceSchema,
  name: nameSchema,
  provider: providerSchema,
});

/** DELETE /v1/admin/aliases/providers/:namespace/:type */
export const providerAliasDeleteParams = z.object({
  namespace: namespaceSchema,
  type: typeSchema,
});
