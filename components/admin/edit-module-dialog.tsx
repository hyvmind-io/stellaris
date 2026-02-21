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
import { Textarea } from "@/components/ui/textarea";
import type {
  AdminModuleSummary,
  EditModuleFormData,
} from "@/types/admin-registry";

// ============================================================================
// Validation
// ============================================================================

const editModuleSchema = z.object({
  version: z.string().min(1, "Version is required"),
  description: z.string().optional(),
  source: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  owner: z.string().optional(),
  tags: z.string().optional(),
});

type FormFields = z.infer<typeof editModuleSchema>;

// ============================================================================
// Props
// ============================================================================

interface EditModuleDialogProps {
  module: AdminModuleSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when the form is submitted. Wire to server action when backend is ready. */
  onConfirm: (
    namespace: string,
    name: string,
    provider: string,
    data: EditModuleFormData,
  ) => Promise<void>;
}

// ============================================================================
// Component
// ============================================================================

export function EditModuleDialog({
  module: mod,
  open,
  onOpenChange,
  onConfirm,
}: EditModuleDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof FormFields, string>>
  >({});

  const [formData, setFormData] = useState<FormFields>({
    version: "",
    description: "",
    source: "",
    owner: "",
    tags: "",
  });

  // Reset form when dialog opens with a module
  useEffect(() => {
    if (open && mod) {
      setFormData({
        version: mod.latestVersion,
        description: mod.description ?? "",
        source: "",
        owner: "",
        tags: "",
      });
      setError(null);
      setFieldErrors({});
    }
  }, [open, mod]);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!mod) return;

    setError(null);
    setFieldErrors({});

    const parsed = editModuleSchema.safeParse(formData);
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
      await onConfirm(mod.namespace, mod.name, mod.provider, {
        version: parsed.data.version,
        description: parsed.data.description ?? "",
        source: parsed.data.source ?? "",
        owner: parsed.data.owner ?? "",
        tags: parsed.data.tags ?? "",
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update module");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!mod) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="size-4" />
            Edit Module Metadata
          </DialogTitle>
          <DialogDescription>
            Update metadata for{" "}
            <span className="font-medium text-foreground">
              {mod.namespace}/{mod.name}/{mod.provider}
            </span>
            . This updates metadata for version v{mod.latestVersion}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-mod-version">Version</Label>
            <Input
              id="edit-mod-version"
              value={formData.version}
              disabled
              readOnly
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="edit-mod-description">Description</Label>
            <Textarea
              id="edit-mod-description"
              placeholder="Module description..."
              value={formData.description}
              onChange={(e) => updateField("description", e.target.value)}
              disabled={isSubmitting}
              rows={3}
            />
          </div>

          {/* Source URL */}
          <div className="space-y-2">
            <Label htmlFor="edit-mod-source">Source URL</Label>
            <Input
              id="edit-mod-source"
              type="url"
              placeholder="https://github.com/org/repo"
              value={formData.source}
              onChange={(e) => updateField("source", e.target.value)}
              disabled={isSubmitting}
            />
            {fieldErrors.source && (
              <p className="text-xs text-destructive" role="alert">
                {fieldErrors.source}
              </p>
            )}
          </div>

          {/* Owner */}
          <div className="space-y-2">
            <Label htmlFor="edit-mod-owner">Owner</Label>
            <Input
              id="edit-mod-owner"
              placeholder="team-name"
              value={formData.owner}
              onChange={(e) => updateField("owner", e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label htmlFor="edit-mod-tags">
              Tags{" "}
              <span className="text-xs text-muted-foreground">
                (comma-separated)
              </span>
            </Label>
            <Input
              id="edit-mod-tags"
              placeholder="aws, networking"
              value={formData.tags}
              onChange={(e) => updateField("tags", e.target.value)}
              disabled={isSubmitting}
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
            <Button type="submit" disabled={isSubmitting}>
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
