/**
 * Upstream proxy client — forwards read/query/download requests to upstream
 * Terraform/OpenTofu registries when the local registry returns 404.
 *
 * Only used for GET (read) endpoints. Write/delete operations are never proxied.
 *
 * The proxy tries each upstream in the configured order and returns the first
 * successful response (2xx). Non-2xx or network errors cause a skip to the
 * next upstream. If all upstreams fail, returns null.
 */

import {
  isModuleProxyEnabled,
  isProviderProxyEnabled,
  resolveModuleRegistries,
  resolveProviderRegistries,
} from "./config";

// ============================================================================
// Types
// ============================================================================

export interface UpstreamResponse {
  status: number;
  headers: Headers;
  body: ReadableStream<Uint8Array> | null;
  /** The upstream base URL that served this response. */
  upstream: string;
}

// ============================================================================
// Module Proxy
// ============================================================================

/**
 * Proxy a module request to upstream registries.
 * @param path — Registry API path, e.g. "/v1/modules/hashicorp/consul/aws/versions"
 * @returns The upstream response, or null if all upstreams 404/fail.
 */
export async function proxyModuleRequest(
  path: string,
): Promise<UpstreamResponse | null> {
  const enabled = await isModuleProxyEnabled();
  if (!enabled) return null;

  const registries = await resolveModuleRegistries();
  return proxyToUpstreams(registries, path);
}

/**
 * Proxy a module request and return the parsed JSON body.
 * Convenience wrapper for JSON APIs.
 */
export async function proxyModuleJson<T = unknown>(
  path: string,
): Promise<{ data: T; upstream: string } | null> {
  const resp = await proxyModuleRequest(path);
  if (!resp) return null;

  try {
    const text = resp.body ? await new Response(resp.body).text() : "";
    const data = JSON.parse(text) as T;
    return { data, upstream: resp.upstream };
  } catch {
    return null;
  }
}

// ============================================================================
// Provider Proxy
// ============================================================================

/**
 * Proxy a provider request to upstream registries.
 * @param path — Registry API path, e.g. "/v1/providers/hashicorp/aws/versions"
 */
export async function proxyProviderRequest(
  path: string,
): Promise<UpstreamResponse | null> {
  const enabled = await isProviderProxyEnabled();
  if (!enabled) return null;

  const registries = await resolveProviderRegistries();
  return proxyToUpstreams(registries, path);
}

/**
 * Proxy a provider request and return the parsed JSON body.
 */
export async function proxyProviderJson<T = unknown>(
  path: string,
): Promise<{ data: T; upstream: string } | null> {
  const resp = await proxyProviderRequest(path);
  if (!resp) return null;

  try {
    const text = resp.body ? await new Response(resp.body).text() : "";
    const data = JSON.parse(text) as T;
    return { data, upstream: resp.upstream };
  } catch {
    return null;
  }
}

// ============================================================================
// Internal
// ============================================================================

const PROXY_TIMEOUT_MS = 10_000; // 10 seconds per upstream attempt

async function proxyToUpstreams(
  registries: string[],
  path: string,
): Promise<UpstreamResponse | null> {
  for (const base of registries) {
    try {
      const url = `${base}${path}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);

      const resp = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "Stellaris-Registry-Proxy/1.0",
        },
        signal: controller.signal,
        redirect: "follow",
      });

      clearTimeout(timer);

      if (resp.ok) {
        return {
          status: resp.status,
          headers: resp.headers,
          body: resp.body,
          upstream: base,
        };
      }

      // Non-2xx — skip to next upstream
    } catch {
      // Network error / timeout — skip to next upstream
    }
  }

  return null;
}
