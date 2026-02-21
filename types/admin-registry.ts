import type { ProviderPlatform, GpgPublicKey } from "@/db/schema";

// ============================================================================
// Admin Module Types
// ============================================================================

/**
 * Module summary for admin table listing.
 * Includes aggregated version count and total downloads.
 */
export interface AdminModuleSummary {
  namespace: string;
  name: string;
  provider: string;
  description: string | null;
  latestVersion: string;
  revision: number;
  etag: string;
  versionCount: number;
  totalDownloads: number;
  publishedAt: Date;
  updatedAt: Date;
}

/**
 * Full module version row for version history dialog.
 */
export interface AdminModuleVersion {
  id: number;
  version: string;
  revision: number;
  etag: string;
  description: string | null;
  source: string | null;
  owner: string;
  downloads: number;
  location: string | null;
  publishedAt: Date;
}

/**
 * Module detail with all versions for the details dialog.
 */
export interface AdminModuleDetail {
  namespace: string;
  name: string;
  provider: string;
  description: string | null;
  source: string | null;
  owner: string;
  tags: string[];
  versions: AdminModuleVersion[];
}

// ============================================================================
// Admin Provider Types
// ============================================================================

/**
 * Provider summary for admin table listing.
 * Includes aggregated version count and platform counts.
 */
export interface AdminProviderSummary {
  namespace: string;
  type: string;
  latestVersion: string;
  revision: number;
  etag: string;
  protocols: string[];
  versionCount: number;
  totalPlatforms: number;
  publishedAt: Date;
}

/**
 * Full provider version row with platforms for version history.
 */
export interface AdminProviderVersion {
  id: number;
  version: string;
  revision: number;
  etag: string;
  protocols: string[];
  platforms: Pick<ProviderPlatform, "os" | "arch" | "filename" | "shasum">[];
  gpgKeys: Pick<GpgPublicKey, "keyId" | "source">[];
  publishedAt: Date;
}

/**
 * Provider detail with all versions for the details dialog.
 */
export interface AdminProviderDetail {
  namespace: string;
  type: string;
  protocols: string[];
  versions: AdminProviderVersion[];
}

// ============================================================================
// Form Data Types (for create/edit dialogs)
// ============================================================================

/**
 * Data shape for creating a new module version.
 * The `artifact` field will be a File when the backend is wired up.
 */
export interface CreateModuleFormData {
  namespace: string;
  name: string;
  provider: string;
  version: string;
  description: string;
  source: string;
  owner: string;
  tags: string;
  artifact: File | null;
}

/**
 * Data shape for editing module metadata.
 */
export interface EditModuleFormData {
  version: string;
  description: string;
  source: string;
  owner: string;
  tags: string;
}

/**
 * Data shape for creating a new provider version.
 */
export interface CreateProviderFormData {
  namespace: string;
  type: string;
  version: string;
  os: string;
  arch: string;
  protocols: string;
  gpgKeyId: string;
  gpgAsciiArmor: string;
  gpgSource: string;
  gpgSourceUrl: string;
  artifact: File | null;
  shasumFile: File | null;
  shasumSigFile: File | null;
}

/**
 * Data shape for editing provider metadata.
 */
export interface EditProviderFormData {
  version: string;
  protocols: string;
}

export interface AdminConflictDetails {
  expectedRevision?: number;
  currentRevision?: number;
}

export type AdminErrorCode =
  | "CONFLICT"
  | "NOT_FOUND"
  | "VALIDATION"
  | "UNAUTHORIZED"
  | "UNKNOWN";

// ============================================================================
// Action Result Types (placeholder for future server actions)
// ============================================================================

/**
 * Generic action result for admin registry operations.
 * Matches the pattern used by existing admin actions (e.g. editUserAction).
 */
export interface AdminActionResult<T = undefined> {
  success: boolean;
  code?: AdminErrorCode;
  error?: string;
  conflict?: AdminConflictDetails;
  data?: T;
}

/**
 * Paginated list result for admin table queries.
 */
export interface AdminListResult<T> {
  items: T[];
  total: number;
  page: number;
  totalPages: number;
}
