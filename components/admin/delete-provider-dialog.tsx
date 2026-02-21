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
import type { AdminProviderSummary } from "@/types/admin-registry";

// ============================================================================
// Props
// ============================================================================

interface DeleteProviderDialogProps {
  provider: AdminProviderSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when deletion is confirmed. Wire to server action when backend is ready. */
  onConfirm: (namespace: string, type: string) => Promise<void>;
}

// ============================================================================
// Component
// ============================================================================

export function DeleteProviderDialog({
  provider: prov,
  open,
  onOpenChange,
  onConfirm,
}: DeleteProviderDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!prov) return;

    setIsDeleting(true);
    setError(null);

    try {
      await onConfirm(prov.namespace, prov.type);
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete provider",
      );
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

  if (!prov) return null;

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Provider</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to permanently delete the provider{" "}
            <span className="font-medium text-foreground">
              {prov.namespace}/{prov.type}
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
                  {prov.versionCount} version
                  {prov.versionCount !== 1 ? "s" : ""}
                </li>
                <li>
                  {prov.totalPlatforms} platform binary
                  {prov.totalPlatforms !== 1 ? " archives" : " archive"}
                </li>
                <li>All associated GPG keys and SHA256SUMS</li>
              </ul>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            This action cannot be undone. Any Terraform configurations
            referencing this provider will fail.
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
              "Delete Provider"
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
