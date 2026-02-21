"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Package, Plug, Settings, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const adminLinks = [
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/modules", label: "Modules", icon: Package },
  { href: "/admin/providers", label: "Providers", icon: Plug },
  { href: "/admin/settings", label: "Settings", icon: Settings },
] as const;

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav
      className="border-b border-border bg-card/50"
      aria-label="Admin navigation"
    >
      <div className="container mx-auto flex items-center gap-1 px-4 overflow-x-auto">
        {adminLinks.map(({ href, label, icon: Icon }) => {
          const isActive = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors",
                isActive
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
