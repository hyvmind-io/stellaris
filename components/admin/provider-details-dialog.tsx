"use client";

import { Calendar, Cpu, Key, Plug } from "lucide-react";
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
import type { AdminProviderDetail } from "@/types/admin-registry";

// ============================================================================
// Props
// ============================================================================

interface ProviderDetailsDialogProps {
  detail: AdminProviderDetail | null;
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

export function ProviderDetailsDialog({
  detail,
  isLoading,
  open,
  onOpenChange,
}: ProviderDetailsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plug className="size-4" />
            Provider Details
          </DialogTitle>
          <DialogDescription>
            {detail ? `${detail.namespace}/${detail.type}` : "Loading..."}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4 py-4">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-4 w-40" />
          </div>
        ) : detail ? (
          <div className="space-y-4">
            {/* Identifier */}
            <div>
              <h4 className="text-sm font-medium text-muted-foreground">
                Identifier
              </h4>
              <p className="mt-1 font-mono text-sm">
                {detail.namespace}/{detail.type}
              </p>
            </div>

            {/* Protocols */}
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">
                Protocols
              </h4>
              <div className="flex items-center gap-1">
                {detail.protocols.map((protocol) => (
                  <Badge key={protocol} variant="secondary" className="text-xs">
                    {protocol}
                  </Badge>
                ))}
              </div>
            </div>

            <Separator />

            {/* Versions with platforms */}
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">
                Versions ({detail.versions.length})
              </h4>
              {detail.versions.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  No versions published
                </p>
              ) : (
                <div className="space-y-4">
                  {detail.versions.slice(0, 5).map((v) => (
                    <div key={v.version} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline">v{v.version}</Badge>
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="size-3" />
                          {formatDate(v.publishedAt)}
                        </span>
                      </div>

                      {/* Platforms */}
                      {v.platforms.length > 0 && (
                        <div className="ml-4 space-y-1">
                          {v.platforms.map((p) => (
                            <div
                              key={`${p.os}-${p.arch}`}
                              className="flex items-center gap-2 text-xs text-muted-foreground"
                            >
                              <Cpu className="size-3" />
                              <span className="font-mono">
                                {p.os}/{p.arch}
                              </span>
                              <span className="text-xs truncate max-w-[120px]">
                                {p.filename}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* GPG Keys */}
                      {v.gpgKeys.length > 0 && (
                        <div className="ml-4 space-y-1">
                          {v.gpgKeys.map((k) => (
                            <div
                              key={k.keyId}
                              className="flex items-center gap-2 text-xs text-muted-foreground"
                            >
                              <Key className="size-3" />
                              <span className="font-mono">{k.keyId}</span>
                              {k.source && (
                                <span className="text-xs">({k.source})</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
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
            <Plug className="size-8 text-muted-foreground/50" />
            <p className="mt-3 text-sm text-muted-foreground">
              Provider details not available.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
