// ============================================================================
// API Key Permissions — Single Source of Truth
// ============================================================================

/**
 * All permission identifiers used across route handlers.
 * Maps to the `requireAuth(request, "<permission>")` calls in route files.
 */
export const PERMISSIONS = {
  ADMIN: "admin",
  MODULES_READ: "modules:read",
  MODULES_WRITE: "modules:write",
  PROVIDERS_READ: "providers:read",
  PROVIDERS_WRITE: "providers:write",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** All valid permissions (including admin). */
export const AVAILABLE_PERMISSIONS: readonly Permission[] = [
  PERMISSIONS.ADMIN,
  PERMISSIONS.MODULES_READ,
  PERMISSIONS.MODULES_WRITE,
  PERMISSIONS.PROVIDERS_READ,
  PERMISSIONS.PROVIDERS_WRITE,
] as const;

/** Granular permissions (excluding admin). Default for non-admin key creation. */
export const GRANULAR_PERMISSIONS: readonly Permission[] = [
  PERMISSIONS.MODULES_READ,
  PERMISSIONS.MODULES_WRITE,
  PERMISSIONS.PROVIDERS_READ,
  PERMISSIONS.PROVIDERS_WRITE,
] as const;

/** Default permissions assigned when user doesn't explicitly select any. */
export const DEFAULT_PERMISSIONS: readonly Permission[] = GRANULAR_PERMISSIONS;

// ============================================================================
// Display Metadata (UI)
// ============================================================================

export type PermissionCategory = "admin" | "modules" | "providers";

export interface PermissionMeta {
  label: string;
  description: string;
  category: PermissionCategory;
}

/** Display metadata for UI badges, tooltips, and form labels. */
export const PERMISSION_META: Record<Permission, PermissionMeta> = {
  admin: {
    label: "Admin",
    description: "Full access to all operations",
    category: "admin",
  },
  "modules:read": {
    label: "Modules Read",
    description: "List, view, and download modules",
    category: "modules",
  },
  "modules:write": {
    label: "Modules Write",
    description: "Publish and delete modules",
    category: "modules",
  },
  "providers:read": {
    label: "Providers Read",
    description: "List, view, and download providers",
    category: "providers",
  },
  "providers:write": {
    label: "Providers Write",
    description: "Publish and delete providers",
    category: "providers",
  },
};

/** Badge color mapping by category (Tailwind classes). */
export const CATEGORY_COLORS: Record<PermissionCategory, string> = {
  admin: "bg-amber-500/15 text-amber-500 border-amber-500/25",
  modules: "bg-blue-500/15 text-blue-500 border-blue-500/25",
  providers: "bg-emerald-500/15 text-emerald-500 border-emerald-500/25",
};

// ============================================================================
// Utilities
// ============================================================================

/** Type guard for valid permission strings. */
export function isValidPermission(value: string): value is Permission {
  return (AVAILABLE_PERMISSIONS as readonly string[]).includes(value);
}
