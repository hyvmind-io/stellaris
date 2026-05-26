"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
import { THEMES } from "@/app/generated/themes.manifest";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getThemeSettingsAction,
  setDefaultThemeAction,
  setThemeOverrideAllowedAction,
} from "@/app/actions/theme";

/**
 * Admin theme settings (PRD-02 §7.2): the deployment-wide default-theme select
 * and the per-user override toggle. Mirrors the SignupToggle / ImmutableUploads
 * pattern (load on mount, persist via server action, surface inline errors).
 */
export function ThemeSettings() {
  const router = useRouter();
  const [defaultTheme, setDefaultThemeState] = useState<string | null>(null);
  const [overrideAllowed, setOverrideAllowed] = useState<boolean | null>(null);
  const [savingDefault, setSavingDefault] = useState(false);
  const [savingOverride, setSavingOverride] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const settings = await getThemeSettingsAction();
      setDefaultThemeState(settings.defaultTheme);
      setOverrideAllowed(settings.overrideAllowed);
    } catch {
      setError("Failed to load theme settings");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDefaultChange(next: string) {
    setSavingDefault(true);
    setError(null);
    const previous = defaultTheme;
    setDefaultThemeState(next);
    try {
      const result = await setDefaultThemeAction(next);
      if (!result.success) {
        setDefaultThemeState(previous);
        setError(result.error ?? "Failed to set default theme");
      } else {
        // Re-fetch the root layout so the new default applies live (the action
        // revalidates the cache; refresh() re-renders the mounted tree).
        router.refresh();
      }
    } catch {
      setDefaultThemeState(previous);
      setError("Failed to set default theme");
    } finally {
      setSavingDefault(false);
    }
  }

  async function handleOverrideToggle(checked: boolean) {
    setSavingOverride(true);
    setError(null);
    const previous = overrideAllowed;
    setOverrideAllowed(checked);
    try {
      const result = await setThemeOverrideAllowedAction(checked);
      if (!result.success) {
        setOverrideAllowed(previous);
        setError(result.error ?? "Failed to update override setting");
      } else {
        // Re-render the layout so the provider's `overrideAllowed` prop (which
        // gates the profile picker + optimistic setTheme) updates live.
        router.refresh();
      }
    } catch {
      setOverrideAllowed(previous);
      setError("Failed to update override setting");
    } finally {
      setSavingOverride(false);
    }
  }

  if (defaultTheme === null || overrideAllowed === null) {
    return (
      <div className="flex items-center gap-3 py-2">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          Loading theme settings...
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Default theme */}
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <Label htmlFor="default-theme-select" className="text-sm font-medium">
            Default Theme
          </Label>
          <p className="text-xs text-muted-foreground">
            The theme applied deployment-wide. Used for everyone when per-user
            override is off, and as the starting point otherwise.
          </p>
        </div>
        <Select
          value={defaultTheme}
          onValueChange={handleDefaultChange}
          disabled={savingDefault}
        >
          <SelectTrigger id="default-theme-select" className="w-[200px]">
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

      {/* Override toggle */}
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <Label
            htmlFor="theme-override-toggle"
            className="text-sm font-medium"
          >
            Allow User Theme Override
          </Label>
          <p className="text-xs text-muted-foreground">
            When on, each user may pick their own theme (persisted per account).
            When off, everyone sees the default theme; stored preferences are
            ignored, not erased.
          </p>
        </div>
        <Switch
          id="theme-override-toggle"
          checked={overrideAllowed}
          onCheckedChange={handleOverrideToggle}
          disabled={savingOverride}
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertTriangle className="size-4" />
          {error}
        </div>
      )}
    </div>
  );
}
