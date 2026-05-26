import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types/auth";

interface RoleBadgeProps {
  role: UserRole;
  className?: string;
}

// Low-opacity single-hue overlays so the badge stays legible on ANY active
// theme/mode without relying on the `dark:` variant (matches the permission
// badge approach in lib/permissions.ts CATEGORY_COLORS). `guest` uses theme
// tokens so it tracks the active palette.
const ROLE_CONFIG: Record<UserRole, { label: string; className: string }> = {
  admin: {
    label: "Admin",
    className: "bg-amber-500/15 text-amber-500 border-amber-500/25",
  },
  user: {
    label: "User",
    className: "bg-blue-500/15 text-blue-500 border-blue-500/25",
  },
  guest: {
    label: "Guest",
    className: "bg-muted text-muted-foreground border-border",
  },
};

export function RoleBadge({ role, className }: RoleBadgeProps) {
  const config = ROLE_CONFIG[role];
  return (
    <Badge variant="outline" className={cn(config.className, className)}>
      {config.label}
    </Badge>
  );
}
