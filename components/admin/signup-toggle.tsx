"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, Shield, UserPlus } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getSignupStatusAction, toggleSignupAction } from "@/app/actions/admin";

export function SignupToggle() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [isToggling, setIsToggling] = useState(false);
  const [showDisableDialog, setShowDisableDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const status = await getSignupStatusAction();
      setEnabled(status);
    } catch {
      setError("Failed to load signup status");
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function performToggle(newValue: boolean) {
    setIsToggling(true);
    setError(null);
    setShowDisableDialog(false);

    try {
      const result = await toggleSignupAction(newValue);
      if (result.success) {
        setEnabled(result.enabled ?? newValue);
      } else {
        setError(result.error ?? "Failed to update setting");
      }
    } catch {
      setError("Failed to update setting");
    } finally {
      setIsToggling(false);
    }
  }

  function handleToggle(checked: boolean) {
    if (!checked) {
      // Show confirmation dialog when disabling
      setShowDisableDialog(true);
    } else {
      void performToggle(true);
    }
  }

  if (enabled === null) {
    return (
      <div className="flex items-center gap-3 py-2">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          Loading signup status...
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {enabled ? (
            <UserPlus className="size-5 text-green-500" />
          ) : (
            <Shield className="size-5 text-yellow-500" />
          )}
          <div className="space-y-0.5">
            <Label htmlFor="signup-toggle" className="text-sm font-medium">
              Public Registration
            </Label>
            <p className="text-xs text-muted-foreground">
              {enabled
                ? "New users can create accounts"
                : "Only admins can create accounts"}
            </p>
          </div>
        </div>
        <Switch
          id="signup-toggle"
          checked={enabled}
          onCheckedChange={handleToggle}
          disabled={isToggling}
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertTriangle className="size-4" />
          {error}
        </div>
      )}

      {/* Confirmation dialog for disabling signup */}
      <AlertDialog open={showDisableDialog} onOpenChange={setShowDisableDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable Public Registration?</AlertDialogTitle>
            <AlertDialogDescription>
              New users will not be able to create accounts. Only administrators
              will be able to add new users through the admin panel.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDisableDialog(false)}
              disabled={isToggling}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => performToggle(false)}
              disabled={isToggling}
            >
              {isToggling ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Disabling...
                </>
              ) : (
                "Disable Registration"
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
