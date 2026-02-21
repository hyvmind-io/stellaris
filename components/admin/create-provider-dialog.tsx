"use client";

import { useRef, useState } from "react";
import { AlertTriangle, Loader2, Plug, Upload } from "lucide-react";
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
  CreateProviderFormData,
} from "@/types/admin-registry";

// ============================================================================
// Validation
// ============================================================================

const createProviderSchema = z.object({
  namespace: z
    .string()
    .min(1, "Namespace is required")
    .regex(
      /^[a-z0-9_-]+$/,
      "Namespace must be lowercase alphanumeric, hyphens, or underscores",
    ),
  type: z
    .string()
    .min(1, "Type is required")
    .regex(
      /^[a-z0-9_-]+$/,
      "Type must be lowercase alphanumeric, hyphens, or underscores",
    ),
  version: z
    .string()
    .min(1, "Version is required")
    .regex(
      /^\d+\.\d+\.\d+$/,
      "Version must follow semver format (e.g., 1.0.0)",
    ),
  os: z
    .string()
    .min(1, "OS is required")
    .regex(/^[a-z0-9_]+$/, "OS must be lowercase alphanumeric or underscore"),
  arch: z
    .string()
    .min(1, "Architecture is required")
    .regex(
      /^[a-z0-9_]+$/,
      "Architecture must be lowercase alphanumeric or underscore",
    ),
  protocols: z
    .string()
    .min(1, "At least one protocol is required")
    .regex(
      /^[\d.]+(?:\s*,\s*[\d.]+)*$/,
      "Protocols must be comma-separated version numbers (e.g., 5.0, 6.0)",
    ),
  gpgKeyId: z.string().min(1, "GPG key ID is required"),
  gpgAsciiArmor: z.string().min(1, "GPG ASCII armor is required"),
  gpgSource: z.string().optional(),
  gpgSourceUrl: z
    .string()
    .url("Must be a valid URL")
    .optional()
    .or(z.literal("")),
});

type FormFields = z.infer<typeof createProviderSchema>;

// ============================================================================
// Props
// ============================================================================

