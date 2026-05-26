"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, Lock, Unlock } from "lucide-react";
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
import {
  getImmutableUploadsStatusAction,
  toggleImmutableUploadsAction,
} from "@/app/actions/admin";

export function ImmutableUploadsToggle() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [isToggling, setIsToggling] = useState(false);
  const [showDisableDialog, setShowDisableDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const status = await getImmutableUploadsStatusAction();
      setEnabled(status);
    } catch {
      setError("Failed to load immutable uploads status");
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
      const result = await toggleImmutableUploadsAction(newValue);
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
      // Show confirmation dialog when disabling (allowing overwrites)
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
          Loading immutable uploads status...
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {enabled ? (
            <Lock className="size-5 text-green-500" />
          ) : (
            <Unlock className="size-5 text-yellow-500" />
          )}
          <div className="space-y-0.5">
            <Label htmlFor="immutable-uploads-toggle" className="text-sm font-medium">
              Immutable Uploads
            </Label>
            <p className="text-xs text-muted-foreground">
              {enabled
                ? "Published artifact bytes cannot be overwritten — re-uploading existing bytes returns 409. Initial publish to an empty slot is always allowed."
                : "Re-uploading overwrites existing artifact bytes and metadata in place."}
            </p>
          </div>
        </div>
        <Switch
          id="immutable-uploads-toggle"
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

      {/* Confirmation dialog for disabling immutability (enabling overwrites) */}
      <AlertDialog open={showDisableDialog} onOpenChange={setShowDisableDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Allow overwriting published bytes?</AlertDialogTitle>
            <AlertDialogDescription>
              Disabling immutable uploads lets publishers overwrite the bytes and
              metadata of already-published provider platforms and module
              versions in place. Consumers that pinned a checksum may see a
              mismatch after an overwrite. Only disable this if you intentionally
              need to re-push existing artifacts.
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
                "Allow Overwrites"
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
