"use client";

import {
  ArrowDownToLine,
  Calendar,
  ExternalLink,
  Package,
  Tag,
  User,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import type { AdminModuleDetail } from "@/types/admin-registry";

// ============================================================================
// Props
// ============================================================================

interface ModuleDetailsDialogProps {
  detail: AdminModuleDetail | null;
  isLoading?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ============================================================================
// Helpers
// ============================================================================

function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// ============================================================================
// Component
// ============================================================================

export function ModuleDetailsDialog({
  detail,
  isLoading,
  open,
  onOpenChange,
}: ModuleDetailsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="size-4" />
            Module Details
          </DialogTitle>
          <DialogDescription>
            {detail
              ? `${detail.namespace}/${detail.name}/${detail.provider}`
              : "Loading..."}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4 py-4">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
        ) : detail ? (
          <div className="space-y-4">
            {/* Identifier */}
            <div>
              <h4 className="text-sm font-medium text-muted-foreground">
                Identifier
              </h4>
              <p className="mt-1 font-mono text-sm">
                {detail.namespace}/{detail.name}/{detail.provider}
              </p>
            </div>

            <Separator />

            {/* Description */}
            <div>
              <h4 className="text-sm font-medium text-muted-foreground">
                Description
              </h4>
              <p className="mt-1 text-sm">
                {detail.description || (
                  <span className="italic text-muted-foreground">
                    No description
                  </span>
                )}
              </p>
            </div>

            {/* Source */}
            {detail.source && (
              <div>
                <h4 className="text-sm font-medium text-muted-foreground">
                  Source
                </h4>
                <a
                  href={detail.source}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  {detail.source}
                  <ExternalLink className="size-3" />
                </a>
              </div>
            )}

            {/* Owner */}
            {detail.owner && (
              <div className="flex items-center gap-2">
                <User className="size-4 text-muted-foreground" />
                <span className="text-sm">{detail.owner}</span>
              </div>
            )}

            {/* Tags */}
            {detail.tags.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-2">
                  <Tag className="inline size-3 mr-1" />
                  Tags
                </h4>
                <div className="flex flex-wrap gap-1">
                  {detail.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            {/* Versions summary */}
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">
                Versions ({detail.versions.length})
              </h4>
              {detail.versions.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  No versions published
                </p>
              ) : (
                <div className="space-y-2">
                  {detail.versions.slice(0, 5).map((v) => (
                    <div
                      key={v.version}
                      className="flex items-center justify-between text-sm"
                    >
                      <Badge variant="outline">v{v.version}</Badge>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <ArrowDownToLine className="size-3" />
                          {new Intl.NumberFormat().format(v.downloads)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="size-3" />
                          {formatDate(v.publishedAt)}
                        </span>
                      </div>
                    </div>
                  ))}
                  {detail.versions.length > 5 && (
                    <p className="text-xs text-muted-foreground">
                      ...and {detail.versions.length - 5} more version
                      {detail.versions.length - 5 !== 1 ? "s" : ""}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Package className="size-8 text-muted-foreground/50" />
            <p className="mt-3 text-sm text-muted-foreground">
              Module details not available.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
