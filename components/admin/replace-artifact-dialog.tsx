"use client";

import { useRef, useState } from "react";
import { AlertTriangle, FileArchive, Loader2, Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ============================================================================
// Props
// ============================================================================

interface ReplaceArtifactDialogProps {
  /** Display identifier, e.g. "hashicorp/consul/aws" or "hashicorp/aws" */
  identifier: string;
  /** Type of registry entity */
  entityType: "module" | "provider";
  /** Available versions to select from */
  versions: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when replacement is confirmed. Wire to server action when backend is ready. */
  onConfirm: (version: string, artifact: File) => Promise<void>;
}

// ============================================================================
// Component
// ============================================================================

export function ReplaceArtifactDialog({
  identifier,
  entityType,
  versions,
  open,
  onOpenChange,
  onConfirm,
}: ReplaceArtifactDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<string>("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const acceptType = entityType === "module" ? ".tar.gz,.tgz" : ".zip";
  const fileLabel =
    entityType === "module"
      ? "Module Archive (.tar.gz)"
      : "Provider Archive (.zip)";

  function handleOpenChange(newOpen: boolean) {
    if (!isSubmitting) {
      if (newOpen) {
        setSelectedVersion(versions[0] ?? "");
        setSelectedFile(null);
        setError(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
      onOpenChange(newOpen);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!selectedVersion) {
      setError("Please select a version");
      return;
    }

    if (!selectedFile) {
      setError(`Please select a ${entityType} archive to upload`);
      return;
    }

    setIsSubmitting(true);

    try {
      await onConfirm(selectedVersion, selectedFile);
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to replace artifact",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileArchive className="size-4" />
            Replace Artifact
          </DialogTitle>
          <DialogDescription>
            Replace the stored archive for{" "}
            <span className="font-medium text-foreground">{identifier}</span>.
            This overwrites the existing artifact in storage.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Warning */}
          <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <p className="text-muted-foreground">
              <span className="font-medium text-destructive">Warning:</span>{" "}
              Replacing an artifact changes the stored archive for existing
              consumers. Terraform will detect checksum mismatches on plans that
              previously downloaded this version.
            </p>
          </div>

          {/* Version selector */}
          <div className="space-y-2">
            <Label htmlFor="replace-version">Version</Label>
            {versions.length > 0 ? (
              <Select
                value={selectedVersion}
                onValueChange={setSelectedVersion}
              >
                <SelectTrigger id="replace-version">
                  <SelectValue placeholder="Select version" />
                </SelectTrigger>
                <SelectContent>
                  {versions.map((v) => (
                    <SelectItem key={v} value={v}>
                      v{v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-muted-foreground">
                No versions available.
              </p>
            )}
          </div>

          {/* File Upload */}
          <div className="space-y-2">
            <Label htmlFor="replace-artifact">{fileLabel}</Label>
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
                {selectedFile ? selectedFile.name : "No file selected"}
              </span>
            </div>
            <input
              ref={fileInputRef}
              id="replace-artifact"
              type="file"
              accept={acceptType}
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
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={isSubmitting || versions.length === 0}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Replacing...
                </>
              ) : (
                "Replace Artifact"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
