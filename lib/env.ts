import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  // Auth — JWT session signing secret (min 32 chars for HS256)
  AUTH_SESSION_SECRET: z
    .string()
    .min(32, "AUTH_SESSION_SECRET must be at least 32 characters")
    .default("dev-secret-change-in-production-minimum-32-chars!!"),
  // Private registry mode — when true, ALL routes require authentication.
  // Only login/signup and infrastructure endpoints are public.
  PRIVATE_REGISTRY: z.enum(["true", "false"]).default("true"),
  // Artifact auth mode — controls whether artifact-serving routes require Bearer auth.
  // "relaxed" (default) leaves artifact routes public (vanilla tofu/terraform compatible).
  // "strict" requires Bearer auth on ALL routes including artifact downloads.
  PRIVATE_REGISTRY_MODE: z.enum(["relaxed", "strict"]).default("relaxed"),
  // Storage backend: "local" for pnpm dev, "r2" for Cloudflare Workers, "s3"/"s3-compatible" for S3
  STORAGE_BACKEND: z.enum(["local", "r2", "s3", "s3-compatible"]).default("r2"),
  // S3 storage configuration (required when STORAGE_BACKEND is "s3" or "s3-compatible")
  // Validation is handled by S3Backend constructor — these are optional at the env schema level.
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_ENDPOINT: z.preprocess(
    (val) => (val === "" ? undefined : val),
    z.string().url().optional(),
  ),
  S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).optional(),
  // Upstream Proxy — fallback to public registries for missing modules/providers
  // When enabled, read/query/download requests that return 404 locally will be
  // proxied to upstream registries in order. Write/delete routes are never proxied.
  MODULE_UPSTREAM_PROXY_ENABLED: z.enum(["true", "false"]).default("false"),
  PROVIDER_UPSTREAM_PROXY_ENABLED: z.enum(["true", "false"]).default("false"),
  // Comma or newline-separated list of upstream registry base URLs.
  // Overrides built-in defaults (OpenTofu → HashiCorp). Set to empty string to
  // explicitly disable upstream fallback even when the proxy is enabled.
  MODULE_UPSTREAM_REGISTRIES: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : v)),
  PROVIDER_UPSTREAM_REGISTRIES: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : v)),
  // Whitelabeling — hide OSS/tech/sponsor branding, apply operator identity.
  // Master switch. When "false" (default), default Stellaris branding is shown.
  WHITELABEL_ENABLED: z.enum(["true", "false"]).default("false"),
  // Operator brand name (e.g. "Evil Corp"). When enabled and unset, the UI
  // degrades to generic (no brand name) but still strips tech/sponsor branding.
  WHITELABEL_BRAND_NAME: z.string().optional(),
  // Generic, vendor-free suffix after the brand name (e.g. "Registry").
  WHITELABEL_TITLE_SUFFIX: z.string().optional(),
  // Neutral hero tagline / meta description (no vendor/tech mentions).
  WHITELABEL_TAGLINE: z.string().optional(),
  // Custom logo + favicon by URL (external/CDN). Empty → default icon/favicon.
  WHITELABEL_LOGO_URL: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().url().optional(),
  ),
  WHITELABEL_FAVICON_URL: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().url().optional(),
  ),
  // Footer line. Supports the {year} placeholder (current UTC year).
  WHITELABEL_FOOTER_TEXT: z.string().optional(),
});

/**
 * Parse and validate the current `process.env` against the schema.
 *
 * Exposed (rather than only the memoized `env` below) so resolvers that need
 * to observe runtime/test mutations of `process.env` can re-read live values.
 */
export function parseEnv(): Env {
  return envSchema.parse(process.env);
}

export const env = parseEnv();

export type Env = z.infer<typeof envSchema>;
