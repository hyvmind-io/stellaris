"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Globe,
  Loader2,
  Save,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getProxySettingsAction,
  updateProxySettingsAction,
} from "@/app/actions/admin";

// ============================================================================
// Helpers
// ============================================================================

/**
 * Parse a multiline textarea value into a trimmed, non-empty array of URLs.
 */
function textareaToUrls(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Map textarea content to action override semantics.
 * Empty text clears DB override (falls back to env/defaults).
 */
function textareaToRegistryOverride(text: string): string[] | null {
  const urls = textareaToUrls(text);
  return urls.length === 0 ? null : urls;
}

/**
 * Convert an array of URLs into a newline-separated string for display.
 */
function urlsToTextarea(urls: string[]): string {
  return urls.join("\n");
}

// ============================================================================
// Component
// ============================================================================

export function ProxySettings() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state — separate from loaded settings so user can edit before saving
  const [moduleProxyEnabled, setModuleProxyEnabled] = useState(false);
  const [providerProxyEnabled, setProviderProxyEnabled] = useState(false);
  const [moduleRegistries, setModuleRegistries] = useState("");
  const [providerRegistries, setProviderRegistries] = useState("");

  // Track whether form has unsaved changes
  const [isDirty, setIsDirty] = useState(false);

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await getProxySettingsAction();
      if (result.success && result.settings) {
        setModuleProxyEnabled(result.settings.module_proxy_enabled);
        setProviderProxyEnabled(result.settings.provider_proxy_enabled);
        setModuleRegistries(
          urlsToTextarea(result.settings.module_upstream_registries),
        );
        setProviderRegistries(
          urlsToTextarea(result.settings.provider_upstream_registries),
        );
        setIsDirty(false);
      } else {
        setError(result.error ?? "Failed to load proxy settings");
      }
    } catch {
      setError("Failed to load proxy settings");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  // Clear success message after a timeout
  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(null), 4000);
    return () => clearTimeout(timer);
  }, [success]);

  function markDirty() {
    setIsDirty(true);
    setSuccess(null);
  }

  function handleModuleProxyToggle(checked: boolean) {
    setModuleProxyEnabled(checked);
    markDirty();
  }

  function handleProviderProxyToggle(checked: boolean) {
    setProviderProxyEnabled(checked);
    markDirty();
  }

  function handleModuleRegistriesChange(
    e: React.ChangeEvent<HTMLTextAreaElement>,
  ) {
    setModuleRegistries(e.target.value);
    markDirty();
  }

  function handleProviderRegistriesChange(
    e: React.ChangeEvent<HTMLTextAreaElement>,
  ) {
    setProviderRegistries(e.target.value);
    markDirty();
  }

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await updateProxySettingsAction({
        module_proxy_enabled: moduleProxyEnabled,
        provider_proxy_enabled: providerProxyEnabled,
        module_upstream_registries:
          textareaToRegistryOverride(moduleRegistries),
        provider_upstream_registries:
          textareaToRegistryOverride(providerRegistries),
      });

      if (result.success && result.settings) {
        // Sync form with normalised values returned from server
        setModuleProxyEnabled(result.settings.module_proxy_enabled);
        setProviderProxyEnabled(result.settings.provider_proxy_enabled);
        setModuleRegistries(
          urlsToTextarea(result.settings.module_upstream_registries),
        );
        setProviderRegistries(
          urlsToTextarea(result.settings.provider_upstream_registries),
        );
        setIsDirty(false);
        setSuccess("Proxy settings saved successfully");
      } else {
        setError(result.error ?? "Failed to save proxy settings");
      }
    } catch {
      setError("Failed to save proxy settings");
    } finally {
      setIsSaving(false);
    }
  }

  // --------------------------------------------------------------------------
  // Loading skeleton
  // --------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div
        className="space-y-6"
        aria-busy="true"
        aria-label="Loading proxy settings"
      >
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-6 w-11 rounded-full" />
        </div>
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-52" />
          </div>
          <Skeleton className="h-6 w-11 rounded-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-20 w-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-52" />
          <Skeleton className="h-20 w-full" />
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Module Proxy Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Globe
            className={`size-5 ${moduleProxyEnabled ? "text-green-500" : "text-muted-foreground"}`}
          />
          <div className="space-y-0.5">
            <Label
              htmlFor="module-proxy-toggle"
              className="text-sm font-medium"
            >
              Module Upstream Proxy
            </Label>
            <p className="text-xs text-muted-foreground">
              {moduleProxyEnabled
                ? "Modules not found locally are fetched from upstream registries"
                : "Only locally published modules are served"}
            </p>
          </div>
        </div>
        <Switch
          id="module-proxy-toggle"
          checked={moduleProxyEnabled}
          onCheckedChange={handleModuleProxyToggle}
          disabled={isSaving}
          aria-describedby="module-proxy-description"
        />
      </div>

      {/* Provider Proxy Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Globe
            className={`size-5 ${providerProxyEnabled ? "text-green-500" : "text-muted-foreground"}`}
          />
          <div className="space-y-0.5">
            <Label
              htmlFor="provider-proxy-toggle"
              className="text-sm font-medium"
            >
              Provider Upstream Proxy
            </Label>
            <p className="text-xs text-muted-foreground">
              {providerProxyEnabled
                ? "Providers not found locally are fetched from upstream registries"
                : "Only locally published providers are served"}
            </p>
          </div>
        </div>
        <Switch
          id="provider-proxy-toggle"
          checked={providerProxyEnabled}
          onCheckedChange={handleProviderProxyToggle}
          disabled={isSaving}
          aria-describedby="provider-proxy-description"
        />
      </div>

      {/* Module Upstream Registries */}
      <div className="space-y-2">
        <Label htmlFor="module-registries" className="text-sm font-medium">
          Module Upstream Registries
        </Label>
        <Textarea
          id="module-registries"
          value={moduleRegistries}
          onChange={handleModuleRegistriesChange}
          placeholder={
            "https://registry.opentofu.org\nhttps://registry.terraform.io"
          }
          rows={4}
          disabled={isSaving}
          className="font-mono text-xs"
          aria-describedby="module-registries-hint"
        />
        <p
          id="module-registries-hint"
          className="text-xs text-muted-foreground"
        >
          One base URL per line. Tried in order when proxying module requests.
          Leave empty to use defaults (OpenTofu, then Terraform).
        </p>
      </div>

      {/* Provider Upstream Registries */}
      <div className="space-y-2">
        <Label htmlFor="provider-registries" className="text-sm font-medium">
          Provider Upstream Registries
        </Label>
        <Textarea
          id="provider-registries"
          value={providerRegistries}
          onChange={handleProviderRegistriesChange}
          placeholder={
            "https://registry.opentofu.org\nhttps://registry.terraform.io"
          }
          rows={4}
          disabled={isSaving}
          className="font-mono text-xs"
          aria-describedby="provider-registries-hint"
        />
        <p
          id="provider-registries-hint"
          className="text-xs text-muted-foreground"
        >
          One base URL per line. Tried in order when proxying provider requests.
          Leave empty to use defaults (OpenTofu, then Terraform).
        </p>
      </div>

      {/* Feedback + Save */}
      <div className="flex items-center justify-between gap-4 pt-2">
        <div className="flex-1">
          {error && (
            <div
              className="flex items-center gap-2 text-sm text-destructive"
              role="alert"
            >
              <AlertTriangle className="size-4 shrink-0" />
              {error}
            </div>
          )}
          {success && (
            <div
              className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400"
              role="status"
            >
              <CheckCircle2 className="size-4 shrink-0" />
              {success}
            </div>
          )}
        </div>
        <Button onClick={handleSave} disabled={isSaving || !isDirty} size="sm">
          {isSaving ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="size-4" />
              Save Changes
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
