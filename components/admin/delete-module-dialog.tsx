"use client";

import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { AdminModuleSummary } from "@/types/admin-registry";

// ============================================================================
// Props
// ============================================================================

interface DeleteModuleDialogProps {
  module: AdminModuleSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when deletion is confirmed. Wire to server action when backend is ready. */
  onConfirm: (
    namespace: string,
    name: string,
    provider: string,
  ) => Promise<void>;
}

// ============================================================================
// Component
// ============================================================================

export function DeleteModuleDialog({
  module: mod,
  open,
  onOpenChange,
  onConfirm,
}: DeleteModuleDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!mod) return;

    setIsDeleting(true);
    setError(null);

    try {
      await onConfirm(mod.namespace, mod.name, mod.provider);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete module");
    } finally {
      setIsDeleting(false);
    }
  }

  function handleOpenChange(newOpen: boolean) {
    if (!isDeleting) {
      setError(null);
      onOpenChange(newOpen);
    }
  }

  if (!mod) return null;

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Module</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to permanently delete the module{" "}
            <span className="font-medium text-foreground">
              {mod.namespace}/{mod.name}/{mod.provider}
            </span>
            ?
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 py-2">
          <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div className="text-muted-foreground">
              <p className="font-medium text-destructive">
                This action will permanently delete:
              </p>
              <ul className="mt-1 list-inside list-disc space-y-0.5">
                <li>
                  {mod.versionCount} version{mod.versionCount !== 1 ? "s" : ""}
                </li>
                <li>All associated artifacts from storage</li>
                <li>
                  Download history (
                  {new Intl.NumberFormat().format(mod.totalDownloads)} total)
                </li>
              </ul>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            This action cannot be undone. Any Terraform configurations
            referencing this module will fail.
          </p>

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertTriangle className="size-4" />
              {error}
            </div>
          )}
        </div>

        <AlertDialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Deleting...
              </>
            ) : (
              "Delete Module"
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
