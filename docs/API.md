# Stellaris API Reference

Complete API documentation for the Stellaris private Terraform/OpenTofu registry.

## Table of Contents

- [Authentication](#authentication)
- [Error Responses](#error-responses)
- [Service Discovery](#service-discovery)
- [Health Check](#health-check)
- [Module Registry Protocol](#module-registry-protocol)
  - [List Module Versions](#list-module-versions)
  - [Download Module](#download-module)
  - [Serve Module Tarball](#serve-module-tarball)
- [Provider Registry Protocol](#provider-registry-protocol)
  - [List Provider Versions](#list-provider-versions)
  - [Find Provider Package](#find-provider-package)
  - [Download Provider Zip](#download-provider-zip)
  - [SHA256SUMS](#sha256sums)
  - [SHA256SUMS Signature](#sha256sums-signature)
- [Extended API — Modules](#extended-api-modules)
  - [List Modules](#list-modules)
  - [Get Latest Module Version](#get-latest-module-version)
  - [Get Module Version](#get-module-version)
- [Extended API — Providers](#extended-api-providers)
  - [List Providers](#list-providers)
  - [Get Provider Version](#get-provider-version)
- [Publish API](#publish-api)
  - [Publish Contract Baseline](#publish-contract-baseline)
  - [Optimistic Concurrency (`If-Match`)](#optimistic-concurrency-if-match)
  - [Publish Modules Endpoints](#publish-modules-endpoints)
  - [Publish Providers Endpoints](#publish-providers-endpoints)
  - [Hard Delete Cleanup Contract](#hard-delete-cleanup-contract)
- [Admin API](#admin-api)
  - [Alias Behavior](#alias-behavior)
- [API Keys](#api-keys)
  - [Create API Key](#create-api-key)
  - [List API Keys](#list-api-keys)

---

## Authentication

Write operations (publish, delete, API key management) require an API key passed via the `Authorization` header:

```
Authorization: Bearer stlr_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2
```

API keys use the format `stlr_` followed by 40 hexadecimal characters. Keys are hashed with SHA-256 before storage — the plaintext key is only returned once at creation time.

Both `Bearer <key>` and raw `<key>` formats are accepted in the `Authorization` header.

Publishing lives under `/v1/publish/...` and needs the resource's write scope: `/v1/publish/modules/...` requires `modules:write`, `/v1/publish/providers/...` requires `providers:write`. Everything under `/v1/admin/...` (aliases, settings) and `/v1/api-keys` requires `admin`. An `admin` key satisfies every scope.

**Bootstrap mode:** When no API keys exist in the database, the `POST /v1/api-keys` endpoint allows unauthenticated access to create the first key.

Read endpoints (listing, downloading, searching) do not require authentication.

## Error Responses

All error responses follow a consistent format:

```json
{
  "errors": ["Human-readable error message"]
}
```

Multiple error messages may be returned for validation errors:

```json
{
  "errors": ["Invalid namespace format", "Invalid semver version"]
}
```

### Status Codes

| Code  | Meaning                                          |
| ----- | ------------------------------------------------ |
| `200` | Success                                          |
| `201` | Created (publish, key creation)                  |
| `204` | No Content (module download redirect, deletion)  |
| `400` | Bad Request (malformed input)                    |
| `401` | Unauthorized (missing or invalid API key)        |
| `403` | Forbidden (authenticated, but not authorized)    |
| `404` | Not Found                                        |
| `409` | Conflict (duplicate create or revision mismatch) |
| `422` | Validation Error (Zod schema failures)           |
| `500` | Internal Server Error                            |

---

## Service Discovery

### `GET /.well-known/terraform.json`

Terraform service discovery endpoint. Terraform CLI uses this to find the module and provider registry base paths.

**Authentication:** None

**Response** (`200`):

```json
{
  "modules.v1": "/v1/modules/",
  "providers.v1": "/v1/providers/"
}
```

**Reference:** [Terraform Remote Service Discovery](https://developer.hashicorp.com/terraform/internals/remote-service-discovery)

---

## Health Check

### `GET /health`

Simple health check endpoint.

**Authentication:** None

**Response** (`200`):

```json
{
  "status": "ok"
}
```

---

## Module Registry Protocol

These endpoints implement the [Terraform Module Registry Protocol](https://developer.hashicorp.com/terraform/internals/module-registry-protocol) so that `terraform init` works natively.

### List Module Versions

```
GET /v1/modules/:namespace/:name/:system/versions
```

List available versions for a specific module.

**Authentication:** None

**Path Parameters:**

| Parameter   | Type   | Description                            | Validation              |
| ----------- | ------ | -------------------------------------- | ----------------------- |
| `namespace` | string | Module namespace (e.g., `hashicorp`)   | 1-64 chars, `[a-z0-9-]` |
| `name`      | string | Module name (e.g., `consul`)           | 1-64 chars, `[a-z0-9-]` |
| `system`    | string | Target system / provider (e.g., `aws`) | 1-64 chars, `[a-z0-9-]` |

**Response** (`200`):

```json
{
  "modules": [
    {
      "source": "hashicorp/consul/aws",
      "versions": [
        { "version": "1.2.0" },
        { "version": "1.1.0" },
        { "version": "1.0.0" }
      ]
    }
  ]
}
```

**Error Responses:**

- `404` — Module not found
- `422` — Invalid path parameters

---

### Download Module

```
GET /v1/modules/:namespace/:name/:system/:version/download
```

Returns a `204 No Content` response with an `X-Terraform-Get` header pointing to the tarball URL. Terraform CLI reads this header to know where to download the module source.

**Authentication:** None

**Path Parameters:**

| Parameter   | Type   | Description                    | Validation              |
| ----------- | ------ | ------------------------------ | ----------------------- |
| `namespace` | string | Module namespace               | 1-64 chars, `[a-z0-9-]` |
| `name`      | string | Module name                    | 1-64 chars, `[a-z0-9-]` |
| `system`    | string | Target system / provider       | 1-64 chars, `[a-z0-9-]` |
| `version`   | string | Semver version (e.g., `1.0.0`) | Strict semver           |

**Response** (`204`):

```
HTTP/1.1 204 No Content
X-Terraform-Get: /v1/modules/tarball/modules/hashicorp/consul/aws/1.0.0.tar.gz
```

**Error Responses:**

- `404` — Module version not found
- `422` — Invalid path parameters

---

### Serve Module Tarball

```
GET /v1/modules/tarball/:path
```

Serves a module tarball directly from R2 storage. The `:path` is a catch-all that reconstructs the R2 object key from the URL segments.

**Authentication:** None

**Response** (`200`):

```
HTTP/1.1 200 OK
Content-Type: application/gzip
Content-Disposition: attachment; filename="1.0.0.tar.gz"

<binary tarball data>
```

This endpoint also increments the module's download counter (best-effort).

**Error Responses:**

- `404` — Tarball not found in R2

---

## Provider Registry Protocol

These endpoints implement the [Terraform Provider Registry Protocol](https://developer.hashicorp.com/terraform/internals/provider-registry-protocol).

### List Provider Versions

```
GET /v1/providers/:namespace/:type/versions
```

List available versions for a specific provider, including supported platforms for each version.

**Authentication:** None

**Path Parameters:**

| Parameter   | Type   | Description                        | Validation              |
| ----------- | ------ | ---------------------------------- | ----------------------- |
| `namespace` | string | Provider namespace (e.g., `myorg`) | 1-64 chars, `[a-z0-9-]` |
| `type`      | string | Provider type (e.g., `custom`)     | 1-64 chars, `[a-z0-9-]` |

**Response** (`200`):

```json
{
  "versions": [
    {
      "version": "1.0.0",
      "protocols": ["6.0"],
      "platforms": [
        { "os": "linux", "arch": "amd64" },
        { "os": "linux", "arch": "arm64" },
        { "os": "darwin", "arch": "arm64" }
      ]
    }
  ]
}
```

**Error Responses:**

- `404` — Provider not found
- `422` — Invalid path parameters

---

### Find Provider Package

```
GET /v1/providers/:namespace/:type/:version/download/:os/:arch
```

Returns full download metadata for a specific provider package, including the download URL, checksums, and GPG signing keys. Terraform CLI uses this response to download and verify the provider binary.

**Authentication:** None

**Path Parameters:**

| Parameter   | Type   | Description                                | Validation              |
| ----------- | ------ | ------------------------------------------ | ----------------------- |
| `namespace` | string | Provider namespace                         | 1-64 chars, `[a-z0-9-]` |
| `type`      | string | Provider type                              | 1-64 chars, `[a-z0-9-]` |
| `version`   | string | Semver version                             | Strict semver           |
| `os`        | string | Operating system (e.g., `linux`, `darwin`) | 1-32 chars, `[a-z0-9_]` |
| `arch`      | string | Architecture (e.g., `amd64`, `arm64`)      | 1-32 chars, `[a-z0-9_]` |

**Response** (`200`):

```json
{
  "protocols": ["6.0"],
  "os": "linux",
  "arch": "amd64",
  "filename": "terraform-provider-custom_1.0.0_linux_amd64.zip",
  "download_url": "/v1/providers/myorg/custom/1.0.0/download/linux/amd64/zip",
  "shasums_url": "/v1/providers/myorg/custom/1.0.0/sha256sums",
  "shasums_signature_url": "/v1/providers/myorg/custom/1.0.0/sha256sums.sig",
  "shasum": "abc123def456...",
  "signing_keys": {
    "gpg_public_keys": [
      {
        "key_id": "ABCD1234",
        "ascii_armor": "-----BEGIN PGP PUBLIC KEY BLOCK-----\n...\n-----END PGP PUBLIC KEY BLOCK-----",
        "source": "myorg",
        "source_url": "https://myorg.example.com/keys"
      }
    ]
  }
}
```

**Error Responses:**

- `404` — Provider version or platform not found
- `422` — Invalid path parameters

---

### Download Provider Zip

```
GET /v1/providers/:namespace/:type/:version/download/:os/:arch/zip
```

Serves the actual provider binary zip from R2 storage.

**Authentication:** None

**Path Parameters:** Same as [Find Provider Package](#find-provider-package).

**Response** (`200`):

```
HTTP/1.1 200 OK
Content-Type: application/zip
Content-Disposition: attachment; filename="terraform-provider-custom_1.0.0_linux_amd64.zip"

<binary zip data>
```

**Error Responses:**

- `404` — Provider binary not found in R2
- `422` — Invalid path parameters

---

### SHA256SUMS

```
GET /v1/providers/:namespace/:type/:version/sha256sums
```

Serves the SHA256SUMS file for a provider version.

**Authentication:** None

**Path Parameters:**

| Parameter   | Type   | Description        | Validation              |
| ----------- | ------ | ------------------ | ----------------------- |
| `namespace` | string | Provider namespace | 1-64 chars, `[a-z0-9-]` |
| `type`      | string | Provider type      | 1-64 chars, `[a-z0-9-]` |
| `version`   | string | Semver version     | Strict semver           |

**Response** (`200`):

```
HTTP/1.1 200 OK
Content-Type: text/plain

abc123...  terraform-provider-custom_1.0.0_linux_amd64.zip
def456...  terraform-provider-custom_1.0.0_darwin_arm64.zip
```

**Error Responses:**

- `404` — SHA256SUMS file not found
- `422` — Invalid path parameters

---

### SHA256SUMS Signature

```
GET /v1/providers/:namespace/:type/:version/sha256sums.sig
```

Serves the GPG signature file for the SHA256SUMS file.

**Authentication:** None

**Path Parameters:** Same as [SHA256SUMS](#sha256sums).

**Response** (`200`):

```
HTTP/1.1 200 OK
Content-Type: application/octet-stream
Content-Disposition: attachment; filename="myorg-custom_1.0.0_SHA256SUMS.sig"

<binary GPG signature data>
```

**Error Responses:**

- `404` — Signature file not found
- `422` — Invalid path parameters

---

## Extended API — Modules

These endpoints extend the standard Terraform protocol with listing, searching, publishing, and deletion capabilities.

### List Modules

```
GET /v1/modules
```

List and search modules with pagination and optional filters.

**Authentication:** None

**Query Parameters:**

| Parameter   | Type    | Default | Description                                                   |
| ----------- | ------- | ------- | ------------------------------------------------------------- |
| `offset`    | integer | `0`     | Pagination offset (0-based)                                   |
| `limit`     | integer | `15`    | Results per page (1-100)                                      |
| `q`         | string  | —       | Search term (matches module name, case-insensitive substring) |
| `namespace` | string  | —       | Filter by namespace (exact match)                             |
| `provider`  | string  | —       | Filter by provider/system (exact match)                       |

**Example:**

```bash
curl "https://stellaris.example.com/v1/modules?namespace=myorg&q=vpc&limit=10"
```

**Response** (`200`):

```json
{
  "meta": {
    "limit": 10,
    "current_offset": 0,
    "next_offset": 10,
    "total": 25
  },
  "modules": [
    {
      "id": "myorg/vpc/aws/1.2.0",
      "namespace": "myorg",
      "name": "vpc",
      "provider": "aws",
      "version": "1.2.0",
      "owner": "platform-team",
      "description": "Production VPC module",
      "source": "https://github.com/myorg/terraform-aws-vpc",
      "published_at": "2026-02-18T12:00:00.000Z",
      "downloads": 42,
      "tags": ["aws"]
    }
  ]
}
```

**Pagination:** When `next_offset` is not `null`, more results are available. Pass `next_offset` as the `offset` parameter to fetch the next page.

---

### Get Latest Module Version

```
GET /v1/modules/:namespace/:name/:system
```

Return metadata for the latest version of a module (most recently published).

**Authentication:** None

**Path Parameters:**

| Parameter   | Type   | Description              | Validation              |
| ----------- | ------ | ------------------------ | ----------------------- |
| `namespace` | string | Module namespace         | 1-64 chars, `[a-z0-9-]` |
| `name`      | string | Module name              | 1-64 chars, `[a-z0-9-]` |
| `system`    | string | Target system / provider | 1-64 chars, `[a-z0-9-]` |

**Response** (`200`):

```json
{
  "id": "myorg/vpc/aws/1.2.0",
  "namespace": "myorg",
  "name": "vpc",
  "provider": "aws",
  "version": "1.2.0",
  "owner": "platform-team",
  "description": "Production VPC module",
  "source": "https://github.com/myorg/terraform-aws-vpc",
  "published_at": "2026-02-18T12:00:00.000Z",
  "downloads": 42,
  "tags": ["aws"]
}
```

**Error Responses:**

- `404` — Module not found
- `422` — Invalid path parameters

---

### Get Module Version

```
GET /v1/modules/:namespace/:name/:system/:version
```

Return metadata for a specific module version.

**Authentication:** None

**Path Parameters:**

| Parameter   | Type   | Description              | Validation              |
| ----------- | ------ | ------------------------ | ----------------------- |
| `namespace` | string | Module namespace         | 1-64 chars, `[a-z0-9-]` |
| `name`      | string | Module name              | 1-64 chars, `[a-z0-9-]` |
| `system`    | string | Target system / provider | 1-64 chars, `[a-z0-9-]` |
| `version`   | string | Semver version           | Strict semver           |

**Response** (`200`):

```json
{
  "id": "myorg/vpc/aws/1.0.0",
  "namespace": "myorg",
  "name": "vpc",
  "provider": "aws",
  "version": "1.0.0",
  "owner": "platform-team",
  "description": "Production VPC module",
  "source": "https://github.com/myorg/terraform-aws-vpc",
  "published_at": "2026-01-15T09:30:00.000Z",
  "downloads": 128,
  "tags": ["aws"]
}
```

**Error Responses:**

- `404` — Module version not found
- `422` — Invalid path parameters

---

### Publishing and Deleting Modules

`POST` and `DELETE` on `/v1/modules/:namespace/:name/:system/:version` return `405`. Publish, replace, update and delete module versions through the [Publish API](#publish-modules-endpoints) with a `modules:write` key.

---

## Extended API — Providers

### List Providers

```
GET /v1/providers
```

List and search providers with pagination and optional filters.

**Authentication:** None

**Query Parameters:**

| Parameter   | Type    | Default | Description                                                     |
| ----------- | ------- | ------- | --------------------------------------------------------------- |
| `offset`    | integer | `0`     | Pagination offset (0-based)                                     |
| `limit`     | integer | `15`    | Results per page (1-100)                                        |
| `q`         | string  | —       | Search term (matches provider type, case-insensitive substring) |
| `namespace` | string  | —       | Filter by namespace (exact match)                               |
| `type`      | string  | —       | Filter by type (exact match)                                    |

**Example:**

```bash
curl "https://stellaris.example.com/v1/providers?namespace=myorg&limit=10"
```

**Response** (`200`):

```json
{
  "meta": {
    "limit": 10,
    "current_offset": 0,
    "next_offset": null,
    "total": 3
  },
  "providers": [
    {
      "id": "myorg/custom/1.0.0",
      "namespace": "myorg",
      "type": "custom",
      "version": "1.0.0",
      "protocols": ["6.0"],
      "published_at": "2026-02-18T12:00:00.000Z"
    }
  ]
}
```

---

### Get Provider Version

```
GET /v1/providers/:namespace/:type/:version
```

Return metadata for a specific provider version, including its available platforms.

**Authentication:** None

**Path Parameters:**

| Parameter   | Type   | Description        | Validation              |
| ----------- | ------ | ------------------ | ----------------------- |
| `namespace` | string | Provider namespace | 1-64 chars, `[a-z0-9-]` |
| `type`      | string | Provider type      | 1-64 chars, `[a-z0-9-]` |
| `version`   | string | Semver version     | Strict semver           |

**Response** (`200`):

```json
{
  "id": "myorg/custom/1.0.0",
  "namespace": "myorg",
  "type": "custom",
  "version": "1.0.0",
  "protocols": ["6.0"],
  "platforms": [
    { "os": "linux", "arch": "amd64" },
    { "os": "linux", "arch": "arm64" },
    { "os": "darwin", "arch": "arm64" }
  ],
  "published_at": "2026-02-18T12:00:00.000Z"
}
```

**Error Responses:**

- `404` — Provider version not found
- `422` — Invalid path parameters

---

### Publishing and Deleting Providers

`POST` and `DELETE` on `/v1/providers/:namespace/:type/:version` return `405`. Publish, update, upload platforms for and delete provider versions through the [Publish API](#publish-providers-endpoints) with a `providers:write` key.

---

## Publish API

Create, read (with revision), replace, update and delete module and provider versions. These are the endpoints CI uses to publish.

### Publish Contract Baseline

- Base path: `/v1/publish/...`
- Authorization: Bearer API key with `modules:write` (`/v1/publish/modules/...`) or `providers:write` (`/v1/publish/providers/...`); `admin` satisfies both
- Auditability: every successful write is expected to emit an immutable audit record
- Error profile: `401` unauthenticated, `403` missing scope, `404` not found, `409` conflict, `412` stale `If-Match`, `428` missing `If-Match`, `422` validation

### Optimistic Concurrency (`If-Match`)

Publish resources expose a `revision` value (returned as a weak `ETag`, e.g. `W/"3"`). Clients must:

1. Read current state (`GET`) and capture `revision`
2. Send `If-Match: <revision>` on required write operations
3. On `409`, re-read current state and retry with an updated `revision`

**Required `If-Match` operations:**

- Module `PUT`, `PATCH` and `DELETE`
- Provider `PATCH`, `DELETE`, and platform `PUT`

`If-Match` is mandatory for those endpoints. Missing or stale revisions are rejected with conflict semantics.

### Publish Modules Endpoints

| Operation             | Method + Path                                                               | Concurrency Requirement |
| --------------------- | --------------------------------------------------------------------------- | ----------------------- |
| Create version        | `POST /v1/publish/modules/{namespace}/{name}/{system}/versions`             | Not required            |
| Get version + ETag    | `GET /v1/publish/modules/{namespace}/{name}/{system}/versions/{version}`    | Not required            |
| Replace version bytes | `PUT /v1/publish/modules/{namespace}/{name}/{system}/versions/{version}`    | `If-Match` required     |
| Update version        | `PATCH /v1/publish/modules/{namespace}/{name}/{system}/versions/{version}`  | `If-Match` required     |
| Hard delete version   | `DELETE /v1/publish/modules/{namespace}/{name}/{system}/versions/{version}` | `If-Match` required     |

#### Create module version — `multipart/form-data`

| Field         | Type          | Required | Description                                                             |
| ------------- | ------------- | -------- | ----------------------------------------------------------------------- |
| `module`      | file          | **Yes**  | Module tarball (`.tar.gz`), max **50 MB**                               |
| `version`     | string        | **Yes**  | Semver version                                                          |
| `owner`       | string        | No       | Owner identifier                                                        |
| `description` | string        | No       | Module description                                                      |
| `source`      | string        | No       | Source URL                                                              |
| `tags`        | string (JSON) | No       | JSON array string of provider/system tags (e.g., `"[\"aws\",\"gcp\"]"`) |

`tags` is one multipart text field containing JSON, not repeated fields. For a module that targets several systems, publish it under the `multi` system and list the systems in `tags`:

```bash
curl -sS -D - -X POST \
  https://stellaris.example.com/v1/publish/modules/myorg/vpc/multi/versions \
  -H "Authorization: Bearer stlr_modules_write_key" \
  -F "module=@./module.tar.gz" \
  -F "version=1.0.0" \
  -F "owner=platform-team" \
  -F 'tags=["aws","gcp"]'
# → 201, header: ETag: W/"1"
```

**Error responses:** `400` missing/oversized `module` file or bad `tags` JSON · `401` unauthenticated · `403` key lacks `modules:write` · `409` version already exists · `422` validation failure.

### Publish Providers Endpoints

| Operation                | Method + Path                                                                           | Concurrency Requirement |
| ------------------------ | --------------------------------------------------------------------------------------- | ----------------------- |
| Create version           | `POST /v1/publish/providers/{namespace}/{type}/versions`                                | Not required            |
| Get version + ETag       | `GET /v1/publish/providers/{namespace}/{type}/versions/{version}`                       | Not required            |
| Update version           | `PATCH /v1/publish/providers/{namespace}/{type}/versions/{version}`                     | `If-Match` required     |
| Hard delete version      | `DELETE /v1/publish/providers/{namespace}/{type}/versions/{version}`                    | `If-Match` required     |
| Upsert platform artifact | `PUT /v1/publish/providers/{namespace}/{type}/versions/{version}/platforms/{os}/{arch}` | `If-Match` required     |

### Provider Byte Ingestion (multipart)

Both the create-version and platform-upsert endpoints accept **`multipart/form-data`** in addition to their existing `application/json` modes. The route branches on the `Content-Type` header. JSON mode remains the contract for externally-hosted artifacts (where each platform `location` points elsewhere); multipart mode ingests artifact bytes into R2.

> **Why per-platform uploads?** Cloudflare Workers caps the request body at ~100 MB. A full provider release (≈8 platforms × ≈30 MB ≈ 240 MB) cannot be uploaded in one request. The byte path is therefore **per-platform** — one zip (≤ **64 MB**, `MAX_PROVIDER_ZIP_SIZE`) per request — via the platform `PUT`.

#### Create version — `multipart/form-data` mode

```
POST /v1/publish/providers/{namespace}/{type}/versions
```

Creates the version row and uploads the version-level `SHA256SUMS` + `SHA256SUMS.sig` once. Platform zips are **not** uploaded here (size); the `platforms` list may be empty and is filled in by per-platform `PUT`s.

| Field             | Type          | Required | Description                                                              |
| ----------------- | ------------- | -------- | ------------------------------------------------------------------------ |
| `version`         | string        | **Yes**  | Semver version                                                           |
| `protocols`       | string (JSON) | **Yes**  | JSON array of Terraform protocol versions, e.g. `["6.0"]`                |
| `gpg_public_keys` | string (JSON) | **Yes**  | JSON array of GPG keys (`key_id`, `ascii_armor`, `source?`, `source_url?`) |
| `platforms`       | string (JSON) | No       | JSON array of platform metadata (defaults to `[]`)                       |
| `SHA256SUMS`      | file          | No       | Version-level SHA256SUMS file (uploaded to R2)                           |
| `SHA256SUMS.sig`  | file          | No       | GPG signature of `SHA256SUMS` (uploaded to R2)                           |

When `SHA256SUMS`/`SHA256SUMS.sig` are provided, their R2 keys are applied to any platform entries that do not already set `shasum_url`/`shasum_signature_url`.

**Error responses:** `400` malformed multipart / bad JSON in a field / non-file field where a file is expected · `409` version already exists · `422` schema validation failure · `401` unauthenticated.

#### Upsert platform artifact — `multipart/form-data` mode (primary byte path)

```
PUT /v1/publish/providers/{namespace}/{type}/versions/{version}/platforms/{os}/{arch}
```

Uploads one platform zip and upserts the platform row. **`If-Match` is required** (revision-based optimistic concurrency).

| Field            | Type | Required | Description                                                                |
| ---------------- | ---- | -------- | -------------------------------------------------------------------------- |
| `file`           | file | **Yes**  | Provider zip (≤ 64 MB). Its filename becomes the platform `filename`.      |
| `sha256sums`     | file | No       | SHA256SUMS file. A line matching `file`'s name overrides the computed sum. |
| `sha256sums_sig` | file | No       | GPG signature of the SHA256SUMS file.                                      |

The route computes the zip's SHA-256 (overridden by a matching `sha256sums` line when present), uploads the zip (and optional sums/sig) to R2, then upserts the platform with the new `location`, `shasum`, and `filename`. The `shasum_url` / `shasum_signature_url` columns are **only** overwritten when fresh `sha256sums` / `sha256sums_sig` files are supplied in this request; otherwise the existing version-level pointers are preserved (see [GPG verification chain](#gpg-verification-chain)). On a DB failure the uploaded R2 objects are cleaned up.

**Immutable Uploads gate.** Initial publish to an empty platform slot is always allowed. When the slot already holds artifact bytes (`location` set) **and** the Immutable Uploads system setting is ON (the default), the overwrite is rejected with `409` before any R2 work. With the setting OFF, the overwrite proceeds, the revision bumps, and the previous R2 object is deleted if (and only if) its key changed.

**Error responses:** `400` missing/oversized `file`, oversized `Content-Length`, or malformed multipart · `409` artifact bytes already exist and Immutable Uploads is enabled · `412` `If-Match` revision mismatch · `428` missing `If-Match` · `404` provider version not found · `422` invalid path parameters · `401` unauthenticated.

#### Replace module version bytes — `multipart/form-data`

```
PUT /v1/publish/modules/{namespace}/{name}/{system}/versions/{version}
```

Replaces an **existing** module version's tarball bytes (and optional metadata). This is the module analogue of the per-platform provider byte path — the CI re-push route. **`If-Match` is required.**

| Field         | Type          | Required | Description                                                          |
| ------------- | ------------- | -------- | -------------------------------------------------------------------- |
| `module`      | file          | **Yes**  | Module tarball (≤ `MAX_MODULE_SIZE`). Matches the create POST field. |
| `owner`       | string        | No       | Module owner                                                         |
| `description` | string        | No       | Module description                                                   |
| `source`      | string        | No       | Source URL                                                           |
| `tags`        | string (JSON) | No       | JSON array of tag strings                                            |

Order of operations: validate `If-Match` → confirm the version exists (`404` if not — use `POST .../versions` to create) → surface `412` on revision mismatch **before** any R2 work → check the Immutable Uploads gate. With the setting ON, the overwrite is rejected `409`. With it OFF, the new tarball is uploaded, `location`/metadata are updated, the revision bumps, and the old R2 object is deleted if its key changed. On a DB failure the just-uploaded object is cleaned up unless it overwrote the previous one in place.

**Error responses:** `400` missing/oversized `module` file, oversized `Content-Length`, malformed multipart, or bad `tags` JSON · `409` Immutable Uploads enabled and version already published · `412` `If-Match` revision mismatch · `428` missing `If-Match` · `404` version not found · `422` schema validation failure · `401` unauthenticated.

#### GPG verification chain

Terraform/OpenTofu verifies a downloaded provider as follows, and the registry must keep every link intact across byte replaces:

1. `GET /v1/providers/{ns}/{type}/{version}/download/{os}/{arch}` returns the platform `shasum`, the hardcoded `shasums_url` + `shasums_signature_url` (the version-level routes), and `signing_keys.gpg_public_keys[]`.
2. The CLI downloads the zip and checks its SHA-256 matches `shasum` and the matching line in `SHA256SUMS`.
3. The CLI downloads `SHA256SUMS.sig` and verifies it is a valid detached GPG signature over `SHA256SUMS` using one of the published `gpg_public_keys`.

The served `shasums_url` / `shasums_signature_url` are **version-level** (`.../sha256sums`, `.../sha256sums.sig`), backed by the fixed R2 keys `providers/{ns}/{type}/{version}/SHA256SUMS[.sig]` uploaded once at create-version time. They do not depend on the per-platform `shasum_url` columns. Per-platform byte replaces therefore preserve those columns rather than null them, so the GPG chain remains valid whether a release is published in one shot or platform-by-platform.

#### End-to-end publish via curl (`providers:write` API key only)

```bash
BASE=https://stellaris.example.com
KEY=stlr_providers_write_key
NS=evilcorp; TYPE=cloudflare; VER=5.19.1-beta.1

# 1) Create the version (multipart) — uploads SHA256SUMS + signature, no zips yet.
#    Capture the ETag (revision) from the response headers.
curl -sS -D - -o /dev/null -X POST \
  "$BASE/v1/publish/providers/$NS/$TYPE/versions" \
  -H "Authorization: Bearer $KEY" \
  -F "version=$VER" \
  -F 'protocols=["5.0"]' \
  -F 'gpg_public_keys=[{"key_id":"D3C430BB730839CA150E2DD0897EBB1F03A45650","ascii_armor":"-----BEGIN PGP PUBLIC KEY BLOCK-----\n...\n-----END PGP PUBLIC KEY BLOCK-----","source":"evilcorp"}]' \
  -F "SHA256SUMS=@./dist/_SHA256SUMS" \
  -F "SHA256SUMS.sig=@./dist/_SHA256SUMS.sig"
# → 201, header: ETag: W/"1"

# Alternatively create-version via JSON (externally-hosted artifacts):
#   -H 'Content-Type: application/json' -d '{ "version": "...", "protocols": [...], "platforms": [...], "gpg_public_keys": [...] }'

# 2) Upload each platform zip with the current revision via If-Match.
#    Re-read the ETag after each PUT (revision bumps each time).
curl -sS -D - -o /dev/null -X PUT \
  "$BASE/v1/publish/providers/$NS/$TYPE/versions/$VER/platforms/linux/amd64" \
  -H "Authorization: Bearer $KEY" \
  -H 'If-Match: W/"1"' \
  -F "file=@./dist/terraform-provider-${TYPE}_${VER}_linux_amd64.zip"
# → 200, header: ETag: W/"2"

curl -sS -D - -o /dev/null -X PUT \
  "$BASE/v1/publish/providers/$NS/$TYPE/versions/$VER/platforms/darwin/arm64" \
  -H "Authorization: Bearer $KEY" \
  -H 'If-Match: W/"2"' \
  -F "file=@./dist/terraform-provider-${TYPE}_${VER}_darwin_arm64.zip"
# → 200, header: ETag: W/"3"  (repeat for remaining platforms)
```

### Hard Delete Cleanup Contract

- Hard delete removes the canonical metadata for the target version.
- Associated aliases for that target version are removed as part of the delete contract.
- Artifact cleanup is part of the same operation contract:
  - Modules: remove version tarball artifacts
  - Providers: remove platform zip artifacts plus `SHA256SUMS` and `SHA256SUMS.sig`
- Delete is fail-closed for cleanup confirmation: metadata deletion only succeeds when cleanup contract succeeds; otherwise the request must fail.

### Concurrency Example (`409` Recovery)

```bash
# 1) Read the current version and capture its revision (ETag)
curl -sS -D - \
  -H "Authorization: Bearer stlr_modules_write_key" \
  https://stellaris.example.com/v1/publish/modules/myorg/vpc/aws/versions/1.2.0

# 2) Patch with If-Match
curl -X PATCH \
  -H "Authorization: Bearer stlr_modules_write_key" \
  -H 'If-Match: W/"42"' \
  -H "Content-Type: application/json" \
  -d '{"deprecation":{"deprecated":true,"message":"Use 2.x"}}' \
  https://stellaris.example.com/v1/publish/modules/myorg/vpc/aws/versions/1.2.0

# 3) If response is 409, re-read and retry using latest revision
```

---

## Admin API

Administrative endpoints only. Every route under `/v1/admin/...` requires a key with `admin` permission; `modules:write` and `providers:write` keys get `403`.

| Operation                      | Method + Path                      |
| ------------------------------ | ---------------------------------- |
| Create module alias            | `POST /v1/admin/modules/aliases`   |
| Create provider alias          | `POST /v1/admin/providers/aliases` |
| Read upstream proxy settings   | `GET /v1/admin/settings/proxy`     |
| Update upstream proxy settings | `PATCH /v1/admin/settings/proxy`   |

### Alias Behavior

- Rename behavior is implemented through alias creation endpoints only.
- Old identifiers resolve to canonical resources through existing read/discovery paths:
  - Modules: `GET /v1/modules/{namespace}/{name}/{system}/versions`
  - Providers: `GET /v1/providers/{namespace}/{type}/versions`
- Alias targets must be canonical identities.
- Alias chains/loops are invalid and must be rejected.

---

## API Keys

### Create API Key

```
POST /v1/api-keys
```

Create a new API key. The plaintext key is only returned in this response — store it securely.

**Authentication:** Required (unless no keys exist — see bootstrap mode below).

**Bootstrap mode:** If the `api_keys` table is empty (no keys have been created yet), this endpoint allows unauthenticated access. This lets you create the initial admin key on a fresh deployment.

**Request Body:** `application/json`

| Field         | Type     | Required | Description                                           |
| ------------- | -------- | -------- | ----------------------------------------------------- |
| `name`        | string   | **Yes**  | Human-readable name for the key                       |
| `description` | string   | No       | Description of the key's purpose                      |
| `permissions` | string[] | No       | Permission scopes: `admin`, `modules:read`, `modules:write`, `providers:read`, `providers:write`. Defaults to `["admin"]` |
| `expires_at`  | string   | No       | Expiration date in ISO 8601 format                    |

**Example (bootstrap — no auth needed):**

```bash
curl -X POST https://stellaris.example.com/v1/api-keys \
  -H "Content-Type: application/json" \
  -d '{
    "name": "admin",
    "description": "Initial admin key"
  }'
```

**Example (with auth):**

```bash
curl -X POST https://stellaris.example.com/v1/api-keys \
  -H "Authorization: Bearer stlr_your_existing_key" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ci-pipeline",
    "description": "Key for CI/CD publishing",
    "permissions": ["modules:write", "providers:write"],
    "expires_at": "2027-01-01T00:00:00.000Z"
  }'
```

**Response** (`201`):

```json
{
  "key": "stlr_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
  "id": 1,
  "name": "admin",
  "description": "Initial admin key",
  "permissions": null,
  "created_at": "2026-02-18T12:00:00.000Z",
  "expires_at": null
}
```

> **Important:** The `key` field contains the plaintext API key. It is only returned once — on creation. Store it securely. Stellaris only stores the SHA-256 hash.

**Error Responses:**

- `400` — Invalid request body
- `401` — Missing or invalid API key (when keys already exist)

---

### List API Keys

```
GET /v1/api-keys
```

List all API keys. Returns metadata only — never returns key hashes or plaintext keys.

**Authentication:** Required

**Example:**

```bash
curl https://stellaris.example.com/v1/api-keys \
  -H "Authorization: Bearer stlr_your_api_key"
```

**Response** (`200`):

```json
{
  "keys": [
    {
      "id": 1,
      "name": "admin",
      "description": "Initial admin key",
      "permissions": null,
      "created_at": "2026-02-18T12:00:00.000Z",
      "last_used_at": "2026-02-18T14:30:00.000Z",
      "expires_at": null
    },
    {
      "id": 2,
      "name": "ci-pipeline",
      "description": "Key for CI/CD publishing",
      "permissions": ["modules:write", "providers:write"],
      "created_at": "2026-02-18T13:00:00.000Z",
      "last_used_at": null,
      "expires_at": "2027-01-01T00:00:00.000Z"
    }
  ]
}
```

**Error Responses:**

- `401` — Missing or invalid API key

---

## Input Validation

All path parameters and request bodies are validated using [Zod](https://zod.dev/) schemas defined in `lib/validation/registry.ts`.

### Naming Conventions

| Type              | Pattern                         | Length | Examples                         |
| ----------------- | ------------------------------- | ------ | -------------------------------- |
| Namespace         | `[a-z0-9]([a-z0-9-]*[a-z0-9])?` | 1-64   | `hashicorp`, `my-org`            |
| Name              | `[a-z0-9]([a-z0-9-]*[a-z0-9])?` | 1-64   | `consul`, `vpc-module`           |
| Provider / System | `[a-z0-9]([a-z0-9-]*[a-z0-9])?` | 1-64   | `aws`, `google-cloud`            |
| Type              | `[a-z0-9]([a-z0-9-]*[a-z0-9])?` | 1-64   | `custom`, `null`                 |
| Version           | Strict semver                   | —      | `1.0.0`, `2.1.0-beta.1+build.42` |
| OS                | `[a-z0-9_]+`                    | 1-32   | `linux`, `darwin`, `windows`     |
| Arch              | `[a-z0-9_]+`                    | 1-32   | `amd64`, `arm64`, `386`          |

- Names must start and end with an alphanumeric character (no leading/trailing hyphens).
- Version strings must be valid [Semantic Versioning 2.0.0](https://semver.org/), including optional pre-release and build metadata.
