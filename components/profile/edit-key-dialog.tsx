"use client";

import { useState, useTransition, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { updateApiKeyAction } from "@/app/actions/profile";
import {
  PERMISSIONS,
  GRANULAR_PERMISSIONS,
  AVAILABLE_PERMISSIONS,
  PERMISSION_META,
} from "@/lib/permissions";
import type { ApiKeyData, UserRole } from "@/types/auth";

// ============================================================================
// Component Props
// ============================================================================

interface EditKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiKey: ApiKeyData;
  userRole: UserRole;
  onSuccess: () => void;
}

// ============================================================================
// Edit Key Dialog Component
// ============================================================================

/**
 * EditKeyDialog Component
 *
 * Dialog for editing an existing API key's name and permissions.
 * Admin users see all permissions including "Admin (full access)".
 * Regular users only see granular permissions.
 */
export function EditKeyDialog({
  open,
  onOpenChange,
  apiKey,
  userRole,
  onSuccess,
}: EditKeyDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(apiKey.name);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>(
    apiKey.permissions,
  );

  // Reset state when a different key is loaded
  useEffect(() => {
    setName(apiKey.name);
    setSelectedPermissions(apiKey.permissions);
  }, [apiKey.id, apiKey.name, apiKey.permissions]);

  const availablePerms =
    userRole === "admin" ? AVAILABLE_PERMISSIONS : GRANULAR_PERMISSIONS;

  const isAdminSelected = selectedPermissions.includes(PERMISSIONS.ADMIN);

  function handlePermissionToggle(perm: string, checked: boolean) {
    if (perm === PERMISSIONS.ADMIN) {
      if (checked) {
        // Admin selected → set only admin (it's a wildcard)
        setSelectedPermissions([PERMISSIONS.ADMIN]);
      } else {
        // Admin deselected → default to all granular
        setSelectedPermissions([...GRANULAR_PERMISSIONS]);
      }
    } else {
      // Toggling a granular permission
      const newPerms = checked
        ? [...selectedPermissions.filter((p) => p !== PERMISSIONS.ADMIN), perm]
        : selectedPermissions.filter((p) => p !== perm);
      setSelectedPermissions(newPerms);
    }
  }

  function handleSave() {
    if (selectedPermissions.length === 0) {
      toast.error("At least one permission must be selected");
      return;
    }

    if (!name.trim()) {
      toast.error("Key name is required");
      return;
    }

    startTransition(async () => {
      const result = await updateApiKeyAction(apiKey.id, {
        name: name.trim() !== apiKey.name ? name.trim() : undefined,
        permissions: selectedPermissions,
      });

      if (result.success) {
        toast.success("Key updated", {
          description: `API key "${name.trim()}" has been updated.`,
        });
        onOpenChange(false);
        onSuccess();
      } else {
        toast.error("Failed to update key", {
          description: result.error || "Please try again",
        });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit API Key</DialogTitle>
          <DialogDescription>
            Update the name and permissions for this API key.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name field */}
          <div className="space-y-2">
            <Label htmlFor="edit-key-name">Key Name</Label>
            <Input
              id="edit-key-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., My Application"
              disabled={isPending}
              maxLength={100}
            />
          </div>

          {/* Permissions */}
          <div className="space-y-3">
            <Label>Permissions</Label>
            <div className="space-y-2">
              {availablePerms.map((perm) => {
                const meta = PERMISSION_META[perm];
                const isGranularDisabledByAdmin =
                  perm !== PERMISSIONS.ADMIN && isAdminSelected;
                return (
                  <div key={perm} className="flex items-start gap-3">
                    <Checkbox
                      id={`edit-perm-${perm}`}
                      checked={
                        perm === PERMISSIONS.ADMIN
                          ? isAdminSelected
                          : isAdminSelected ||
                            selectedPermissions.includes(perm)
                      }
                      onCheckedChange={(checked) =>
                        handlePermissionToggle(perm, checked === true)
                      }
                      disabled={isPending || isGranularDisabledByAdmin}
                    />
                    <label
                      htmlFor={`edit-perm-${perm}`}
                      className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      <span className="font-medium">{meta.label}</span>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {meta.description}
                      </p>
                    </label>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={
              isPending || selectedPermissions.length === 0 || !name.trim()
            }
          >
            {isPending ? (
              <>
                <Loader2 className="animate-spin" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
