"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Package, Search, X } from "lucide-react";
import {
  createModuleAction,
  deleteModuleAction,
  deleteModuleVersionAction,
  editModuleMetadataAction,
  getModuleDetailAction,
  listAdminModulesAction,
  renameModuleAction,
  replaceModuleArtifactAction,
} from "@/app/actions/admin-modules";
import { ModuleTable } from "@/components/admin/module-table";
import { CreateModuleDialog } from "@/components/admin/create-module-dialog";
import { DeleteModuleDialog } from "@/components/admin/delete-module-dialog";
import { EditModuleDialog } from "@/components/admin/edit-module-dialog";
import { ModuleDetailsDialog } from "@/components/admin/module-details-dialog";
import { RenameDialog } from "@/components/admin/rename-dialog";
import { ReplaceArtifactDialog } from "@/components/admin/replace-artifact-dialog";
import { VersionHistoryDialog } from "@/components/admin/version-history-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type {
  AdminActionResult,
  AdminModuleDetail,
  AdminModuleSummary,
  EditModuleFormData,
} from "@/types/admin-registry";

const PAGE_SIZE = 10;

export function ModuleManagementContent() {
  const [modules, setModules] = useState<AdminModuleSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const [listErrorMessage, setListErrorMessage] = useState<string | null>(null);

  const [editTarget, setEditTarget] = useState<AdminModuleSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminModuleSummary | null>(
    null,
  );
  const [detailData, setDetailData] = useState<AdminModuleDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [versionTarget, setVersionTarget] = useState<AdminModuleSummary | null>(
    null,
  );
  const [replaceTarget, setReplaceTarget] = useState<AdminModuleSummary | null>(
    null,
  );
  const [renameTarget, setRenameTarget] = useState<AdminModuleSummary | null>(
    null,
  );

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchModules = useCallback(
    async (nextPage: number, nextSearch: string) => {
      setIsLoading(true);
      setConflictMessage(null);

      try {
        const result = await listAdminModulesAction({
          page: nextPage,
          limit: PAGE_SIZE,
          search: nextSearch || undefined,
        });

        if (!result.success || !result.data) {
          if (result.code === "UNAUTHORIZED") {
            setListErrorMessage(
              "You are not authorized to load modules. Admin access is required.",
            );
            setModules([]);
            setTotal(0);
            setPage(1);
            setTotalPages(1);
            return;
          }

          setListErrorMessage(
            result.error ?? "Failed to load modules. Please try again.",
          );
          return;
        }

        setListErrorMessage(null);
        setModules(result.data.items);
        setTotal(result.data.total);
        setPage(result.data.page);
        setTotalPages(result.data.totalPages);
      } catch (error) {
        console.error("Failed to fetch modules:", error);
        setListErrorMessage(
          "Something went wrong while loading modules. Please try again.",
        );
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void fetchModules(1, search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadModuleDetail(mod: AdminModuleSummary) {
    setDetailLoading(true);
    setDetailData(null);
    const result = await getModuleDetailAction(
      mod.namespace,
      mod.name,
      mod.provider,
    );

    if (result.success && result.data) {
      setDetailData(result.data);
    } else {
      setDetailData(null);
    }

    setDetailLoading(false);
  }

  function handleSearchChange(value: string) {
    setSearch(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    searchTimeoutRef.current = setTimeout(() => {
      void fetchModules(1, value);
    }, 300);
  }

  function handleClearSearch() {
    setSearch("");
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    void fetchModules(1, "");
  }

  function handlePrevPage() {
    if (page > 1) void fetchModules(page - 1, search);
  }

  function handleNextPage() {
    if (page < totalPages) void fetchModules(page + 1, search);
  }

  function handleViewDetails(mod: AdminModuleSummary) {
    setDetailOpen(true);
    void loadModuleDetail(mod);
  }

  async function handleEditConfirm(
    namespace: string,
    name: string,
    provider: string,
    data: EditModuleFormData,
  ) {
    const result = await editModuleMetadataAction(
      namespace,
      name,
      provider,
      data,
      editTarget?.revision ?? 0,
    );

    if (!result.success) {
      if (result.code === "CONFLICT") {
        const message =
          result.error ??
          "The module changed on the server. Refresh and retry your update.";
        setConflictMessage(message);
        throw new Error(message);
      }

      throw new Error(result.error ?? "Failed to update module metadata");
    }

    await fetchModules(page, search);
  }

  async function handleDeleteConfirm(
    namespace: string,
    name: string,
    provider: string,
  ) {
    const result = await deleteModuleAction(namespace, name, provider);
    if (!result.success) {
      if (result.code === "CONFLICT") {
        const message =
          result.error ??
          "The module changed on the server. Refresh and retry the delete.";
        setConflictMessage(message);
        throw new Error(message);
      }

      throw new Error(result.error ?? "Failed to delete module");
    }

    await fetchModules(page, search);
  }

  function handleViewVersions(mod: AdminModuleSummary) {
    setVersionTarget(mod);
    void loadModuleDetail(mod);
  }

  function handleReplaceArtifact(mod: AdminModuleSummary) {
    setReplaceTarget(mod);
    void loadModuleDetail(mod);
  }

  async function handleReplaceConfirm(_version: string, _artifact: File) {
    const result = await replaceModuleArtifactAction();
    throw new Error(result.error ?? "Artifact replacement is unavailable");
  }

  function handleRenameModule(mod: AdminModuleSummary) {
    setRenameTarget(mod);
  }

  async function handleRenameConfirm(values: Record<string, string>) {
    if (!renameTarget) return;

    const result = await renameModuleAction(
      renameTarget.namespace,
      renameTarget.name,
      renameTarget.provider,
      values,
    );

    if (!result.success) {
      throw new Error(result.error ?? "Failed to rename module");
    }

    await fetchModules(page, search);
  }

  async function handleDeleteVersion(version: string, revision: number) {
    if (!versionTarget) return;

    const result = await deleteModuleVersionAction(
      versionTarget.namespace,
      versionTarget.name,
      versionTarget.provider,
      version,
      revision,
    );

    if (!result.success) {
      if (result.code === "CONFLICT") {
        const message =
          result.error ??
          "The version changed on the server. Refresh and retry the delete.";
        setConflictMessage(message);
        return;
      }

      setConflictMessage(result.error ?? "Failed to delete version");
      return;
    }

    await fetchModules(page, search);
    await loadModuleDetail(versionTarget);
  }

  async function handleCreate(
    data: Parameters<typeof createModuleAction>[0],
  ): Promise<AdminActionResult> {
    const result = await createModuleAction(data);
    if (result.success) {
      await fetchModules(1, search);
    }
    return result;
  }

  const moduleVersions = useMemo(() => {
    if (!detailData) return [];
    return detailData.versions.map((version) => ({
      version: version.version,
      revision: version.revision,
      publishedAt: version.publishedAt,
      downloads: version.downloads,
    }));
  }, [detailData]);

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Module Management
          </h1>
          <p className="text-muted-foreground mt-2">
            Publish, manage, and version Terraform modules
          </p>
        </div>
        <CreateModuleDialog onSubmit={handleCreate} onCreated={() => void 0} />
      </div>

      {conflictMessage && (
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle className="size-4" />
          <AlertTitle>Stale revision detected</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>{conflictMessage}</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void fetchModules(page, search)}
            >
              Refresh Data
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              <CardTitle>Modules</CardTitle>
              <span className="text-sm text-muted-foreground">
                ({total} total)
              </span>
            </div>
          </div>
          <CardDescription>
            View and manage all published modules in the registry.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by namespace, name, or provider..."
                value={search}
                onChange={(event) => handleSearchChange(event.target.value)}
                className="pl-9 pr-9"
              />
              {search && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-10 w-10"
                  onClick={handleClearSearch}
                >
                  <X className="size-4" />
                  <span className="sr-only">Clear search</span>
                </Button>
              )}
            </div>
          </div>

          {listErrorMessage && (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" />
              <AlertTitle>Unable to load modules</AlertTitle>
              <AlertDescription className="flex items-center justify-between gap-3">
                <span>{listErrorMessage}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void fetchModules(page, search)}
                >
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          )}

          <ModuleTable
            modules={modules}
            isLoading={isLoading}
            onViewDetails={handleViewDetails}
            onEditModule={setEditTarget}
            onRenameModule={handleRenameModule}
            onReplaceArtifact={handleReplaceArtifact}
            onViewVersions={handleViewVersions}
            onDeleteModule={setDeleteTarget}
          />

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrevPage}
                  disabled={page <= 1 || isLoading}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNextPage}
                  disabled={page >= totalPages || isLoading}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <EditModuleDialog
        module={editTarget}
        open={editTarget !== null}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
        onConfirm={handleEditConfirm}
      />

      <ModuleDetailsDialog
        detail={detailData}
        isLoading={detailLoading}
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open) setDetailData(null);
        }}
      />

      <DeleteModuleDialog
        module={deleteTarget}
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        onConfirm={handleDeleteConfirm}
      />

      <VersionHistoryDialog
        identifier={
          versionTarget
            ? `${versionTarget.namespace}/${versionTarget.name}/${versionTarget.provider}`
            : ""
        }
        entityType="module"
        versions={moduleVersions}
        isLoading={detailLoading}
        open={versionTarget !== null}
        onOpenChange={(open) => {
          if (!open) setVersionTarget(null);
        }}
        onDeleteVersion={(version, revision) => {
          void handleDeleteVersion(version, revision);
        }}
      />

      <ReplaceArtifactDialog
        identifier={
          replaceTarget
            ? `${replaceTarget.namespace}/${replaceTarget.name}/${replaceTarget.provider}`
            : ""
        }
        entityType="module"
        versions={moduleVersions.map((version) => version.version)}
        open={replaceTarget !== null}
        onOpenChange={(open) => {
          if (!open) setReplaceTarget(null);
        }}
        onConfirm={handleReplaceConfirm}
      />

      <RenameDialog
        title="Rename Module"
        identifier={
          renameTarget
            ? `${renameTarget.namespace}/${renameTarget.name}/${renameTarget.provider}`
            : ""
        }
        fields={
          renameTarget
            ? [
                {
                  id: "namespace",
                  label: "Namespace",
                  value: renameTarget.namespace,
                },
                { id: "name", label: "Name", value: renameTarget.name },
                {
                  id: "provider",
                  label: "Provider",
                  value: renameTarget.provider,
                },
              ]
            : []
        }
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
        onConfirm={handleRenameConfirm}
      />
    </div>
  );
}
