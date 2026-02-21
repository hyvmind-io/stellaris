"use client";

import {
  ArrowDownToLine,
  Eye,
  FileArchive,
  History,
  MoreHorizontal,
  Package,
  Pencil,
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
import type { AdminModuleSummary } from "@/types/admin-registry";

// ============================================================================
// Props
// ============================================================================

interface ModuleTableProps {
  modules: AdminModuleSummary[];
  isLoading?: boolean;
  onViewDetails: (mod: AdminModuleSummary) => void;
  onEditModule: (mod: AdminModuleSummary) => void;
  onRenameModule: (mod: AdminModuleSummary) => void;
  onReplaceArtifact: (mod: AdminModuleSummary) => void;
  onViewVersions: (mod: AdminModuleSummary) => void;
  onDeleteModule: (mod: AdminModuleSummary) => void;
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

function ModuleTableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-4 w-24" />
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

export function ModuleTable({
  modules,
  isLoading,
  onViewDetails,
  onEditModule,
  onRenameModule,
  onReplaceArtifact,
  onViewVersions,
  onDeleteModule,
}: ModuleTableProps) {
  if (isLoading) {
    return <ModuleTableSkeleton />;
  }

  if (modules.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Package className="size-12 text-muted-foreground/50" />
        <h3 className="mt-4 text-lg font-semibold">No modules found</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          No modules match the current filters. Try adjusting your search or
          publish a new module.
        </p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Module</TableHead>
          <TableHead>Provider</TableHead>
          <TableHead>Latest Version</TableHead>
          <TableHead className="text-right">Versions</TableHead>
          <TableHead className="text-right">Downloads</TableHead>
          <TableHead>Published</TableHead>
          <TableHead className="w-[50px]">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {modules.map((mod) => (
          <TableRow key={`${mod.namespace}/${mod.name}/${mod.provider}`}>
            <TableCell>
              <div className="flex flex-col">
                <span className="font-medium">
                  {mod.namespace}/{mod.name}
                </span>
                {mod.description && (
                  <span className="text-xs text-muted-foreground line-clamp-1">
                    {mod.description}
                  </span>
                )}
              </div>
            </TableCell>
            <TableCell>
              <Badge variant="secondary">{mod.provider}</Badge>
            </TableCell>
            <TableCell>
              <Badge variant="outline">v{mod.latestVersion}</Badge>
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {mod.versionCount}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <ArrowDownToLine className="size-3" />
                {new Intl.NumberFormat().format(mod.totalDownloads)}
              </span>
            </TableCell>
            <TableCell>
              <span className="text-sm text-muted-foreground">
                {formatRelativeTime(mod.publishedAt)}
              </span>
            </TableCell>
            <TableCell>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <MoreHorizontal className="size-4" />
                    <span className="sr-only">
                      Actions for {mod.namespace}/{mod.name}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onViewDetails(mod)}>
                    <Eye className="size-4" />
                    View Details
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onViewVersions(mod)}>
                    <History className="size-4" />
                    Version History
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onEditModule(mod)}>
                    <Pencil className="size-4" />
                    Edit Metadata
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onRenameModule(mod)}>
                    <Type className="size-4" />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onReplaceArtifact(mod)}>
                    <FileArchive className="size-4" />
                    Replace Artifact
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onDeleteModule(mod)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="size-4" />
                    Delete Module
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
