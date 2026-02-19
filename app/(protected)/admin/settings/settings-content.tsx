"use client";

import { Settings, Users } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SignupToggle } from "@/components/admin/signup-toggle";

export function SettingsContent() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Admin Settings</h1>
        <p className="text-muted-foreground mt-2">
          Configure system-wide settings for Stellaris
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
