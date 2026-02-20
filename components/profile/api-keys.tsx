"use client";

import { useState, useTransition, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Pencil, Plus, Trash2, Key } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  createApiKeyAction,
  listApiKeysAction,
  deleteApiKeyAction,
} from "@/app/actions/profile";
import {
  PERMISSIONS,
  GRANULAR_PERMISSIONS,
  AVAILABLE_PERMISSIONS,
  PERMISSION_META,
} from "@/lib/permissions";
import type { ApiKeyData, UserRole } from "@/types/auth";
import { KeyDisplayDialog } from "./key-display-dialog";
import { EditKeyDialog } from "./edit-key-dialog";
import { PermissionBadges } from "./permission-badges";

// ============================================================================
// Helpers
// ============================================================================

function formatRelativeTime(date: Date | null): string {
  if (!date) return "Never";
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays > 30) return new Date(date).toLocaleDateString();
  if (diffDays > 0) return `${diffDays}d ago`;
  if (diffHours > 0) return `${diffHours}h ago`;
  if (diffMinutes > 0) return `${diffMinutes}m ago`;
  return "Just now";
}

// ============================================================================
// Validation Schema
// ============================================================================

const createKeySchema = z.object({
  name: z
    .string()
    .min(1, "Key name is required")
    .max(100, "Key name must be at most 100 characters"),
  permissions: z
    .array(z.string().min(1))
    .min(1, "At least one permission must be selected"),
});

type CreateKeyValues = z.infer<typeof createKeySchema>;

// ============================================================================
// Component Props
// ============================================================================

interface ApiKeysProps {
  userRole: UserRole;
  initialKeys?: ApiKeyData[];
}

// ============================================================================
// API Keys Component
// ============================================================================

/**
 * ApiKeys Component
 *
 * Displays and manages API keys for the current user.
 * Only admin and user roles can create keys.
 */
