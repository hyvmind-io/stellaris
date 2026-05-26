"use client";

import { useState } from "react";
import { Info, Palette } from "lucide-react";

import { THEMES } from "@/app/generated/themes.manifest";
import { useThemeAttribute } from "@/components/theme/theme-attribute-provider";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Profile theme preference (PRD-02 §7.2). Lets a signed-in user pick their own
 * theme among the compiled manifest themes, applied via the cookie-backed
 * ThemeAttributeProvider (orthogonal to the light/dark toggle, which stays in
 * the top nav).
 *
 * When per-user override is disabled by the administrator, the select is
 * disabled with an explanatory note (02-206 / 02-207) so users understand the
 * theme is centrally controlled rather than silently broken.
 */
export function ThemePreference() {
  const { theme, overrideAllowed, setTheme } = useThemeAttribute();
  const [pending, setPending] = useState(false);

  async function handleChange(next: string) {
    setPending(true);
    try {
      await setTheme(next);
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="size-5" />
          Theme
        </CardTitle>
        <CardDescription>
          Choose the color theme applied to your account across this deployment.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="profile-theme-select" className="text-sm font-medium">
            Color theme
          </Label>
          <Select
            value={theme}
            onValueChange={handleChange}
            disabled={!overrideAllowed || pending}
          >
            <SelectTrigger
              id="profile-theme-select"
              className="w-full sm:w-[260px]"
              aria-label="Select theme"
            >
              <SelectValue placeholder="Select theme" />
            </SelectTrigger>
            <SelectContent>
              {THEMES.map((t) => (
                <SelectItem key={t.name} value={t.name}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!overrideAllowed && (
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" />
            <span>
              Theme selection is controlled by your administrator. The
              deployment-wide default theme is applied to your account.
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
