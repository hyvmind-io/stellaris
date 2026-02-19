"use client";

import { useTransition } from "react";
import Link from "next/link";
import { LogOut, Settings, ShieldCheck } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { logoutAction, logoutEverywhereAction } from "@/app/actions/auth";

// ============================================================================
// Types
// ============================================================================

interface UserMenuProps {
  user: {
    email: string;
    username: string;
    role: "admin" | "user" | "guest";
  };
}

// ============================================================================
// Component
// ============================================================================

export function UserMenu({ user }: UserMenuProps) {
  const [isLoggingOut, startLogout] = useTransition();
  const [isLoggingOutAll, startLogoutAll] = useTransition();

  const initials = user.username.slice(0, 2).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-8 w-8 rounded-full">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent className="w-56" align="end" forceMount>
        {/* User info */}
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium leading-none">
                {user.username}
              </p>
              {user.role === "admin" && (
                <span className="text-xs text-primary font-medium">admin</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {user.email}
            </p>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        {/* Navigation */}
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href="/profile">
              <Settings className="size-4" />
              Profile
            </Link>
          </DropdownMenuItem>

          {user.role === "admin" && (
            <DropdownMenuItem asChild>
              <Link href="/admin/users">
                <ShieldCheck className="size-4" />
                Admin Panel
              </Link>
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        {/* Logout actions */}
        <DropdownMenuGroup>
          <DropdownMenuItem
            disabled={isLoggingOut}
            onSelect={(e) => {
              e.preventDefault();
              startLogout(() => logoutAction());
            }}
          >
            <LogOut />
            {isLoggingOut ? "Signing out\u2026" : "Sign out"}
          </DropdownMenuItem>

          <DropdownMenuItem
            disabled={isLoggingOutAll}
            className="text-destructive focus:text-destructive"
            onSelect={(e) => {
              e.preventDefault();
              startLogoutAll(() => logoutEverywhereAction());
            }}
          >
            <LogOut />
            {isLoggingOutAll ? "Signing out\u2026" : "Sign out everywhere"}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
