"use client";

import {
  Eye,
  KeyRound,
  MoreHorizontal,
  Pencil,
  Shield,
  Trash2,
  Users,
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
import { RoleBadge } from "@/components/ui/role-badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { AuthUser, UserRole } from "@/types/auth";

interface UserTableProps {
  users: AuthUser[];
  currentUserId?: number;
  isLoading?: boolean;
  onViewDetails: (user: AuthUser) => void;
  onEditUser: (user: AuthUser) => void;
  onChangeRole: (user: AuthUser) => void;
  onResetPassword: (user: AuthUser) => void;
  onDeleteUser: (user: AuthUser) => void;
}

function formatRelativeTime(date: Date | string | null): string {
  if (!date) return "Never";
  const d = typeof date === "string" ? new Date(date) : date;
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHrs = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHrs / 24);

  if (diffSecs < 60) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHrs < 24) return `${diffHrs}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: diffDays > 365 ? "numeric" : undefined,
  });
}

function UserTableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-8 w-8 rounded-md" />
        </div>
      ))}
    </div>
  );
}

export function UserTable({
  users,
  currentUserId,
  isLoading,
  onViewDetails,
  onEditUser,
  onChangeRole,
  onResetPassword,
  onDeleteUser,
}: UserTableProps) {
  if (isLoading) {
    return <UserTableSkeleton />;
  }

  if (users.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Users className="size-12 text-muted-foreground/50" />
        <h3 className="mt-4 text-lg font-semibold">No users found</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          No users match the current filters. Try adjusting your search.
        </p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>User</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Last Login</TableHead>
          <TableHead className="w-[50px]">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user) => {
          const isSelf = user.id === currentUserId;
          return (
            <TableRow key={user.id}>
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-medium">
                    {user.displayName ?? user.username}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    @{user.username}
                    {isSelf && <span className="ml-1 text-primary">(you)</span>}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <span className="text-sm text-muted-foreground">
                  {user.email}
                </span>
              </TableCell>
              <TableCell>
                <RoleBadge role={user.role as UserRole} />
              </TableCell>
              <TableCell>
                <span className="text-sm text-muted-foreground">
                  {formatRelativeTime(user.lastLoginAt)}
                </span>
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <MoreHorizontal className="size-4" />
                      <span className="sr-only">
                        Actions for {user.username}
                      </span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onViewDetails(user)}>
                      <Eye className="size-4" />
                      View Details
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onEditUser(user)}>
                      <Pencil className="size-4" />
                      Edit User
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onChangeRole(user)}>
                      <Shield className="size-4" />
                      Change Role
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onResetPassword(user)}
                      disabled={isSelf}
                    >
                      <KeyRound className="size-4" />
                      Reset Password
                      {isSelf && (
                        <span className="ml-auto text-xs text-muted-foreground">
                          (use profile)
                        </span>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => onDeleteUser(user)}
                      className="text-destructive focus:text-destructive"
                      disabled={isSelf}
                    >
                      <Trash2 className="size-4" />
                      Delete User
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
