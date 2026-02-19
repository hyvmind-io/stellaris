"use client";

import { useState, useTransition, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Plus, Trash2, Key } from "lucide-react";
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
import type { ApiKeyData, UserRole } from "@/types/auth";
import { KeyDisplayDialog } from "./key-display-dialog";

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
  } | null>(null);
  const [deletingKeyId, setDeletingKeyId] = useState<number | null>(null);

  const canCreateKeys = userRole === "admin" || userRole === "user";

  const form = useForm<CreateKeyValues>({
    resolver: zodResolver(createKeySchema),
    defaultValues: {
      name: "",
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
      const result = await createApiKeyAction(values.name);

      if (result.success && result.plainTextKey && result.key) {
        setNewKey({
          name: values.name,
          plainText: result.plainTextKey,
        });
        setIsCreateDialogOpen(false);
        setShowKeyDialog(true);
        form.reset();
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
              onOpenChange={setIsCreateDialogOpen}
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
                    <TableHead>Created</TableHead>
                    <TableHead>Last Used</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {keys.map((key) => (
                    <TableRow key={key.id}>
                      <TableCell className="font-medium">{key.name}</TableCell>
                      <TableCell>{formatRelativeTime(key.createdAt)}</TableCell>
                      <TableCell>
                        {formatRelativeTime(key.lastUsedAt)}
                      </TableCell>
                      <TableCell>
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
        />
      )}
    </>
  );
}
