"use client";

import { useRef, useState } from "react";
import { AlertTriangle, Loader2, Package, Upload } from "lucide-react";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type {
  AdminActionResult,
  CreateModuleFormData,
} from "@/types/admin-registry";

// ============================================================================
// Validation
// ============================================================================

const createModuleSchema = z.object({
  namespace: z
    .string()
    .min(1, "Namespace is required")
    .regex(
      /^[a-z0-9_-]+$/,
      "Namespace must be lowercase alphanumeric, hyphens, or underscores",
    ),
  name: z
    .string()
    .min(1, "Name is required")
    .regex(
      /^[a-z0-9_-]+$/,
      "Name must be lowercase alphanumeric, hyphens, or underscores",
    ),
  provider: z
    .string()
    .min(1, "Provider is required")
    .regex(
      /^[a-z0-9_-]+$/,
      "Provider must be lowercase alphanumeric, hyphens, or underscores",
    ),
  version: z
    .string()
    .min(1, "Version is required")
    .regex(
      /^\d+\.\d+\.\d+$/,
      "Version must follow semver format (e.g., 1.0.0)",
    ),
  description: z.string().optional(),
  source: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  owner: z.string().optional(),
  tags: z.string().optional(),
});

type FormFields = z.infer<typeof createModuleSchema>;

// ============================================================================
// Props
// ============================================================================

interface CreateModuleDialogProps {
  /** Called when the form is submitted. Wire to server action when backend is ready. */
  onSubmit?: (data: CreateModuleFormData) => Promise<AdminActionResult>;
  /** Called after successful creation to refresh the module list. */
  onCreated?: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function CreateModuleDialog({
  onSubmit,
  onCreated,
}: CreateModuleDialogProps) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof FormFields, string>>
  >({});
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState<FormFields>({
    namespace: "",
    name: "",
    provider: "",
    version: "",
    description: "",
    source: "",
    owner: "",
    tags: "",
  });

  function resetForm() {
    setFormData({
      namespace: "",
      name: "",
      provider: "",
      version: "",
      description: "",
      source: "",
      owner: "",
      tags: "",
    });
    setSelectedFile(null);
    setError(null);
    setFieldErrors({});
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleOpenChange(newOpen: boolean) {
    if (newOpen) resetForm();
    setOpen(newOpen);
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
    setError(null);
    setFieldErrors({});

    const parsed = createModuleSchema.safeParse(formData);
    if (!parsed.success) {
      const errors: Partial<Record<keyof FormFields, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof FormFields;
        if (!errors[field]) errors[field] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }

    if (!selectedFile) {
      setError("Please select a module archive (.tar.gz) to upload");
      return;
    }

    setIsSubmitting(true);

    try {
      if (onSubmit) {
        const result = await onSubmit({
          ...parsed.data,
          description: parsed.data.description ?? "",
          source: parsed.data.source ?? "",
          owner: parsed.data.owner ?? "",
          tags: parsed.data.tags ?? "",
          artifact: selectedFile,
        });
        if (!result.success) {
          setError(result.error ?? "Failed to create module");
          return;
        }
      }
      setOpen(false);
      onCreated?.();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Package className="size-4" />
          Publish Module
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Publish New Module</DialogTitle>
          <DialogDescription>
            Upload a Terraform module archive and configure its metadata.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Namespace / Name / Provider row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="mod-namespace">
                Namespace <span className="text-destructive">*</span>
              </Label>
              <Input
                id="mod-namespace"
                placeholder="hashicorp"
                value={formData.namespace}
                onChange={(e) => updateField("namespace", e.target.value)}
                disabled={isSubmitting}
              />
              {fieldErrors.namespace && (
                <p className="text-xs text-destructive" role="alert">
                  {fieldErrors.namespace}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="mod-name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="mod-name"
                placeholder="consul"
                value={formData.name}
                onChange={(e) => updateField("name", e.target.value)}
                disabled={isSubmitting}
              />
              {fieldErrors.name && (
                <p className="text-xs text-destructive" role="alert">
                  {fieldErrors.name}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="mod-provider">
                Provider <span className="text-destructive">*</span>
              </Label>
              <Input
                id="mod-provider"
                placeholder="aws"
                value={formData.provider}
                onChange={(e) => updateField("provider", e.target.value)}
                disabled={isSubmitting}
              />
              {fieldErrors.provider && (
                <p className="text-xs text-destructive" role="alert">
                  {fieldErrors.provider}
                </p>
              )}
            </div>
          </div>

          {/* Version */}
          <div className="space-y-2">
            <Label htmlFor="mod-version">
              Version <span className="text-destructive">*</span>
            </Label>
            <Input
              id="mod-version"
              placeholder="1.0.0"
              value={formData.version}
              onChange={(e) => updateField("version", e.target.value)}
              disabled={isSubmitting}
            />
            {fieldErrors.version && (
              <p className="text-xs text-destructive" role="alert">
                {fieldErrors.version}
              </p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="mod-description">Description</Label>
            <Textarea
              id="mod-description"
              placeholder="A brief description of this module..."
              value={formData.description}
              onChange={(e) => updateField("description", e.target.value)}
              disabled={isSubmitting}
              rows={3}
            />
          </div>

          {/* Source URL */}
          <div className="space-y-2">
            <Label htmlFor="mod-source">Source URL</Label>
            <Input
              id="mod-source"
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

          {/* Owner / Tags row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="mod-owner">Owner</Label>
              <Input
                id="mod-owner"
                placeholder="team-name"
                value={formData.owner}
                onChange={(e) => updateField("owner", e.target.value)}
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mod-tags">
                Tags{" "}
                <span className="text-xs text-muted-foreground">
                  (comma-separated)
                </span>
              </Label>
              <Input
                id="mod-tags"
                placeholder="aws, networking"
                value={formData.tags}
                onChange={(e) => updateField("tags", e.target.value)}
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* File Upload */}
          <div className="space-y-2">
            <Label htmlFor="mod-artifact">
              Module Archive <span className="text-destructive">*</span>
            </Label>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={isSubmitting}
                className="gap-2"
              >
                <Upload className="size-4" />
                {selectedFile ? "Change File" : "Choose File"}
              </Button>
              <span className="text-sm text-muted-foreground truncate">
                {selectedFile
                  ? selectedFile.name
                  : "No file selected (.tar.gz)"}
              </span>
            </div>
            <input
              ref={fileInputRef}
              id="mod-artifact"
              type="file"
              accept=".tar.gz,.tgz"
              className="hidden"
              onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
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
              onClick={() => setOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Publishing...
                </>
              ) : (
                "Publish Module"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
