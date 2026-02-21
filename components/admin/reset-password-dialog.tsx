"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
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

const resetPasswordSchema = z
  .object({
    newPassword: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(128, "Password too long"),
    confirmPassword: z.string().min(1, "Please confirm the new password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;

// ============================================================================
// Props
// ============================================================================

interface ResetPasswordDialogProps {
  user: AuthUser | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (userId: number, newPassword: string) => Promise<void>;
}

// ============================================================================
// Component
// ============================================================================

export function ResetPasswordDialog({
  user,
  open,
  onOpenChange,
  onConfirm,
}: ResetPasswordDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof ResetPasswordFormData, string>>
  >({});
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [formData, setFormData] = useState<ResetPasswordFormData>({
    newPassword: "",
    confirmPassword: "",
  });

  // Reset form state when the dialog opens
  useEffect(() => {
    if (open) {
      setFormData({ newPassword: "", confirmPassword: "" });
      setError(null);
      setFieldErrors({});
      setShowNewPassword(false);
      setShowConfirmPassword(false);
    }
  }, [open]);

  function handleOpenChange(newOpen: boolean) {
    if (!isSubmitting) {
      onOpenChange(newOpen);
    }
  }

  function updateField<K extends keyof ResetPasswordFormData>(
    field: K,
    value: ResetPasswordFormData[K],
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    setError(null);
    setFieldErrors({});

    // Client-side validation
    const parsed = resetPasswordSchema.safeParse(formData);
    if (!parsed.success) {
      const errors: Partial<Record<keyof ResetPasswordFormData, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof ResetPasswordFormData;
        if (!errors[field]) {
          errors[field] = issue.message;
        }
      }
      setFieldErrors(errors);
      return;
    }

    setIsSubmitting(true);

    try {
      await onConfirm(user.id, parsed.data.newPassword);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset password");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!user) return null;

  const hasInput = formData.newPassword.length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-4" />
            Reset Password
          </DialogTitle>
          <DialogDescription>
            Set a new password for{" "}
            <span className="font-medium text-foreground">{user.username}</span>
            . The user will need to use this new password on their next login.
          </DialogDescription>
        </DialogHeader>

        {/* Session invalidation warning */}
        <div className="flex items-start gap-2 rounded-md border border-yellow-500/50 bg-yellow-500/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-yellow-500" />
          <div>
            <p className="font-medium text-yellow-500">
              Active sessions will be terminated
            </p>
            <p className="text-muted-foreground">
              This user will be logged out of all devices and active sessions
              immediately.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* New Password */}
          <div className="space-y-2">
            <Label htmlFor="reset-new-password">
              New Password <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Input
                id="reset-new-password"
                type={showNewPassword ? "text" : "password"}
                placeholder="Enter new password"
                value={formData.newPassword}
                onChange={(e) => updateField("newPassword", e.target.value)}
                disabled={isSubmitting}
                autoComplete="new-password"
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-10 w-10 text-muted-foreground hover:text-foreground"
                onClick={() => setShowNewPassword(!showNewPassword)}
                tabIndex={-1}
              >
                {showNewPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
                <span className="sr-only">
                  {showNewPassword ? "Hide password" : "Show password"}
                </span>
              </Button>
            </div>
            {fieldErrors.newPassword && (
              <p className="text-xs text-destructive" role="alert">
                {fieldErrors.newPassword}
              </p>
            )}
          </div>

          {/* Confirm Password */}
          <div className="space-y-2">
            <Label htmlFor="reset-confirm-password">
              Confirm Password <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Input
                id="reset-confirm-password"
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Confirm new password"
                value={formData.confirmPassword}
                onChange={(e) => updateField("confirmPassword", e.target.value)}
                disabled={isSubmitting}
                autoComplete="new-password"
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-10 w-10 text-muted-foreground hover:text-foreground"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                tabIndex={-1}
              >
                {showConfirmPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
                <span className="sr-only">
                  {showConfirmPassword ? "Hide password" : "Show password"}
                </span>
              </Button>
            </div>
            {fieldErrors.confirmPassword && (
              <p className="text-xs text-destructive" role="alert">
                {fieldErrors.confirmPassword}
              </p>
            )}
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
            <Button type="submit" disabled={isSubmitting || !hasInput}>
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Resetting...
                </>
              ) : (
                "Reset Password"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
