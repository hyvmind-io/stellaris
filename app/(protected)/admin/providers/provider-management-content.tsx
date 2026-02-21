"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Plug, Search, X } from "lucide-react";
import {
  createProviderAction,
  deleteProviderAction,
  deleteProviderVersionAction,
  editProviderMetadataAction,
  getProviderDetailAction,
  listAdminProvidersAction,
  renameProviderAction,
  replaceProviderArtifactAction,
} from "@/app/actions/admin-providers";
import { CreateProviderDialog } from "@/components/admin/create-provider-dialog";
import { DeleteProviderDialog } from "@/components/admin/delete-provider-dialog";
import { EditProviderDialog } from "@/components/admin/edit-provider-dialog";
import { ProviderDetailsDialog } from "@/components/admin/provider-details-dialog";
import { ProviderTable } from "@/components/admin/provider-table";
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
  AdminProviderDetail,
  AdminProviderSummary,
  EditProviderFormData,
} from "@/types/admin-registry";

const PAGE_SIZE = 10;

export function ProviderManagementContent() {
  const [providers, setProviders] = useState<AdminProviderSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const [listErrorMessage, setListErrorMessage] = useState<string | null>(null);

  const [editTarget, setEditTarget] = useState<AdminProviderSummary | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<AdminProviderSummary | null>(
    null,
  );
  const [detailData, setDetailData] = useState<AdminProviderDetail | null>(
    null,
  );
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [versionTarget, setVersionTarget] =
    useState<AdminProviderSummary | null>(null);
  const [replaceTarget, setReplaceTarget] =
    useState<AdminProviderSummary | null>(null);
  const [renameTarget, setRenameTarget] = useState<AdminProviderSummary | null>(
    null,
  );

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchProviders = useCallback(
    async (nextPage: number, nextSearch: string) => {
      setIsLoading(true);
      setConflictMessage(null);

      try {
        const result = await listAdminProvidersAction({
          page: nextPage,
          limit: PAGE_SIZE,
          search: nextSearch || undefined,
        });

        if (!result.success || !result.data) {
          if (result.code === "UNAUTHORIZED") {
            setListErrorMessage(
              "You are not authorized to load providers. Admin access is required.",
            );
            setProviders([]);
            setTotal(0);
            setPage(1);
            setTotalPages(1);
            return;
          }

          setListErrorMessage(
            result.error ?? "Failed to load providers. Please try again.",
          );
          return;
        }

        setListErrorMessage(null);
        setProviders(result.data.items);
        setTotal(result.data.total);
        setPage(result.data.page);
        setTotalPages(result.data.totalPages);
      } catch (error) {
        console.error("Failed to fetch providers:", error);
        setListErrorMessage(
          "Something went wrong while loading providers. Please try again.",
        );
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void fetchProviders(1, search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadProviderDetail(provider: AdminProviderSummary) {
    setDetailLoading(true);
    setDetailData(null);

    const result = await getProviderDetailAction(
      provider.namespace,
      provider.type,
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
      void fetchProviders(1, value);
    }, 300);
  }

  function handleClearSearch() {
    setSearch("");
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    void fetchProviders(1, "");
  }

  function handlePrevPage() {
    if (page > 1) void fetchProviders(page - 1, search);
  }

  function handleNextPage() {
    if (page < totalPages) void fetchProviders(page + 1, search);
  }

  function handleViewDetails(provider: AdminProviderSummary) {
    setDetailOpen(true);
    void loadProviderDetail(provider);
  }

  async function handleEditConfirm(
    namespace: string,
    type: string,
    data: EditProviderFormData,
  ) {
    const result = await editProviderMetadataAction(
      namespace,
      type,
      data,
      editTarget?.revision ?? 0,
    );

    if (!result.success) {
      if (result.code === "CONFLICT") {
        const message =
          result.error ??
          "The provider changed on the server. Refresh and retry your update.";
        setConflictMessage(message);
        throw new Error(message);
      }

      throw new Error(result.error ?? "Failed to update provider metadata");
    }

    await fetchProviders(page, search);
  }

  async function handleDeleteConfirm(namespace: string, type: string) {
    const result = await deleteProviderAction(namespace, type);
    if (!result.success) {
      if (result.code === "CONFLICT") {
        const message =
          result.error ??
          "The provider changed on the server. Refresh and retry the delete.";
        setConflictMessage(message);
        throw new Error(message);
      }

      throw new Error(result.error ?? "Failed to delete provider");
    }

    await fetchProviders(page, search);
  }

  function handleViewVersions(provider: AdminProviderSummary) {
    setVersionTarget(provider);
    void loadProviderDetail(provider);
  }

  function handleReplaceArtifact(provider: AdminProviderSummary) {
    setReplaceTarget(provider);
    void loadProviderDetail(provider);
  }

  async function handleReplaceConfirm(version: string, artifact: File) {
    if (!replaceTarget || !detailData) {
      throw new Error("Provider detail is required before replacing artifacts");
    }

    const versionEntry = detailData.versions.find(
      (item) => item.version === version,
    );
    const platform = versionEntry?.platforms[0];

    if (!versionEntry || !platform) {
      throw new Error(
        "No provider platform found for this version. Publish at least one platform first.",
      );
    }

    const result = await replaceProviderArtifactAction({
      namespace: replaceTarget.namespace,
      type: replaceTarget.type,
      version,
      os: platform.os,
      arch: platform.arch,
      artifact,
      expectedRevision: versionEntry.revision,
    });

    if (!result.success) {
      if (result.code === "CONFLICT") {
        const message =
          result.error ??
          "The provider changed on the server. Refresh and retry replacement.";
        setConflictMessage(message);
        throw new Error(message);
      }

      throw new Error(result.error ?? "Failed to replace provider artifact");
    }

    await fetchProviders(page, search);
    await loadProviderDetail(replaceTarget);
  }

  function handleRenameProvider(provider: AdminProviderSummary) {
    setRenameTarget(provider);
  }

  async function handleRenameConfirm(values: Record<string, string>) {
    if (!renameTarget) return;

    const result = await renameProviderAction(
      renameTarget.namespace,
      renameTarget.type,
      values,
    );

    if (!result.success) {
      throw new Error(result.error ?? "Failed to rename provider");
    }

    await fetchProviders(page, search);
  }

  async function handleDeleteVersion(version: string, revision: number) {
    if (!versionTarget) return;

    const result = await deleteProviderVersionAction(
      versionTarget.namespace,
      versionTarget.type,
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

      setConflictMessage(result.error ?? "Failed to delete provider version");
      return;
    }

    await fetchProviders(page, search);
    await loadProviderDetail(versionTarget);
  }

  async function handleCreate(
    data: Parameters<typeof createProviderAction>[0],
  ): Promise<AdminActionResult> {
    const result = await createProviderAction(data);
    if (result.success) {
      await fetchProviders(1, search);
    }
    return result;
  }

  const providerVersions = useMemo(() => {
    if (!detailData) return [];
    return detailData.versions.map((version) => ({
      version: version.version,
      revision: version.revision,
      publishedAt: version.publishedAt,
      platformCount: version.platforms.length,
      protocols: version.protocols,
    }));
  }, [detailData]);

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Provider Management
          </h1>
          <p className="text-muted-foreground mt-2">
            Publish, manage, and version Terraform providers
          </p>
        </div>
        <CreateProviderDialog
          onSubmit={handleCreate}
          onCreated={() => void 0}
        />
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
              onClick={() => void fetchProviders(page, search)}
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
              <Plug className="h-5 w-5" />
              <CardTitle>Providers</CardTitle>
              <span className="text-sm text-muted-foreground">
                ({total} total)
              </span>
            </div>
          </div>
          <CardDescription>
            View and manage all published providers in the registry.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by namespace or type..."
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
              <AlertTitle>Unable to load providers</AlertTitle>
              <AlertDescription className="flex items-center justify-between gap-3">
                <span>{listErrorMessage}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void fetchProviders(page, search)}
                >
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          )}

          <ProviderTable
            providers={providers}
            isLoading={isLoading}
            onViewDetails={handleViewDetails}
            onEditProvider={setEditTarget}
            onRenameProvider={handleRenameProvider}
            onReplaceArtifact={handleReplaceArtifact}
            onViewVersions={handleViewVersions}
            onDeleteProvider={setDeleteTarget}
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

      <EditProviderDialog
        provider={editTarget}
        open={editTarget !== null}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
        onConfirm={handleEditConfirm}
      />

      <ProviderDetailsDialog
        detail={detailData}
        isLoading={detailLoading}
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open) setDetailData(null);
        }}
      />

      <DeleteProviderDialog
        provider={deleteTarget}
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        onConfirm={handleDeleteConfirm}
      />

      <VersionHistoryDialog
        identifier={
          versionTarget
            ? `${versionTarget.namespace}/${versionTarget.type}`
            : ""
        }
        entityType="provider"
        versions={providerVersions}
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
            ? `${replaceTarget.namespace}/${replaceTarget.type}`
            : ""
        }
        entityType="provider"
        versions={providerVersions.map((version) => version.version)}
        open={replaceTarget !== null}
        onOpenChange={(open) => {
          if (!open) setReplaceTarget(null);
        }}
        onConfirm={handleReplaceConfirm}
      />

      <RenameDialog
        title="Rename Provider"
        identifier={
          renameTarget ? `${renameTarget.namespace}/${renameTarget.type}` : ""
        }
        fields={
          renameTarget
            ? [
                {
                  id: "namespace",
                  label: "Namespace",
                  value: renameTarget.namespace,
                },
                { id: "type", label: "Type", value: renameTarget.type },
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
