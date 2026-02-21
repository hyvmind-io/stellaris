"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Pencil } from "lucide-react";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AuthUser } from "@/types/auth";

// ============================================================================
// Validation
// ============================================================================

const editUserSchema = z.object({
  email: z.string().email("Invalid email address"),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(20, "Username must be at most 20 characters")
    .regex(
      /^[a-zA-Z0-9_]+$/,
      "Username can only contain letters, numbers, and underscores",
    ),
  displayName: z.string().optional(),
});

type EditUserFormData = z.infer<typeof editUserSchema>;

// ============================================================================
// Props
// ============================================================================

interface EditUserDialogProps {
  user: AuthUser | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (
    userId: number,
    data: { email: string; username: string; displayName?: string },
  ) => Promise<void>;
}

// ============================================================================
// Component
// ============================================================================

export function EditUserDialog({
  user,
  open,
  onOpenChange,
  onConfirm,
}: EditUserDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof EditUserFormData, string>>
  >({});

  const [formData, setFormData] = useState<EditUserFormData>({
    email: "",
    username: "",
    displayName: "",
  });

  // Reset form data when the dialog opens with a (new) user
  useEffect(() => {
    if (open && user) {
      setFormData({
        email: user.email,
        username: user.username,
        displayName: user.displayName ?? "",
      });
      setError(null);
      setFieldErrors({});
    }
  }, [open, user]);

  function handleOpenChange(newOpen: boolean) {
    if (!isSubmitting) {
      onOpenChange(newOpen);
    }
  }

  function updateField<K extends keyof EditUserFormData>(
    field: K,
    value: EditUserFormData[K],
  ) {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear field error on change
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  }

  // Detect if the form has meaningful changes vs the original user
  const hasChanges =
    user !== null &&
    (formData.email !== user.email ||
      formData.username !== user.username ||
      (formData.displayName ?? "") !== (user.displayName ?? ""));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    setError(null);
    setFieldErrors({});

    // Client-side validation
    const parsed = editUserSchema.safeParse(formData);
    if (!parsed.success) {
      const errors: Partial<Record<keyof EditUserFormData, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof EditUserFormData;
        if (!errors[field]) {
          errors[field] = issue.message;
        }
      }
      setFieldErrors(errors);
      return;
    }

    setIsSubmitting(true);

    try {
      await onConfirm(user.id, {
        email: parsed.data.email,
        username: parsed.data.username,
        displayName: parsed.data.displayName || undefined,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update user");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="size-4" />
            Edit User
          </DialogTitle>
          <DialogDescription>
            Update profile details for{" "}
            <span className="font-medium text-foreground">{user.username}</span>
            . Role changes are handled separately.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="edit-email">
              Email <span className="text-destructive">*</span>
            </Label>
            <Input
              id="edit-email"
              type="email"
              placeholder="user@example.com"
              value={formData.email}
              onChange={(e) => updateField("email", e.target.value)}
              disabled={isSubmitting}
              autoComplete="off"
            />
            {fieldErrors.email && (
              <p className="text-xs text-destructive" role="alert">
                {fieldErrors.email}
              </p>
            )}
          </div>

          {/* Username */}
          <div className="space-y-2">
            <Label htmlFor="edit-username">
              Username <span className="text-destructive">*</span>
            </Label>
            <Input
              id="edit-username"
              placeholder="johndoe"
              value={formData.username}
              onChange={(e) => updateField("username", e.target.value)}
              disabled={isSubmitting}
              autoComplete="off"
            />
            {fieldErrors.username && (
              <p className="text-xs text-destructive" role="alert">
                {fieldErrors.username}
              </p>
            )}
          </div>

          {/* Display Name */}
          <div className="space-y-2">
            <Label htmlFor="edit-display-name">Display Name</Label>
            <Input
              id="edit-display-name"
              placeholder="John Doe"
              value={formData.displayName}
              onChange={(e) => updateField("displayName", e.target.value)}
              disabled={isSubmitting}
              autoComplete="off"
            />
          </div>

          {/* Error */}
          {error && (
            <div
              className="flex items-center gap-2 text-sm text-destructive"
              role="alert"
            >
              <AlertTriangle className="size-4 shrink-0" />
              {error}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !hasChanges}>
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
