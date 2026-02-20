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
});

export const env = envSchema.parse(process.env);

export type Env = z.infer<typeof envSchema>;
