"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Type } from "lucide-react";
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

// ============================================================================
// Validation
// ============================================================================

const nameFieldSchema = z
  .string()
  .min(1, "Required")
  .regex(
    /^[a-z0-9_-]+$/,
    "Must be lowercase alphanumeric, hyphens, or underscores",
  );

// ============================================================================
// Props
// ============================================================================

interface RenameField {
  label: string;
  value: string;
  id: string;
}

interface RenameDialogProps {
  /** Display title, e.g. "Rename Module" or "Rename Provider" */
  title: string;
  /** Current identifier for display, e.g. "hashicorp/consul/aws" */
  identifier: string;
  /** Editable fields (namespace, name, and optionally provider/type) */
  fields: RenameField[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with new values for each field. Wire to server action when backend is ready. */
  onConfirm: (values: Record<string, string>) => Promise<void>;
}

// ============================================================================
// Component
// ============================================================================

export function RenameDialog({
  title,
  identifier,
  fields,
  open,
  onOpenChange,
  onConfirm,
}: RenameDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [values, setValues] = useState<Record<string, string>>({});

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      const initial: Record<string, string> = {};
      for (const field of fields) {
        initial[field.id] = field.value;
      }
      setValues(initial);
      setError(null);
      setFieldErrors({});
    }
  }, [open, fields]);

  function handleOpenChange(newOpen: boolean) {
    if (!isSubmitting) {
      onOpenChange(newOpen);
    }
  }

  function updateValue(id: string, value: string) {
    setValues((prev) => ({ ...prev, [id]: value }));
    if (fieldErrors[id]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  }

  const hasChanges = fields.some((field) => values[field.id] !== field.value);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    // Validate each field
    const errors: Record<string, string> = {};
    for (const field of fields) {
      const result = nameFieldSchema.safeParse(values[field.id]);
      if (!result.success) {
        const firstIssue = result.error.issues[0];
        if (firstIssue) errors[field.id] = firstIssue.message;
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setIsSubmitting(true);

    try {
      await onConfirm(values);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rename failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Type className="size-4" />
            {title}
          </DialogTitle>
          <DialogDescription>
            Change the identifiers for{" "}
            <span className="font-medium text-foreground">{identifier}</span>.
            This will update all versions.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Warning */}
          <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <p className="text-muted-foreground">
              <span className="font-medium text-destructive">Warning:</span>{" "}
              Renaming creates an alias from the old address to the new
              canonical address. Existing configurations keep resolving through
              the alias.
            </p>
          </div>

          {fields.map((field) => (
            <div key={field.id} className="space-y-2">
              <Label htmlFor={`rename-${field.id}`}>{field.label}</Label>
              <Input
                id={`rename-${field.id}`}
                value={values[field.id] ?? ""}
                onChange={(e) => updateValue(field.id, e.target.value)}
                disabled={isSubmitting}
              />
              {fieldErrors[field.id] && (
                <p className="text-xs text-destructive" role="alert">
                  {fieldErrors[field.id]}
                </p>
              )}
            </div>
          ))}

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
                  Renaming...
                </>
              ) : (
                "Rename"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
