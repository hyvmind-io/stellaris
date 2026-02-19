"use client";

import {
  Calendar,
  Clock,
  Key,
  Mail,
  Monitor,
  Shield,
  User,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RoleBadge } from "@/components/ui/role-badge";
import type { AuthUserWithCounts } from "@/types/auth";

interface UserDetailsDialogProps {
  user: AuthUserWithCounts | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatDate(date: Date | string | null): string {
  if (!date) return "Never";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function UserDetailsDialog({
  user,
  open,
  onOpenChange,
}: UserDetailsDialogProps) {
  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>User Details</DialogTitle>
          <DialogDescription>
            Detailed information about this user account.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Identity */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <User className="size-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Username</p>
                <p className="text-sm font-medium truncate">{user.username}</p>
              </div>
            </div>

            {user.displayName && (
              <div className="flex items-center gap-3">
                <User className="size-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Display Name</p>
                  <p className="text-sm font-medium truncate">
                    {user.displayName}
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <Mail className="size-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="text-sm font-medium truncate">{user.email}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Shield className="size-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground mb-1">Role</p>
                <RoleBadge role={user.role} />
              </div>
            </div>
          </div>

          <hr className="border-border" />

          {/* Activity */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Calendar className="size-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Created</p>
                <p className="text-sm">{formatDate(user.createdAt)}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Clock className="size-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Last Login</p>
                <p className="text-sm">{formatDate(user.lastLoginAt)}</p>
              </div>
            </div>
          </div>

          <hr className="border-border" />

          {/* Counts */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <Key className="size-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">API Keys</p>
                <p className="text-sm font-medium">{user.apiKeyCount}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Monitor className="size-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Active Sessions</p>
                <p className="text-sm font-medium">{user.sessionCount}</p>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
