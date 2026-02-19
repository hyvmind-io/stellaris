import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types/auth";

interface RoleBadgeProps {
  role: UserRole;
  className?: string;
}

const ROLE_CONFIG: Record<UserRole, { label: string; className: string }> = {
  admin: {
    label: "Admin",
    className:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-amber-300 dark:border-amber-800",
  },
  user: {
    label: "User",
    className:
      "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-blue-300 dark:border-blue-800",
  },
  guest: {
    label: "Guest",
    className:
      "bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400 border-gray-300 dark:border-gray-600",
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
