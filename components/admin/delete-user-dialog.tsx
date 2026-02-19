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
import type { AuthUserWithCounts } from "@/types/auth";

interface DeleteUserDialogProps {
  user: AuthUserWithCounts | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (userId: number) => Promise<void>;
}

export function DeleteUserDialog({
  user,
  open,
  onOpenChange,
  onConfirm,
}: DeleteUserDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!user) return;

    setIsDeleting(true);
    setError(null);

    try {
      await onConfirm(user.id);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete user");
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

  if (!user) return null;

  const hasResources = user.apiKeyCount > 0 || user.sessionCount > 0;

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete User</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to permanently delete the user{" "}
            <span className="font-medium text-foreground">{user.username}</span>{" "}
            ({user.email})?
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 py-2">
          {hasResources && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <div className="text-muted-foreground">
                <p className="font-medium text-destructive">
                  This action will also delete:
                </p>
                <ul className="mt-1 list-inside list-disc space-y-0.5">
                  {user.apiKeyCount > 0 && (
                    <li>{user.apiKeyCount} API key(s)</li>
                  )}
                  {user.sessionCount > 0 && (
                    <li>{user.sessionCount} active session(s)</li>
                  )}
                </ul>
              </div>
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            This action cannot be undone.
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
              "Delete User"
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
