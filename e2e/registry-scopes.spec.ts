import { expect, test, type APIRequestContext } from "@playwright/test";
import { E2E_API_KEYS } from "./config";

// Bearer-only API calls; no browser session.
test.use({ storageState: { cookies: [], origins: [] } });

type KeyName = keyof typeof E2E_API_KEYS;

const bearer = (name: KeyName) => ({
  Authorization: `Bearer ${E2E_API_KEYS[name].key}`,
});

const MODULE_PATH = "/v1/publish/modules/acme/scope-check/aws";
const PROVIDER_PATH = "/v1/publish/providers/acme/scopecheck";

function publishModule(api: APIRequestContext, key: KeyName, version: string) {
  return api.post(`${MODULE_PATH}/versions`, {
    headers: bearer(key),
    multipart: {
      version,
      module: { name: "module.tar.gz", mimeType: "application/gzip", buffer: Buffer.from("e2e") },
    },
  });
}

function publishProvider(api: APIRequestContext, key: KeyName, version: string) {
  return api.post(`${PROVIDER_PATH}/versions`, {
    headers: bearer(key),
    data: {
      version,
      protocols: ["6.0"],
      platforms: [
        {
          os: "linux",
          arch: "amd64",
          filename: `terraform-provider-scopecheck_${version}_linux_amd64.zip`,
          shasum: "0".repeat(64),
          location: "https://example.com/provider.zip",
        },
      ],
      gpg_public_keys: [{ key_id: "ABCDEF0123456789", ascii_armor: "armor" }],
    },
  });
}

test("modules:write publishes, reads and deletes modules only", async ({ request }) => {
  expect((await publishModule(request, "providersWrite", "1.0.0")).status()).toBe(403);
  expect((await publishModule(request, "readOnly", "1.0.0")).status()).toBe(403);
  expect((await publishModule(request, "modulesWrite", "1.0.0")).status()).toBe(201);
  expect((await publishModule(request, "admin", "1.1.0")).status()).toBe(201);

  const version = await request.get(`${MODULE_PATH}/versions/1.0.0`, {
    headers: bearer("modulesWrite"),
  });
  expect(version.status()).toBe(200);
  const etag = version.headers()["etag"] ?? "";
  expect(etag).toMatch(/^W\/"\d+"$/);

  const denied = await request.delete(`${MODULE_PATH}/versions/1.0.0`, {
    headers: { ...bearer("providersWrite"), "If-Match": etag },
  });
  expect(denied.status()).toBe(403);

  const deleted = await request.delete(`${MODULE_PATH}/versions/1.0.0`, {
    headers: { ...bearer("modulesWrite"), "If-Match": etag },
  });
  expect(deleted.status()).toBe(204);

  const adminVersion = await request.get(`${MODULE_PATH}/versions/1.1.0`, { headers: bearer("admin") });
  const cleanup = await request.delete(`${MODULE_PATH}/versions/1.1.0`, {
    headers: { ...bearer("admin"), "If-Match": adminVersion.headers()["etag"] ?? "" },
  });
  expect(cleanup.status()).toBe(204);
});

test("providers:write publishes providers only", async ({ request }) => {
  expect((await publishProvider(request, "modulesWrite", "1.0.0")).status()).toBe(403);
  expect((await publishProvider(request, "readOnly", "1.0.0")).status()).toBe(403);
  expect((await publishProvider(request, "providersWrite", "1.0.0")).status()).toBe(201);

  const version = await request.get(`${PROVIDER_PATH}/versions/1.0.0`, {
    headers: bearer("providersWrite"),
  });
  expect(version.status()).toBe(200);
});

test("write scopes cannot use /v1/admin, API keys or settings", async ({ request }) => {
  const alias = {
    source_namespace: "acme",
    source_name: "old-zone",
    source_provider: "cloudflare",
    target_namespace: "acme",
    target_name: "cloudflare-zone",
    target_provider: "cloudflare",
  };

  for (const key of ["modulesWrite", "providersWrite"] as const) {
    const headers = bearer(key);
    expect((await request.get("/v1/api-keys", { headers })).status()).toBe(403);
    expect(
      (await request.post("/v1/api-keys", { headers, data: { name: "escalate", permissions: ["admin"] } })).status(),
    ).toBe(403);
    expect((await request.get("/v1/admin/settings/proxy", { headers })).status()).toBe(403);
    expect(
      (await request.patch("/v1/admin/settings/proxy", { headers, data: { module_upstream_enabled: true } })).status(),
    ).toBe(403);
    expect((await request.post("/v1/admin/modules/aliases", { headers, data: alias })).status()).toBe(403);
  }

  const admin = bearer("admin");
  expect((await request.get("/v1/api-keys", { headers: admin })).status()).toBe(200);
  expect((await request.get("/v1/admin/settings/proxy", { headers: admin })).status()).toBe(200);
  expect((await request.post("/v1/admin/modules/aliases", { headers: admin, data: alias })).status()).toBe(201);
});

test("publish routes no longer exist under /v1/admin", async ({ request }) => {
  const headers = bearer("admin");
  expect((await request.get("/v1/admin/modules/acme/cloudflare-zone/cloudflare/versions/1.0.1", { headers })).status()).toBe(404);
  expect((await request.post("/v1/admin/providers/acme/cloudflare/versions", { headers, data: {} })).status()).toBe(404);
});