interface CreateProviderDialogProps {
  /** Called when the form is submitted. Wire to server action when backend is ready. */
  onSubmit?: (data: CreateProviderFormData) => Promise<AdminActionResult>;
  /** Called after successful creation to refresh the provider list. */
  onCreated?: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function CreateProviderDialog({
  onSubmit,
  onCreated,
}: CreateProviderDialogProps) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof FormFields, string>>
  >({});
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [shasumFile, setShasumFile] = useState<File | null>(null);
  const [shasumSigFile, setShasumSigFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const shasumInputRef = useRef<HTMLInputElement>(null);
  const shasumSigInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState<FormFields>({
    namespace: "",
    type: "",
    version: "",
    os: "linux",
    arch: "amd64",
    protocols: "5.0",
    gpgKeyId: "",
    gpgAsciiArmor: "",
    gpgSource: "",
    gpgSourceUrl: "",
  });

  function resetForm() {
    setFormData({
      namespace: "",
      type: "",
      version: "",
      os: "linux",
      arch: "amd64",
      protocols: "5.0",
      gpgKeyId: "",
      gpgAsciiArmor: "",
      gpgSource: "",
      gpgSourceUrl: "",
    });
    setSelectedFile(null);
    setShasumFile(null);
    setShasumSigFile(null);
    setError(null);
    setFieldErrors({});
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (shasumInputRef.current) shasumInputRef.current.value = "";
    if (shasumSigInputRef.current) shasumSigInputRef.current.value = "";
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

    const parsed = createProviderSchema.safeParse(formData);
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
      setError("Please select a provider archive (.zip) to upload");
      return;
    }

    setIsSubmitting(true);

    try {
      if (onSubmit) {
        const result = await onSubmit({
          ...parsed.data,
          gpgSource: parsed.data.gpgSource ?? "",
          gpgSourceUrl: parsed.data.gpgSourceUrl ?? "",
          artifact: selectedFile,
          shasumFile,
          shasumSigFile,
        });
        if (!result.success) {
          setError(result.error ?? "Failed to create provider");
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
          <Plug className="size-4" />
          Publish Provider
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Publish New Provider</DialogTitle>
          <DialogDescription>
            Upload a Terraform provider archive and configure its metadata.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Namespace / Type row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="prov-namespace">
                Namespace <span className="text-destructive">*</span>
              </Label>
              <Input
                id="prov-namespace"
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
              <Label htmlFor="prov-type">
                Type <span className="text-destructive">*</span>
              </Label>
              <Input
                id="prov-type"
                placeholder="aws"
                value={formData.type}
                onChange={(e) => updateField("type", e.target.value)}
                disabled={isSubmitting}
              />
              {fieldErrors.type && (
                <p className="text-xs text-destructive" role="alert">
                  {fieldErrors.type}
                </p>
              )}
            </div>
          </div>

          {/* Version */}
          <div className="space-y-2">
            <Label htmlFor="prov-version">
              Version <span className="text-destructive">*</span>
            </Label>
            <Input
              id="prov-version"
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="prov-os">
                OS <span className="text-destructive">*</span>
              </Label>
              <Input
                id="prov-os"
                placeholder="linux"
                value={formData.os}
                onChange={(e) => updateField("os", e.target.value)}
                disabled={isSubmitting}
              />
              {fieldErrors.os && (
                <p className="text-xs text-destructive" role="alert">
                  {fieldErrors.os}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="prov-arch">
                Architecture <span className="text-destructive">*</span>
              </Label>
              <Input
                id="prov-arch"
                placeholder="amd64"
                value={formData.arch}
                onChange={(e) => updateField("arch", e.target.value)}
                disabled={isSubmitting}
              />
              {fieldErrors.arch && (
                <p className="text-xs text-destructive" role="alert">
                  {fieldErrors.arch}
                </p>
              )}
            </div>
          </div>

          {/* Protocols */}
          <div className="space-y-2">
            <Label htmlFor="prov-protocols">
              Protocols <span className="text-destructive">*</span>
              <span className="text-xs text-muted-foreground ml-1">
                (comma-separated)
              </span>
            </Label>
            <Input
              id="prov-protocols"
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

          {/* Provider Archive */}
          <div className="space-y-2">
            <Label htmlFor="prov-artifact">
              Provider Archive <span className="text-destructive">*</span>
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
                {selectedFile ? selectedFile.name : "No file selected (.zip)"}
              </span>
            </div>
            <input
              ref={fileInputRef}
              id="prov-artifact"
              type="file"
              accept=".zip"
              className="hidden"
              onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
              disabled={isSubmitting}
            />
          </div>

          {/* SHA256SUMS File (optional) */}
          <div className="space-y-2">
            <Label htmlFor="prov-shasum">SHA256SUMS File</Label>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => shasumInputRef.current?.click()}
                disabled={isSubmitting}
                className="gap-2"
              >
                <Upload className="size-3" />
                {shasumFile ? "Change" : "Choose"}
              </Button>
              <span className="text-xs text-muted-foreground truncate">
                {shasumFile ? shasumFile.name : "Optional"}
              </span>
            </div>
            <input
              ref={shasumInputRef}
              id="prov-shasum"
              type="file"
              className="hidden"
              onChange={(e) => setShasumFile(e.target.files?.[0] ?? null)}
              disabled={isSubmitting}
            />
          </div>

          {/* SHA256SUMS.sig File (optional) */}
          <div className="space-y-2">
            <Label htmlFor="prov-shasum-sig">SHA256SUMS Signature</Label>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => shasumSigInputRef.current?.click()}
                disabled={isSubmitting}
                className="gap-2"
              >
                <Upload className="size-3" />
                {shasumSigFile ? "Change" : "Choose"}
              </Button>
              <span className="text-xs text-muted-foreground truncate">
                {shasumSigFile ? shasumSigFile.name : "Optional"}
              </span>
            </div>
            <input
              ref={shasumSigInputRef}
              id="prov-shasum-sig"
              type="file"
              className="hidden"
              onChange={(e) => setShasumSigFile(e.target.files?.[0] ?? null)}
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="prov-gpg-key-id">
              GPG Key ID <span className="text-destructive">*</span>
            </Label>
            <Input
              id="prov-gpg-key-id"
              placeholder="ABCD1234EFGH5678"
              value={formData.gpgKeyId}
              onChange={(e) => updateField("gpgKeyId", e.target.value)}
              disabled={isSubmitting}
            />
            {fieldErrors.gpgKeyId && (
              <p className="text-xs text-destructive" role="alert">
                {fieldErrors.gpgKeyId}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="prov-gpg-source">GPG Source</Label>
            <Input
              id="prov-gpg-source"
              placeholder="internal-security"
              value={formData.gpgSource}
              onChange={(e) => updateField("gpgSource", e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="prov-gpg-source-url">GPG Source URL</Label>
            <Input
              id="prov-gpg-source-url"
              placeholder="https://keys.example.com"
              value={formData.gpgSourceUrl}
              onChange={(e) => updateField("gpgSourceUrl", e.target.value)}
              disabled={isSubmitting}
            />
            {fieldErrors.gpgSourceUrl && (
              <p className="text-xs text-destructive" role="alert">
                {fieldErrors.gpgSourceUrl}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="prov-gpg-ascii-armor">
              GPG ASCII Armor <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="prov-gpg-ascii-armor"
              placeholder="-----BEGIN PGP PUBLIC KEY BLOCK-----"
              value={formData.gpgAsciiArmor}
              onChange={(e) => updateField("gpgAsciiArmor", e.target.value)}
              disabled={isSubmitting}
              rows={5}
            />
            {fieldErrors.gpgAsciiArmor && (
              <p className="text-xs text-destructive" role="alert">
                {fieldErrors.gpgAsciiArmor}
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
                "Publish Provider"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
