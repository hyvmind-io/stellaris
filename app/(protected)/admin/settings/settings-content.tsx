"use client";

import { Globe, Lock, Palette, Settings, Users } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SignupToggle } from "@/components/admin/signup-toggle";
import { ProxySettings } from "@/components/admin/proxy-settings";
import { ImmutableUploadsToggle } from "@/components/admin/immutable-uploads-toggle";
import { ThemeSettings } from "@/components/admin/theme-settings";
import { useBranding } from "@/components/branding/branding-provider";

export function SettingsContent() {
  const branding = useBranding();
  const settingsTarget =
    branding.whitelabelEnabled && branding.brandName
      ? branding.brandName
      : "Stellaris";
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Admin Settings</h1>
        <p className="text-muted-foreground mt-2">
          Configure system-wide settings for {settingsTarget}
        </p>
      </div>

      <div className="space-y-8">
        {/* User Registration */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              <CardTitle>User Registration</CardTitle>
            </div>
            <CardDescription>
              Control whether new users can register accounts
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SignupToggle />
          </CardContent>
        </Card>

        {/* Immutable Uploads */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              <CardTitle>Immutable Uploads</CardTitle>
            </div>
            <CardDescription>
              Control whether published artifact bytes can be overwritten. When
              ON, replacing existing provider platform or module version bytes
              returns 409; initial publish to an empty slot is always allowed.
              When OFF, re-uploading overwrites existing bytes and metadata in
              place.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ImmutableUploadsToggle />
          </CardContent>
        </Card>

        {/* Theming */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              <CardTitle>Theming</CardTitle>
            </div>
            <CardDescription>
              Choose the deployment-wide default theme and control whether users
              may pick their own. Themes are compiled from <code>themes/</code>{" "}
              at build time; the built-in default is always available.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ThemeSettings />
          </CardContent>
        </Card>

        {/* Upstream Proxy */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              <CardTitle>Upstream Proxy</CardTitle>
            </div>
            <CardDescription>
              Configure upstream registry proxying for modules and providers not
              found locally
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProxySettings />
          </CardContent>
        </Card>

        {/* Info */}
        <Card className="border-muted">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base">Registry Information</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              <strong>Rate Limiting:</strong> Configured at the Cloudflare edge
              layer via WAF Rate Limiting Rules. Not configurable through this
              panel.
            </p>
            <p>
              <strong>API Authentication:</strong> API routes use Bearer token
              auth via the <code>/v1/api-keys</code> endpoint. User sessions use
              JWT cookies.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
