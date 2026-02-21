import { getDb } from "@/db/client";
import { auditLogs } from "@/db/schema";
import type { AuditLog } from "@/db/schema";

// ============================================================================
// Types
// ============================================================================

/** Well-known audit actions. Extensible — new actions can be added without changes. */
export type AuditAction =
  | "module.create"
  | "module.update"
  | "module.delete"
  | "provider.create"
  | "provider.update"
  | "provider.delete"
  | "alias.create"
  | "alias.delete"
  | "api_key.create"
  | "api_key.update"
  | "api_key.delete"
  | (string & {}); // allow arbitrary strings while keeping autocomplete

export type AuditActorType = "api_key" | "user" | "system";

export interface AdminAuditRevisionMetadata {
  expectedRevision?: number;
  currentRevision?: number | null;
  nextRevision?: number;
}

export interface ModuleAuditMetadata {
  entity: "module";
  namespace: string;
  name: string;
  provider: string;
  version: string;
  revision?: AdminAuditRevisionMetadata;
  changedFields?: string[];
}

export interface ProviderAuditMetadata {
  entity: "provider";
  namespace: string;
  type: string;
  version: string;
  os?: string;
  arch?: string;
  revision?: AdminAuditRevisionMetadata;
  changedFields?: string[];
}

export type AdminAuditMetadata = ModuleAuditMetadata | ProviderAuditMetadata;

export type AuditMetadata = AdminAuditMetadata | Record<string, unknown>;

export interface WriteAuditLogParams {
  action: AuditAction;
  resourceType: string;
  resourceId: string;
  actorId?: string;
  actorType?: AuditActorType;
  metadata?: AuditMetadata;
}

export function buildModuleAuditMetadata(
  metadata: Omit<ModuleAuditMetadata, "entity">,
): ModuleAuditMetadata {
  return { entity: "module", ...metadata };
}

export function buildProviderAuditMetadata(
  metadata: Omit<ProviderAuditMetadata, "entity">,
): ProviderAuditMetadata {
  return { entity: "provider", ...metadata };
}

// ============================================================================
// Write
// ============================================================================

/**
 * Append an audit log entry.
 *
 * This is a fire-and-forget operation in most call sites — callers should
 * catch and log errors but never let audit failures block the primary
 * mutation from completing.
 *
 * @returns The created audit log row.
 */
export async function writeAuditLog(
  params: WriteAuditLogParams,
): Promise<AuditLog> {
  const db = getDb();
  const [entry] = await db
    .insert(auditLogs)
    .values({
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      actorId: params.actorId,
      actorType: params.actorType,
      metadata: params.metadata ?? null,
    })
    .returning();
  return entry!;
}
