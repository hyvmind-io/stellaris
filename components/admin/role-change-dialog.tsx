"use client";

import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RoleBadge } from "@/components/ui/role-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AuthUser, UserRole } from "@/types/auth";

interface RoleChangeDialogProps {
  user: AuthUser | null;
  currentUserId?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (userId: number, newRole: UserRole) => Promise<void>;
}

const ROLES: { value: UserRole; label: string; description: string }[] = [
  {
    value: "admin",
    label: "Admin",
    description: "Full access, can publish modules and manage users",
  },
  {
    value: "user",
    label: "User",
    description: "Standard access, can view modules and providers",
  },
  {
    value: "guest",
    label: "Guest",
    description: "Read-only access to the registry",
  },
];

export function RoleChangeDialog({
  user,
  currentUserId,
  open,
  onOpenChange,
  onConfirm,
}: RoleChangeDialogProps) {
  const [selectedRole, setSelectedRole] = useState<UserRole | "">(
    user?.role ?? "",
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when dialog opens with a new user
  function handleOpenChange(newOpen: boolean) {
    if (newOpen && user) {
      setSelectedRole(user.role);
      setError(null);
    }
    onOpenChange(newOpen);
  }

  async function handleSubmit() {
    if (!user || !selectedRole || selectedRole === user.role) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await onConfirm(user.id, selectedRole);
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update user role",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!user) return null;

  const isSelf = user.id === currentUserId;
  const isDemotingAdmin =
    user.role === "admin" && selectedRole !== "admin" && selectedRole !== "";
  const isUnchanged = selectedRole === user.role || selectedRole === "";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change User Role</DialogTitle>
          <DialogDescription>
            Update the role for{" "}
            <span className="font-medium text-foreground">{user.username}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Current role */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Current role:</span>
            <RoleBadge role={user.role} />
          </div>

          {/* Role selector */}
          <div className="space-y-2">
            <Label htmlFor="role-select">New Role</Label>
            <Select
              value={selectedRole}
              onValueChange={(val) => setSelectedRole(val as UserRole)}
            >
              <SelectTrigger id="role-select">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((role) => (
                  <SelectItem key={role.value} value={role.value}>
                    <div className="flex flex-col">
                      <span>{role.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {role.description}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Warning for demoting an admin */}
          {isDemotingAdmin && (
            <div className="flex items-start gap-2 rounded-md border border-yellow-500/50 bg-yellow-500/10 p-3 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-yellow-500" />
              <div>
                <p className="font-medium text-yellow-500">Demoting Admin</p>
                <p className="text-muted-foreground">
                  This user will lose the ability to manage modules and
                  providers, and manage other users. Their sessions will be
                  invalidated.
                </p>
              </div>
            </div>
          )}

          {/* Warning for changing own role */}
          {isSelf && !isUnchanged && (
            <div className="flex items-start gap-2 rounded-md border border-yellow-500/50 bg-yellow-500/10 p-3 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-yellow-500" />
              <p className="text-muted-foreground">
                You are changing your own role. You may lose access to the admin
                panel.
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertTriangle className="size-4" />
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || isUnchanged}>
            {isSubmitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Updating...
              </>
            ) : (
              "Update Role"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
