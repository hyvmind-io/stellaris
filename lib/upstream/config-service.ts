import {
  getSystemSetting,
  setSystemSetting,
  deleteSystemSetting,
} from "@/lib/data/settings";
import {
  SETTINGS_KEY,
  resolveModuleRegistries,
  resolveProviderRegistries,
  isModuleProxyEnabled,
  isProviderProxyEnabled,
  normaliseRegistryUrl,
} from "@/lib/upstream/config";

export interface ProxySettings {
  module_proxy_enabled: boolean;
  provider_proxy_enabled: boolean;
  module_upstream_registries: string[];
  provider_upstream_registries: string[];
}

export interface ProxySettingsOverrides {
  module_proxy_enabled: string | null;
  provider_proxy_enabled: string | null;
  module_upstream_registries: unknown;
  provider_upstream_registries: unknown;
}

export interface ProxySettingsSnapshot extends ProxySettings {
  overrides?: ProxySettingsOverrides;
}

export interface UpdateProxySettingsInput {
  module_proxy_enabled?: boolean;
  provider_proxy_enabled?: boolean;
  /**
   * Semantics:
   * - `undefined`: leave unchanged
   * - `null`: clear DB override (use env/defaults)
   * - `[]`: explicit disable (no upstream fallback)
   * - non-empty list: explicit ordered upstreams
   */
  module_upstream_registries?: string[] | null;
  /**
   * Semantics:
   * - `undefined`: leave unchanged
   * - `null`: clear DB override (use env/defaults)
   * - `[]`: explicit disable (no upstream fallback)
   * - non-empty list: explicit ordered upstreams
   */
  provider_upstream_registries?: string[] | null;
}

interface ProxySettingsSnapshotOptions {
  includeOverrides?: boolean;
}

export async function getProxySettingsSnapshot(
  options: ProxySettingsSnapshotOptions = {},
): Promise<ProxySettingsSnapshot> {
  const [moduleEnabled, providerEnabled, moduleRegistries, providerRegistries] =
    await Promise.all([
      isModuleProxyEnabled(),
      isProviderProxyEnabled(),
      resolveModuleRegistries(),
      resolveProviderRegistries(),
    ]);

  if (!options.includeOverrides) {
    return {
      module_proxy_enabled: moduleEnabled,
      provider_proxy_enabled: providerEnabled,
      module_upstream_registries: moduleRegistries,
      provider_upstream_registries: providerRegistries,
    };
  }

  const [
    dbModuleEnabled,
    dbProviderEnabled,
    dbModuleRegistries,
    dbProviderRegistries,
  ] = await Promise.all([
    getSystemSetting(SETTINGS_KEY.moduleProxyEnabled),
    getSystemSetting(SETTINGS_KEY.providerProxyEnabled),
    getSystemSetting(SETTINGS_KEY.moduleRegistries),
    getSystemSetting(SETTINGS_KEY.providerRegistries),
  ]);

  return {
    module_proxy_enabled: moduleEnabled,
    provider_proxy_enabled: providerEnabled,
    module_upstream_registries: moduleRegistries,
    provider_upstream_registries: providerRegistries,
    overrides: {
      module_proxy_enabled: dbModuleEnabled ?? null,
      provider_proxy_enabled: dbProviderEnabled ?? null,
      module_upstream_registries: dbModuleRegistries
        ? safeParseJson(dbModuleRegistries)
        : null,
      provider_upstream_registries: dbProviderRegistries
        ? safeParseJson(dbProviderRegistries)
        : null,
    },
  };
}

export async function updateProxySettings(
  data: UpdateProxySettingsInput,
  options: ProxySettingsSnapshotOptions = {},
): Promise<ProxySettingsSnapshot> {
  const updates: Promise<void>[] = [];

  if (data.module_proxy_enabled !== undefined) {
    updates.push(
      setSystemSetting(
        SETTINGS_KEY.moduleProxyEnabled,
        String(data.module_proxy_enabled),
      ),
    );
  }

  if (data.provider_proxy_enabled !== undefined) {
    updates.push(
      setSystemSetting(
        SETTINGS_KEY.providerProxyEnabled,
        String(data.provider_proxy_enabled),
      ),
    );
  }

  if (data.module_upstream_registries !== undefined) {
    if (data.module_upstream_registries === null) {
      updates.push(deleteSystemSetting(SETTINGS_KEY.moduleRegistries));
    } else {
      const normalised = normaliseRegistryOverride(
        data.module_upstream_registries,
        "module_upstream_registries",
      );
      updates.push(
        setSystemSetting(
          SETTINGS_KEY.moduleRegistries,
          JSON.stringify(normalised),
        ),
      );
    }
  }

  if (data.provider_upstream_registries !== undefined) {
    if (data.provider_upstream_registries === null) {
      updates.push(deleteSystemSetting(SETTINGS_KEY.providerRegistries));
    } else {
      const normalised = normaliseRegistryOverride(
        data.provider_upstream_registries,
        "provider_upstream_registries",
      );
      updates.push(
        setSystemSetting(
          SETTINGS_KEY.providerRegistries,
          JSON.stringify(normalised),
        ),
      );
    }
  }

  await Promise.all(updates);
  return getProxySettingsSnapshot(options);
}

function normaliseRegistryOverride(
  urls: string[],
  fieldName: string,
): string[] {
  const seen = new Set<string>();
  const normalised: string[] = [];

  for (const raw of urls) {
    const value = normaliseRegistryUrl(raw);
    if (!value) {
      throw new Error(
        `${fieldName} contains an invalid URL. Only HTTPS upstream URLs are allowed.`,
      );
    }

    if (!seen.has(value)) {
      seen.add(value);
      normalised.push(value);
    }
  }

  return normalised;
}

function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
