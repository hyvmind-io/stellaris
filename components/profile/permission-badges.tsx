import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  PERMISSION_META,
  CATEGORY_COLORS,
  isValidPermission,
} from "@/lib/permissions";
import type { PermissionCategory } from "@/lib/permissions";

// ============================================================================
// Component Props
// ============================================================================

interface PermissionBadgesProps {
  permissions: string[];
  className?: string;
}

// ============================================================================
// Permission Badges Component
// ============================================================================

/**
 * PermissionBadges Component
 *
 * Displays a list of permissions as color-coded badges.
 * Colors are grouped by category:
 *   - admin → amber
 *   - modules → blue
 *   - providers → emerald
 */
export function PermissionBadges({
  permissions,
  className,
}: PermissionBadgesProps) {
  if (permissions.length === 0) {
    return <span className="text-xs text-muted-foreground">None</span>;
  }

  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {permissions.map((perm) => {
        if (!isValidPermission(perm)) return null;
        const meta = PERMISSION_META[perm];
        const colors = CATEGORY_COLORS[meta.category as PermissionCategory];
        return (
          <Badge
            key={perm}
            variant="outline"
            className={cn("text-[10px] px-1.5 py-0", colors)}
          >
            {meta.label}
          </Badge>
        );
      })}
    </div>
  );
}