export function ApiKeys({ userRole, initialKeys = [] }: ApiKeysProps) {
  const [keys, setKeys] = useState<ApiKeyData[]>(initialKeys);
  const [isLoading, setIsLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [showKeyDialog, setShowKeyDialog] = useState(false);
  const [newKey, setNewKey] = useState<{
    name: string;
    plainText: string;
    permissions: string[];
  } | null>(null);
  const [deletingKeyId, setDeletingKeyId] = useState<number | null>(null);
  const [editingKey, setEditingKey] = useState<ApiKeyData | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([
    ...GRANULAR_PERMISSIONS,
  ]);

  const canCreateKeys = userRole === "admin" || userRole === "user";

  const availablePerms =
    userRole === "admin" ? AVAILABLE_PERMISSIONS : GRANULAR_PERMISSIONS;

  const isAdminSelected = selectedPermissions.includes(PERMISSIONS.ADMIN);

  function handlePermissionToggle(perm: string, checked: boolean) {
    if (perm === PERMISSIONS.ADMIN) {
      setSelectedPermissions(
        checked ? [PERMISSIONS.ADMIN] : [...GRANULAR_PERMISSIONS],
      );
    } else {
      const newPerms = checked
        ? [...selectedPermissions.filter((p) => p !== PERMISSIONS.ADMIN), perm]
        : selectedPermissions.filter((p) => p !== perm);
      setSelectedPermissions(newPerms);
    }
  }

  function handleEditKey(key: ApiKeyData) {
    setEditingKey(key);
    setIsEditDialogOpen(true);
  }

  const form = useForm<CreateKeyValues>({
    resolver: zodResolver(createKeySchema),
    defaultValues: {
      name: "",
      permissions: [...GRANULAR_PERMISSIONS],
    },
  });

  // Refresh keys from server
  const refreshKeys = useCallback(async () => {
    setIsLoading(true);
    const result = await listApiKeysAction();
    if (result.success && result.keys) {
      setKeys(result.keys);
    } else {
      toast.error("Failed to load keys", {
        description: result.error || "Please try again later",
      });
    }
    setIsLoading(false);
  }, []);

  async function onCreateKey(values: CreateKeyValues) {
    startTransition(async () => {
      const result = await createApiKeyAction({
        name: values.name,
        permissions: selectedPermissions,
      });

      if (result.success && result.plainTextKey && result.key) {
        setNewKey({
          name: values.name,
          plainText: result.plainTextKey,
          permissions: result.key.permissions,
        });
        setIsCreateDialogOpen(false);
        setShowKeyDialog(true);
        form.reset();
        setSelectedPermissions([...GRANULAR_PERMISSIONS]);
        await refreshKeys();
      } else {
        toast.error("Failed to create key", {
          description: result.error || "Please try again",
        });
      }
    });
  }

  async function handleDeleteKey(keyId: number) {
    setDeletingKeyId(keyId);
    startTransition(async () => {
      const result = await deleteApiKeyAction(keyId);

      if (result.success) {
        toast.success("Key deleted", {
          description: "The API key has been revoked.",
        });
        await refreshKeys();
      } else {
        toast.error("Failed to delete key", {
          description: result.error || "Please try again",
        });
      }
      setDeletingKeyId(null);
    });
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>API Keys</CardTitle>
            <CardDescription>
              Manage your API keys for programmatic access
            </CardDescription>
          </div>
          {canCreateKeys && (
            <Dialog
              open={isCreateDialogOpen}
              onOpenChange={(open) => {
                setIsCreateDialogOpen(open);
                if (!open) {
                  form.reset();
                  setSelectedPermissions([...GRANULAR_PERMISSIONS]);
                }
              }}
            >
              <DialogTrigger asChild>
                <Button size="sm" className="gap-2">
                  <Plus className="size-4" />
                  Create Key
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create API Key</DialogTitle>
                  <DialogDescription>
                    Give your key a name to help you identify it later. The key
                    will only be shown once after creation.
                  </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                  <form
                    onSubmit={form.handleSubmit(onCreateKey)}
                    className="space-y-4"
                  >
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Key Name</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g., My Application, CLI Tool"
                              disabled={isPending}
                              {...field}
                            />
                          </FormControl>
                          <FormDescription>
                            A descriptive name to identify this key
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {/* Permissions */}
                    <div className="space-y-3">
                      <Label>Permissions</Label>
                      <div className="space-y-2">
                        {availablePerms.map((perm) => {
                          const meta = PERMISSION_META[perm];
                          const isGranularDisabledByAdmin =
                            perm !== PERMISSIONS.ADMIN && isAdminSelected;
                          return (
                            <div key={perm} className="flex items-start gap-3">
                              <Checkbox
                                id={`create-perm-${perm}`}
                                checked={
                                  perm === PERMISSIONS.ADMIN
                                    ? isAdminSelected
                                    : isAdminSelected ||
                                      selectedPermissions.includes(perm)
                                }
                                onCheckedChange={(checked) =>
                                  handlePermissionToggle(perm, checked === true)
                                }
                                disabled={
                                  isPending || isGranularDisabledByAdmin
                                }
                              />
                              <label
                                htmlFor={`create-perm-${perm}`}
                                className="text-sm leading-none"
                              >
                                <span className="font-medium">
                                  {meta.label}
                                </span>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {meta.description}
                                </p>
                              </label>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsCreateDialogOpen(false)}
                        disabled={isPending}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" disabled={isPending}>
                        {isPending ? (
                          <>
                            <Loader2 className="animate-spin" />
                            Creating...
                          </>
                        ) : (
                          "Create Key"
                        )}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent>
          {!canCreateKeys && (
            <div className="rounded-lg border border-dashed p-6 text-center">
              <Key className="mx-auto size-10 text-muted-foreground" />
              <h3 className="mt-2 font-medium">API Access Unavailable</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                API keys are only available for User and Admin accounts.
                <br />
                Contact an administrator to upgrade your account.
              </p>
            </div>
          )}

          {canCreateKeys && isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {canCreateKeys && !isLoading && keys.length === 0 && (
            <div className="rounded-lg border border-dashed p-6 text-center">
              <Key className="mx-auto size-10 text-muted-foreground" />
              <h3 className="mt-2 font-medium">No API Keys</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                You haven&apos;t created any API keys yet.
                <br />
                Create one to access the API programmatically.
              </p>
            </div>
          )}

          {canCreateKeys && !isLoading && keys.length > 0 && (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Permissions</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Last Used</TableHead>
                    <TableHead className="w-[120px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {keys.map((key) => (
                    <TableRow
                      key={key.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleEditKey(key)}
                    >
                      <TableCell className="font-medium">{key.name}</TableCell>
                      <TableCell>
                        <PermissionBadges permissions={key.permissions} />
                      </TableCell>
                      <TableCell>{formatRelativeTime(key.createdAt)}</TableCell>
                      <TableCell>
                        {formatRelativeTime(key.lastUsedAt)}
                      </TableCell>
                      <TableCell>
                        <div
                          className="flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleEditKey(key)}
                          >
                            <Pencil className="size-4" />
                            <span className="sr-only">Edit key</span>
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                disabled={isPending && deletingKeyId === key.id}
                              >
                                {isPending && deletingKeyId === key.id ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : (
                                  <Trash2 className="size-4" />
                                )}
                                <span className="sr-only">Delete key</span>
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Key</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete the key &quot;
                                  {key.name}&quot;? This action cannot be undone
                                  and any applications using this key will lose
                                  access.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel asChild>
                                  <Button variant="outline">Cancel</Button>
                                </AlertDialogCancel>
                                <Button
                                  variant="destructive"
                                  onClick={() => handleDeleteKey(key.id)}
                                >
                                  Delete
                                </Button>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Key display dialog - shown after creating a new key */}
      {newKey && (
        <KeyDisplayDialog
          open={showKeyDialog}
          onOpenChange={setShowKeyDialog}
          keyName={newKey.name}
          plainTextKey={newKey.plainText}
          permissions={newKey.permissions}
        />
      )}

      {/* Edit key dialog */}
      {editingKey && (
        <EditKeyDialog
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          apiKey={editingKey}
          userRole={userRole}
          onSuccess={refreshKeys}
        />
      )}
    </>
  );
}
