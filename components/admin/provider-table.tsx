"use client";

import {
  Cpu,
  Eye,
  FileArchive,
  History,
  MoreHorizontal,
  Pencil,
  Plug,
  Trash2,
  Type,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { AdminProviderSummary } from "@/types/admin-registry";

// ============================================================================
// Props
// ============================================================================

interface ProviderTableProps {
  providers: AdminProviderSummary[];
  isLoading?: boolean;
  onViewDetails: (prov: AdminProviderSummary) => void;
  onEditProvider: (prov: AdminProviderSummary) => void;
  onRenameProvider: (prov: AdminProviderSummary) => void;
  onReplaceArtifact: (prov: AdminProviderSummary) => void;
  onViewVersions: (prov: AdminProviderSummary) => void;
  onDeleteProvider: (prov: AdminProviderSummary) => void;
}

// ============================================================================
// Helpers
// ============================================================================

function formatRelativeTime(date: Date | string | null): string {
  if (!date) return "Never";
  const d = typeof date === "string" ? new Date(date) : date;
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: diffDays > 365 ? "numeric" : undefined,
  });
}

// ============================================================================
// Skeleton
// ============================================================================

function ProviderTableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-8 w-8 rounded-md" />
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Component
// ============================================================================

export function ProviderTable({
  providers,
  isLoading,
  onViewDetails,
  onEditProvider,
  onRenameProvider,
  onReplaceArtifact,
  onViewVersions,
  onDeleteProvider,
}: ProviderTableProps) {
  if (isLoading) {
    return <ProviderTableSkeleton />;
  }

  if (providers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Plug className="size-12 text-muted-foreground/50" />
        <h3 className="mt-4 text-lg font-semibold">No providers found</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          No providers match the current filters. Try adjusting your search or
          publish a new provider.
        </p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Provider</TableHead>
          <TableHead>Protocols</TableHead>
          <TableHead>Latest Version</TableHead>
          <TableHead className="text-right">Versions</TableHead>
          <TableHead className="text-right">Platforms</TableHead>
          <TableHead>Published</TableHead>
          <TableHead className="w-[50px]">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {providers.map((prov) => (
          <TableRow key={`${prov.namespace}/${prov.type}`}>
            <TableCell>
              <div className="flex flex-col">
                <span className="font-medium">
                  {prov.namespace}/{prov.type}
                </span>
              </div>
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-1">
                {prov.protocols.map((protocol) => (
                  <Badge key={protocol} variant="secondary" className="text-xs">
                    {protocol}
                  </Badge>
                ))}
              </div>
            </TableCell>
            <TableCell>
              <Badge variant="outline">v{prov.latestVersion}</Badge>
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {prov.versionCount}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <Cpu className="size-3" />
                {prov.totalPlatforms}
              </span>
            </TableCell>
            <TableCell>
              <span className="text-sm text-muted-foreground">
                {formatRelativeTime(prov.publishedAt)}
              </span>
            </TableCell>
            <TableCell>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <MoreHorizontal className="size-4" />
                    <span className="sr-only">
                      Actions for {prov.namespace}/{prov.type}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onViewDetails(prov)}>
                    <Eye className="size-4" />
                    View Details
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onViewVersions(prov)}>
                    <History className="size-4" />
                    Version History
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onEditProvider(prov)}>
                    <Pencil className="size-4" />
                    Edit Metadata
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onRenameProvider(prov)}>
                    <Type className="size-4" />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onReplaceArtifact(prov)}>
                    <FileArchive className="size-4" />
                    Replace Artifact
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onDeleteProvider(prov)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="size-4" />
                    Delete Provider
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
