import Link from "next/link";
import { Terminal } from "lucide-react";
import { NavLink } from "./nav-link";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { UserMenu } from "./user-menu";
import { getAuth } from "@/lib/auth/get-auth";
import { isCfAccessEnabled } from "@/lib/auth/cf-access-config";
import { getBranding } from "@/lib/branding";

export async function Header() {
  const auth = await getAuth();
  const cfAccessEnabled = isCfAccessEnabled();
  const branding = getBranding();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-sm">
      <div className="container mx-auto flex h-14 items-center px-4">
        {/* Logo — custom URL when whitelabeled, else default icon.
            "Stellaris" engine identity stays visible regardless (01-209). */}
        <Link href="/" className="flex items-center gap-2 mr-8">
          {branding.logoUrl ? (
            <img
              src={branding.logoUrl}
              alt={branding.brandName ?? "Logo"}
              className="h-7 w-auto"
            />
          ) : (
            <div className="rounded-lg bg-primary/10 p-1.5">
              <Terminal className="h-5 w-5 text-primary" />
            </div>
          )}
          <span className="font-bold text-lg">Stellaris</span>
        </Link>

        {/* Navigation */}
        <nav className="flex items-center gap-6 flex-1">
          <NavLink href="/" exact>
            Home
          </NavLink>
          <NavLink href="/modules">Modules</NavLink>
          <NavLink href="/providers">Providers</NavLink>
          {auth?.user.role === "admin" && (
            <NavLink href="/admin/users">Admin</NavLink>
          )}
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* Light/dark toggle stays in the nav for everyone. Theme SELECTION
              (choosing among compiled themes) lives in the user Profile page. */}
          <ThemeToggle />
          {auth ? (
            <UserMenu user={auth.user} cfAccessEnabled={cfAccessEnabled} />
          ) : (
            <Button asChild variant="secondary" size="sm">
              <Link href="/login">Sign in</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
