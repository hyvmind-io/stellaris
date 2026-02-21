"use client";

import { ArrowDownToLine, Calendar, Cpu, History, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

// ============================================================================
// Types
// ============================================================================

interface VersionEntry {
  version: string;
  revision: number;
  publishedAt: Date | string;
  /** Module-specific: download count per version */
  downloads?: number;
  /** Provider-specific: platform count per version */
  platformCount?: number;
  /** Provider-specific: protocols */
  protocols?: string[];
}

// ============================================================================
// Props
// ============================================================================

interface VersionHistoryDialogProps {
  /** Display identifier, e.g. "hashicorp/consul/aws" or "hashicorp/aws" */
  identifier: string;
  entityType: "module" | "provider";
  versions: VersionEntry[];
  isLoading?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when a specific version should be deleted. Wire to server action. */
  onDeleteVersion?: (version: string, revision: number) => void;
}

// ============================================================================
// Helpers
// ============================================================================

function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ============================================================================
// Component
// ============================================================================

export function VersionHistoryDialog({
  identifier,
  entityType,
  versions,
  isLoading,
  open,
  onOpenChange,
  onDeleteVersion,
}: VersionHistoryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="size-4" />
            Version History
          </DialogTitle>
          <DialogDescription>
            All published versions of{" "}
            <span className="font-medium text-foreground">{identifier}</span>.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4 py-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-6 w-16 rounded-full" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-16 ml-auto" />
              </div>
            ))}
          </div>
        ) : versions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <History className="size-8 text-muted-foreground/50" />
            <p className="mt-3 text-sm text-muted-foreground">
              No versions found.
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-[400px] pr-4">
            <div className="space-y-1">
              {versions.map((entry, index) => (
                <div key={entry.version}>
                  <div className="flex items-center gap-3 py-3">
                    {/* Version badge */}
                    <Badge
                      variant={index === 0 ? "default" : "outline"}
                      className="shrink-0"
                    >
                      v{entry.version}
                    </Badge>

                    {/* Meta info */}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-1">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="size-3" />
                        {formatDate(entry.publishedAt)}
                      </span>

                      {entityType === "module" &&
                        entry.downloads !== undefined && (
                          <span className="inline-flex items-center gap-1">
                            <ArrowDownToLine className="size-3" />
                            {new Intl.NumberFormat().format(entry.downloads)}
                          </span>
                        )}

                      {entityType === "provider" &&
                        entry.platformCount !== undefined && (
                          <span className="inline-flex items-center gap-1">
                            <Cpu className="size-3" />
                            {entry.platformCount} platform
                            {entry.platformCount !== 1 ? "s" : ""}
                          </span>
                        )}

                      {entry.protocols && entry.protocols.length > 0 && (
                        <span className="text-xs">
                          ({entry.protocols.join(", ")})
                        </span>
                      )}
                    </div>

                    {/* Delete version action */}
                    {onDeleteVersion && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() =>
                          onDeleteVersion(entry.version, entry.revision)
                        }
                      >
                        <Trash2 className="size-3.5" />
                        <span className="sr-only">
                          Delete version {entry.version}
                        </span>
                      </Button>
                    )}
                  </div>
                  {index < versions.length - 1 && <Separator />}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
