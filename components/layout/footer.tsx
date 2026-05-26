"use client";

import { Terminal } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useBranding } from "@/components/branding/branding-provider";

export function Footer() {
  const branding = useBranding();

  return (
    <footer className="border-t border-border bg-card">
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col items-center gap-4 md:flex-row md:justify-between">
          {/* Branding */}
          <div className="flex items-center gap-2 text-muted-foreground">
            {branding.logoUrl ? (
              <img
                src={branding.logoUrl}
                alt={branding.brandName ?? "Logo"}
                className="h-4 w-auto"
              />
            ) : (
              <Terminal className="h-4 w-4" />
            )}
            <span className="text-sm">
              {branding.whitelabelEnabled
                ? branding.footerText
                : branding.appTitle}
            </span>
          </div>

          {/* Links */}
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <a
              href="/.well-known/terraform.json"
              className="hover:text-foreground transition-colors"
            >
              API Discovery
            </a>
            <Separator orientation="vertical" className="h-4" />
            <a
              href="/health"
              className="hover:text-foreground transition-colors"
            >
              Health
            </a>
          </div>
        </div>

        {branding.showTechBranding && (
          <>
            <Separator className="my-4" />

            <p className="text-center text-xs text-muted-foreground">
              Powered by Next.js · Cloudflare Workers
            </p>
            <p className="text-center text-[0.6rem] text-muted-foreground">
              built with ❤️ by <a href="https://github.com/nmindz">nmindz</a>
            </p>
          </>
        )}
      </div>
    </footer>
  );
}
