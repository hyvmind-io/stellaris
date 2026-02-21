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
import type {
  AdminProviderSummary,
  EditProviderFormData,
} from "@/types/admin-registry";

// ============================================================================
// Validation
// ============================================================================

const editProviderSchema = z.object({
  version: z.string().min(1, "Version is required"),
  protocols: z
    .string()
    .min(1, "At least one protocol is required")
    .regex(
      /^[\d.]+(?:\s*,\s*[\d.]+)*$/,
      "Protocols must be comma-separated version numbers (e.g., 5.0, 6.0)",
    ),
});

type FormFields = z.infer<typeof editProviderSchema>;

// ============================================================================
// Props
// ============================================================================

interface EditProviderDialogProps {
  provider: AdminProviderSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when the form is submitted. Wire to server action when backend is ready. */
  onConfirm: (
    namespace: string,
    type: string,
    data: EditProviderFormData,
  ) => Promise<void>;
}

// ============================================================================
// Component
// ============================================================================

export function EditProviderDialog({
  provider: prov,
  open,
  onOpenChange,
  onConfirm,
}: EditProviderDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof FormFields, string>>
  >({});

  const [formData, setFormData] = useState<FormFields>({
    version: "",
    protocols: "",
  });

  useEffect(() => {
    if (open && prov) {
      setFormData({
        version: prov.latestVersion,
        protocols: prov.protocols.join(", "),
      });
      setError(null);
      setFieldErrors({});
    }
  }, [open, prov]);

  function handleOpenChange(newOpen: boolean) {
    if (!isSubmitting) {
      onOpenChange(newOpen);
    }
  }

  function updateField<K extends keyof FormFields>(
    field: K,
    value: FormFields[K],
  ) {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  }

  const hasChanges =
    prov !== null && formData.protocols !== prov.protocols.join(", ");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prov) return;

    setError(null);
    setFieldErrors({});

    const parsed = editProviderSchema.safeParse(formData);
    if (!parsed.success) {
      const errors: Partial<Record<keyof FormFields, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof FormFields;
        if (!errors[field]) errors[field] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }

    setIsSubmitting(true);

    try {
      await onConfirm(prov.namespace, prov.type, {
        version: parsed.data.version,
        protocols: parsed.data.protocols,
      });
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update provider",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!prov) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="size-4" />
            Edit Provider Metadata
          </DialogTitle>
          <DialogDescription>
            Update metadata for{" "}
            <span className="font-medium text-foreground">
              {prov.namespace}/{prov.type}
            </span>
            . This updates metadata for version v{prov.latestVersion}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-prov-version">Version</Label>
            <Input
              id="edit-prov-version"
              value={formData.version}
              disabled
              readOnly
            />
          </div>

          {/* Protocols */}
          <div className="space-y-2">
            <Label htmlFor="edit-prov-protocols">
              Protocols{" "}
              <span className="text-xs text-muted-foreground">
                (comma-separated)
              </span>
            </Label>
            <Input
              id="edit-prov-protocols"
              placeholder="5.0, 6.0"
              value={formData.protocols}
              onChange={(e) => updateField("protocols", e.target.value)}
              disabled={isSubmitting}
            />
            {fieldErrors.protocols && (
              <p className="text-xs text-destructive" role="alert">
                {fieldErrors.protocols}
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
