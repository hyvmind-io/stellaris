"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { UserTable } from "@/components/admin/user-table";
import { RoleChangeDialog } from "@/components/admin/role-change-dialog";
import { UserDetailsDialog } from "@/components/admin/user-details-dialog";
import { DeleteUserDialog } from "@/components/admin/delete-user-dialog";
import { EditUserDialog } from "@/components/admin/edit-user-dialog";
import { ResetPasswordDialog } from "@/components/admin/reset-password-dialog";
import { AddUserDialog } from "@/components/admin/add-user-dialog";
import {
  listUsersAction,
  updateUserRoleAction,
  getUserDetailsAction,
  deleteUserAction,
  editUserAction,
  resetUserPasswordAction,
} from "@/app/actions/admin";
import type { AuthUser, AuthUserWithCounts, UserRole } from "@/types/auth";

interface UserManagementContentProps {
  currentUserId: number;
}

export function UserManagementContent({
  currentUserId,
}: UserManagementContentProps) {
  // State — user list
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  // State — filters
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRole | "all">("all");

  // State — dialogs
  const [roleChangeUser, setRoleChangeUser] = useState<AuthUser | null>(null);
  const [editTargetUser, setEditTargetUser] = useState<AuthUser | null>(null);
  const [detailsUser, setDetailsUser] = useState<AuthUserWithCounts | null>(
    null,
  );
  const [deleteTargetUser, setDeleteTargetUser] =
    useState<AuthUserWithCounts | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<AuthUser | null>(
    null,
  );

  // Search debounce
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const LIMIT = 10;

  // ─── Fetch users ───────────────────────────────────────────────────
  const fetchUsers = useCallback(
    async (p: number, s: string, role: UserRole | "all") => {
      setIsLoading(true);
      try {
        const result = await listUsersAction({
          page: p,
          limit: LIMIT,
          search: s || undefined,
          role: role === "all" ? undefined : role,
        });
        if (result.success) {
          setUsers(result.users ?? []);
          setTotal(result.total ?? 0);
          setPage(result.page ?? 1);
          setTotalPages(result.totalPages ?? 1);
        }
      } catch (err) {
        console.error("Failed to fetch users:", err);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  // Initial load
  useEffect(() => {
    void fetchUsers(1, search, roleFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Search handler (debounced) ────────────────────────────────────
  function handleSearchChange(value: string) {
    setSearch(value);
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      void fetchUsers(1, value, roleFilter);
    }, 300);
  }

  function handleClearSearch() {
    setSearch("");
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    void fetchUsers(1, "", roleFilter);
  }

  // ─── Role filter handler ───────────────────────────────────────────
  function handleRoleFilterChange(value: string) {
    const role = value as UserRole | "all";
    setRoleFilter(role);
    void fetchUsers(1, search, role);
  }

  // ─── Pagination ────────────────────────────────────────────────────
  function handlePrevPage() {
    if (page > 1) {
      void fetchUsers(page - 1, search, roleFilter);
    }
  }

  function handleNextPage() {
    if (page < totalPages) {
      void fetchUsers(page + 1, search, roleFilter);
    }
  }

  // ─── Dialog actions ────────────────────────────────────────────────
  async function handleViewDetails(user: AuthUser) {
    const result = await getUserDetailsAction(user.id);
    if (result.success && result.user) {
      setDetailsUser(result.user);
    }
  }

  function handleChangeRole(user: AuthUser) {
    setRoleChangeUser(user);
  }

  function handleEditUser(user: AuthUser) {
    setEditTargetUser(user);
  }

  async function handleEditUserConfirm(
    userId: number,
    data: { email: string; username: string; displayName?: string },
  ) {
    const result = await editUserAction(userId, data);
    if (!result.success) {
      throw new Error(result.error ?? "Failed to update user");
    }
    // Refresh user list to reflect changes
    void fetchUsers(page, search, roleFilter);
  }

  async function handleRoleChangeConfirm(userId: number, newRole: UserRole) {
    const result = await updateUserRoleAction(userId, newRole);
    if (!result.success) {
      throw new Error(result.error ?? "Failed to update role");
    }
    // Refresh user list
    void fetchUsers(page, search, roleFilter);
  }

  async function handleDeleteRequest(user: AuthUser) {
    // Fetch details so the dialog can show resource counts
    const result = await getUserDetailsAction(user.id);
    if (result.success && result.user) {
      setDeleteTargetUser(result.user);
    }
  }

  async function handleDeleteConfirm(userId: number) {
    const result = await deleteUserAction(userId);
    if (!result.success) {
      throw new Error(result.error ?? "Failed to delete user");
    }
    // Refresh user list
    void fetchUsers(page, search, roleFilter);
  }

  function handleResetPassword(user: AuthUser) {
    setResetPasswordUser(user);
  }

  async function handleResetPasswordConfirm(
    userId: number,
    newPassword: string,
  ) {
    const result = await resetUserPasswordAction(userId, newPassword);
    if (!result.success) {
      throw new Error(result.error ?? "Failed to reset password");
    }
    // Refresh user list (lastLoginAt may be stale after session invalidation)
    void fetchUsers(page, search, roleFilter);
  }

  function handleUserCreated() {
    void fetchUsers(1, search, roleFilter);
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
          <p className="text-muted-foreground mt-2">
            Manage user accounts and roles
          </p>
        </div>
        <AddUserDialog onUserCreated={handleUserCreated} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              <CardTitle>Users</CardTitle>
              <span className="text-sm text-muted-foreground">
                ({total} total)
              </span>
            </div>
          </div>
          <CardDescription>
            View and manage all registered users in the registry.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by username, email, or display name..."
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
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
            <Select value={roleFilter} onValueChange={handleRoleFilterChange}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="All Roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="guest">Guest</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <UserTable
            users={users}
            currentUserId={currentUserId}
            isLoading={isLoading}
            onViewDetails={handleViewDetails}
            onEditUser={handleEditUser}
            onChangeRole={handleChangeRole}
            onResetPassword={handleResetPassword}
            onDeleteUser={handleDeleteRequest}
          />

          {/* Pagination */}
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

      {/* Dialogs */}
      <EditUserDialog
        user={editTargetUser}
        open={editTargetUser !== null}
        onOpenChange={(open) => {
          if (!open) setEditTargetUser(null);
        }}
        onConfirm={handleEditUserConfirm}
      />

      <UserDetailsDialog
        user={detailsUser}
        open={detailsUser !== null}
        onOpenChange={(open) => {
          if (!open) setDetailsUser(null);
        }}
      />

      <RoleChangeDialog
        user={roleChangeUser}
        currentUserId={currentUserId}
        open={roleChangeUser !== null}
        onOpenChange={(open) => {
          if (!open) setRoleChangeUser(null);
        }}
        onConfirm={handleRoleChangeConfirm}
      />

      <DeleteUserDialog
        user={deleteTargetUser}
        open={deleteTargetUser !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTargetUser(null);
        }}
        onConfirm={handleDeleteConfirm}
      />

      <ResetPasswordDialog
        user={resetPasswordUser}
        open={resetPasswordUser !== null}
        onOpenChange={(open) => {
          if (!open) setResetPasswordUser(null);
        }}
        onConfirm={handleResetPasswordConfirm}
      />
    </div>
  );
}
