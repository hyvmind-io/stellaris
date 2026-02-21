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
     * Tags map a module to one or more providers/systems (e.g., ["aws", "gcp"]).
     * Stored as a JSON-encoded array of strings in a plain text column.
     * Parsed manually via `parseTags()` in the data layer to avoid ORM-level
     * JSON.parse crashes on legacy rows with malformed values.
     * Nullable for backward compatibility — when null, callers fall back to [provider].
     */
    tags: text("tags"),
    /**
     * updatedAt mirrors publishedAt — module versions are immutable (publish/delete only).
     * This field is set once at publish time and never changed. It exists to satisfy
     * ORM conventions and potential future use if module metadata editing is added.
     */
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    /**
     * Monotonically increasing revision counter for optimistic concurrency control.
     * Exposed as a weak ETag (`W/"<revision>"`) in admin API responses.
     * Clients must send `If-Match: W/"<revision>"` for conditional updates.
     * Incremented atomically on every successful update.
     */
    revision: integer("revision").notNull().default(1),
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
    /** Tracks the last metadata update. Set to publishedAt initially. */
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    /**
     * Monotonically increasing revision counter for optimistic concurrency control.
     * Same semantics as modules.revision — see that column for details.
     */
    revision: integer("revision").notNull().default(1),
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
    userId: integer("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => [index("api_keys_hash_idx").on(table.keyHash)],
);

export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;

// ============================================================================
// Users
// ============================================================================

export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    email: text("email").notNull().unique(),
    username: text("username").notNull().unique(),
    displayName: text("display_name"),
    passwordHash: text("password_hash").notNull(),
    role: text("role", { enum: ["admin", "user", "guest"] })
      .notNull()
      .default("guest"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    lastLoginAt: integer("last_login_at", { mode: "timestamp" }),
  },
  (table) => [
    uniqueIndex("users_email_unique_idx").on(table.email),
    uniqueIndex("users_username_unique_idx").on(table.username),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

// ============================================================================
// Sessions
// ============================================================================

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(), // crypto.randomUUID()
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("sessions_user_idx").on(table.userId),
    index("sessions_expires_idx").on(table.expiresAt),
  ],
);

export type Session = typeof sessions.$inferSelect;

// ============================================================================
// Rate Limits
// ============================================================================

export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(), // e.g., "login:email:user@example.com"
  count: integer("count").notNull().default(0),
  windowStart: integer("window_start", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ============================================================================
// System Settings
// ============================================================================

export const systemSettings = sqliteTable("system_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type SystemSetting = typeof systemSettings.$inferSelect;
export type NewSystemSetting = typeof systemSettings.$inferInsert;

// ============================================================================
// Module Aliases
// ============================================================================

/**
 * Redirects for renamed/moved modules.
 * When a client requests (sourceNamespace, sourceName, sourceProvider),
 * the registry resolves it to (targetNamespace, targetName, targetProvider)
 * transparently. Each source tuple is unique — only one redirect per alias.
 */
export const moduleAliases = sqliteTable(
  "module_aliases",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sourceNamespace: text("source_namespace").notNull(),
    sourceName: text("source_name").notNull(),
    sourceProvider: text("source_provider").notNull(),
    targetNamespace: text("target_namespace").notNull(),
    targetName: text("target_name").notNull(),
    targetProvider: text("target_provider").notNull(),
    createdBy: text("created_by"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("module_aliases_source_idx").on(
      table.sourceNamespace,
      table.sourceName,
      table.sourceProvider,
    ),
    index("module_aliases_target_idx").on(
      table.targetNamespace,
      table.targetName,
      table.targetProvider,
    ),
  ],
);

export type ModuleAlias = typeof moduleAliases.$inferSelect;
export type NewModuleAlias = typeof moduleAliases.$inferInsert;

// ============================================================================
// Provider Aliases
// ============================================================================

/**
 * Redirects for renamed/moved providers.
 * Same concept as module aliases but keyed on (namespace, type).
 */
export const providerAliases = sqliteTable(
  "provider_aliases",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sourceNamespace: text("source_namespace").notNull(),
    sourceType: text("source_type").notNull(),
    targetNamespace: text("target_namespace").notNull(),
    targetType: text("target_type").notNull(),
    createdBy: text("created_by"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("provider_aliases_source_idx").on(
      table.sourceNamespace,
      table.sourceType,
    ),
    index("provider_aliases_target_idx").on(
      table.targetNamespace,
      table.targetType,
    ),
  ],
);

export type ProviderAlias = typeof providerAliases.$inferSelect;
export type NewProviderAlias = typeof providerAliases.$inferInsert;

// ============================================================================
// Audit Logs
// ============================================================================

/**
 * Append-only audit trail for admin mutations.
 * Every create/update/delete through admin endpoints writes a log entry.
 * The metadata column holds a JSON-encoded diff or context payload.
 */
export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** Dot-separated action verb, e.g. "module.create", "provider.delete". */
    action: text("action").notNull(),
    /** Top-level resource kind: "module", "provider", "alias", "api_key". */
    resourceType: text("resource_type").notNull(),
    /** Human-readable resource identifier, e.g. "hashicorp/consul/aws/1.0.0". */
    resourceId: text("resource_id").notNull(),
    /** Who performed the action — API key name, user id, or "system". */
    actorId: text("actor_id"),
    /** Actor kind: "api_key", "user", "system". */
    actorType: text("actor_type"),
    /** Arbitrary JSON payload — old/new values, request metadata, etc. */
    metadata: text("metadata", { mode: "json" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("audit_logs_action_idx").on(table.action),
    index("audit_logs_resource_idx").on(table.resourceType, table.resourceId),
    index("audit_logs_actor_idx").on(table.actorType, table.actorId),
    index("audit_logs_created_at_idx").on(table.createdAt),
  ],
);

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
