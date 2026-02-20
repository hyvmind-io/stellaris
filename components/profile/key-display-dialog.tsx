"use client";

import { useState } from "react";
import { Copy, Check, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PermissionBadges } from "./permission-badges";

// ============================================================================
// Component Props
// ============================================================================

interface KeyDisplayDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  keyName: string;
  plainTextKey: string;
  permissions?: string[];
}

// ============================================================================
// Key Display Dialog Component
// ============================================================================

/**
 * KeyDisplayDialog Component
 *
 * Displays a newly created API key with copy functionality.
 * Shows a warning that the key will only be displayed once.
 */
export function KeyDisplayDialog({
  open,
  onOpenChange,
  keyName,
  plainTextKey,
  permissions,
}: KeyDisplayDialogProps) {
  const [copied, setCopied] = useState(false);

  // Truncate key for display
  const displayKey =
    plainTextKey.length > 20
      ? `${plainTextKey.slice(0, 16)}...${plainTextKey.slice(-8)}`
      : plainTextKey;

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(plainTextKey);
      setCopied(true);
      toast.success("Key copied", {
        description: "The API key has been copied to your clipboard.",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy", {
        description: "Please manually select and copy the key.",
      });
    }
  }

  function handleClose() {
    setCopied(false);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>API Key Created</DialogTitle>
          <DialogDescription>
            Your new API key &quot;{keyName}&quot; has been created
            successfully.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertTitle>Important</AlertTitle>
            <AlertDescription>
              This key will only be shown once. Make sure to copy it now and
              store it securely. You won&apos;t be able to see it again.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <label className="text-sm font-medium">Your API Key</label>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-md bg-muted px-3 py-2 font-mono text-sm break-all">
                {displayKey}
              </code>
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={copyToClipboard}
                aria-label="Copy key"
              >
                {copied ? (
                  <Check className="size-4 text-green-500" />
                ) : (
                  <Copy className="size-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Use this key in the Authorization header:{" "}
              <code className="text-xs">
                Authorization: Bearer {displayKey}
              </code>
            </p>
          </div>

          {permissions && permissions.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Permissions</label>
              <PermissionBadges permissions={permissions} />
            </div>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={copyToClipboard}
            className="gap-2"
          >
            {copied ? (
              <>
                <Check className="size-4" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="size-4" />
                Copy Key
              </>
            )}
          </Button>
          <Button type="button" onClick={handleClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
