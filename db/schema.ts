import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// ============================================================================
// Modules
// ============================================================================

export const modules = sqliteTable(
  "modules",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    namespace: text("namespace").notNull(),
    name: text("name").notNull(),
    provider: text("provider").notNull(),
    version: text("version").notNull(),
    owner: text("owner").notNull().default(""),
    description: text("description"),
    source: text("source"),
    location: text("location"),
    definition: text("definition", { mode: "json" }),
    downloads: integer("downloads").notNull().default(0),
    publishedAt: integer("published_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    /**
     * updatedAt mirrors publishedAt — module versions are immutable (publish/delete only).
     * This field is set once at publish time and never changed. It exists to satisfy
     * ORM conventions and potential future use if module metadata editing is added.
     */
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("modules_unique_idx").on(
      table.namespace,
      table.name,
      table.provider,
      table.version,
    ),
    index("modules_namespace_idx").on(table.namespace),
    index("modules_published_at_idx").on(table.publishedAt),
  ],
);

export type Module = typeof modules.$inferSelect;
export type NewModule = typeof modules.$inferInsert;

// ============================================================================
// Providers
// ============================================================================

export const providers = sqliteTable(
  "providers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    namespace: text("namespace").notNull(),
    type: text("type").notNull(),
    version: text("version").notNull(),
    protocols: text("protocols", { mode: "json" }).notNull().$type<string[]>(),
    publishedAt: integer("published_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("providers_unique_idx").on(
      table.namespace,
      table.type,
      table.version,
    ),
    index("providers_namespace_idx").on(table.namespace),
  ],
);

// NOTE: The `providers` table intentionally omits `updatedAt`. Provider versions
// are immutable — once published, only deleted. No metadata editing is supported.
// If editing is added in the future, add updatedAt with a proper migration.
export type Provider = typeof providers.$inferSelect;
export type NewProvider = typeof providers.$inferInsert;

// ============================================================================
// Provider Platforms
// ============================================================================

export const providerPlatforms = sqliteTable(
  "provider_platforms",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    providerId: integer("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    os: text("os").notNull(),
    arch: text("arch").notNull(),
    filename: text("filename").notNull(),
    shasum: text("shasum").notNull(),
    location: text("location"),
    shasumUrl: text("shasum_url"),
    shasumSignatureUrl: text("shasum_signature_url"),
  },
  (table) => [
    uniqueIndex("provider_platforms_unique_idx").on(
      table.providerId,
      table.os,
      table.arch,
    ),
    index("provider_platforms_provider_idx").on(table.providerId),
  ],
);

export type ProviderPlatform = typeof providerPlatforms.$inferSelect;
export type NewProviderPlatform = typeof providerPlatforms.$inferInsert;

// ============================================================================
// GPG Public Keys (for provider signing)
// ============================================================================

export const gpgPublicKeys = sqliteTable(
  "gpg_public_keys",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    providerId: integer("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    keyId: text("key_id").notNull(),
    asciiArmor: text("ascii_armor").notNull(),
    source: text("source").notNull().default(""),
    sourceUrl: text("source_url"),
  },
  (table) => [index("gpg_keys_provider_idx").on(table.providerId)],
);

export type GpgPublicKey = typeof gpgPublicKeys.$inferSelect;
export type NewGpgPublicKey = typeof gpgPublicKeys.$inferInsert;

// ============================================================================
// API Keys
// ============================================================================

export const apiKeys = sqliteTable(
  "api_keys",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    keyHash: text("key_hash").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    permissions: text("permissions", { mode: "json" }).$type<string[]>(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
    expiresAt: integer("expires_at", { mode: "timestamp" }),
  },
  (table) => [index("api_keys_hash_idx").on(table.keyHash)],
);

export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
