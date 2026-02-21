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
- [Extended API — Modules](#extended-api--modules)
  - [List Modules](#list-modules)
  - [Get Latest Module Version](#get-latest-module-version)
  - [Get Module Version](#get-module-version)
  - [Publish Module](#publish-module)
  - [Delete Module Version](#delete-module-version)
- [Extended API — Providers](#extended-api--providers)
  - [List Providers](#list-providers)
  - [Get Provider Version](#get-provider-version)
  - [Publish Provider](#publish-provider)
  - [Delete Provider Version](#delete-provider-version)
- [Admin API — Registry CRUD](#admin-api--registry-crud)
  - [Admin Contract Baseline](#admin-contract-baseline)
  - [Optimistic Concurrency (`If-Match`)](#optimistic-concurrency-if-match)
  - [Admin Modules Endpoints](#admin-modules-endpoints)
  - [Admin Providers Endpoints](#admin-providers-endpoints)
  - [Alias Behavior](#alias-behavior)
  - [Hard Delete Cleanup Contract](#hard-delete-cleanup-contract)
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

Admin endpoints under `/v1/admin/...` also require a valid API key with `admin` permission.

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

### Publish Module

```
POST /v1/modules/:namespace/:name/:system/:version
```

Publish a new module version. The module tarball is uploaded to R2 and metadata is stored in D1.

**Authentication:** Required

**Path Parameters:**

| Parameter   | Type   | Description              | Validation              |
| ----------- | ------ | ------------------------ | ----------------------- |
| `namespace` | string | Module namespace         | 1-64 chars, `[a-z0-9-]` |
| `name`      | string | Module name              | 1-64 chars, `[a-z0-9-]` |
| `system`    | string | Target system / provider | 1-64 chars, `[a-z0-9-]` |
| `version`   | string | Semver version           | Strict semver           |

**Request Body:** `multipart/form-data`

| Field    | Type   | Required | Description                                                             |
| -------- | ------ | -------- | ----------------------------------------------------------------------- |
| `module` | file   | **Yes**  | Module tarball (`.tar.gz`), max **50 MB**                               |
| `owner`  | string | No       | Owner identifier (defaults to empty string)                             |
| `tags`   | string | No       | JSON array string of provider/system tags (e.g., `"[\"aws\",\"gcp\"]"`) |

`tags` must be sent as a multipart text field containing JSON (not as repeated fields). Example value: `-F 'tags=["aws","gcp"]'`.

**Example (single-system):**

```bash
curl -X POST https://stellaris.example.com/v1/modules/myorg/vpc/aws/1.0.0 \
  -H "Authorization: Bearer stlr_your_api_key" \
  -F "module=@./module.tar.gz" \
  -F "owner=platform-team" \
  -F 'tags=["aws"]'
```

**Example (multi-system with canonical `multi` keyword):**

```bash
curl -X POST https://stellaris.example.com/v1/modules/myorg/vpc/multi/1.0.0 \
  -H "Authorization: Bearer stlr_your_api_key" \
  -F "module=@./module.tar.gz" \
  -F "owner=platform-team" \
  -F 'tags=["aws","gcp"]'
```

**Response** (`201`):

```json
{
  "id": "myorg/vpc/aws/1.0.0",
  "namespace": "myorg",
  "name": "vpc",
  "provider": "aws",
  "version": "1.0.0",
  "owner": "platform-team",
  "published_at": "2026-02-18T12:00:00.000Z",
  "downloads": 0,
  "tags": ["aws"]
}
```

**Error Responses:**

- `400` — Missing `module` file in form data, or tarball exceeds 50 MB size limit
- `401` — Missing or invalid API key
- `409` — Module version already exists
- `422` — Invalid path parameters

---

### Delete Module Version

```
DELETE /v1/modules/:namespace/:name/:system/:version
```

Delete a specific module version. Removes the metadata from D1 and the tarball from R2.

**Authentication:** Required

**Path Parameters:** Same as [Publish Module](#publish-module).

**Example:**

```bash
curl -X DELETE https://stellaris.example.com/v1/modules/myorg/vpc/aws/1.0.0 \
  -H "Authorization: Bearer stlr_your_api_key"
```

**Response** (`204`): No content.

**Error Responses:**

- `401` — Missing or invalid API key
- `404` — Module version not found
- `422` — Invalid path parameters

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

### Publish Provider

```
POST /v1/providers/:namespace/:type/:version
```

Publish a new provider version with platform binaries, SHA256 checksums, and GPG signing keys. All artifacts are uploaded to R2 and metadata is stored in D1 within a single transaction.

Provider uploads do **not** support a `tags` field. To express compatibility, define each target in `data.platforms`.

**Authentication:** Required

**Path Parameters:**

| Parameter   | Type   | Description        | Validation              |
| ----------- | ------ | ------------------ | ----------------------- |
| `namespace` | string | Provider namespace | 1-64 chars, `[a-z0-9-]` |
| `type`      | string | Provider type      | 1-64 chars, `[a-z0-9-]` |
| `version`   | string | Semver version     | Strict semver           |

**Request Body:** `multipart/form-data`

| Field            | Type          | Required               | Description                                                                                                                 |
| ---------------- | ------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `data`           | string (JSON) | **Yes**                | Provider metadata (see schema below)                                                                                        |
| `SHA256SUMS`     | file          | **Yes**                | SHA256 checksums file                                                                                                       |
| `SHA256SUMS.sig` | file          | **Yes**                | GPG signature of the SHA256SUMS file                                                                                        |
| `<filename>.zip` | file          | **Yes** (per platform) | Provider binary zip (max **64 MB** each) — one per platform, field name must match `filename` in the `data.platforms` array |

**`data` field JSON schema:**

```json
{
  "protocols": ["6.0"],
  "platforms": [
    {
      "os": "linux",
      "arch": "amd64",
      "shasum": "abc123def456...",
      "filename": "terraform-provider-custom_1.0.0_linux_amd64.zip"
    }
  ],
  "gpg_public_keys": [
    {
      "key_id": "ABCD1234",
      "ascii_armor": "-----BEGIN PGP PUBLIC KEY BLOCK-----\n...\n-----END PGP PUBLIC KEY BLOCK-----",
      "source": "myorg",
      "source_url": "https://myorg.example.com/keys"
    }
  ]
}
```

| Field                           | Type     | Required | Description                                           |
| ------------------------------- | -------- | -------- | ----------------------------------------------------- |
| `protocols`                     | string[] | **Yes**  | Supported Terraform protocol versions (min 1)         |
| `platforms`                     | object[] | **Yes**  | Platform entries (min 1)                              |
| `platforms[].os`                | string   | **Yes**  | Operating system (e.g., `linux`, `darwin`, `windows`) |
| `platforms[].arch`              | string   | **Yes**  | Architecture (e.g., `amd64`, `arm64`, `386`)          |
| `platforms[].shasum`            | string   | **Yes**  | SHA256 checksum of the zip file                       |
| `platforms[].filename`          | string   | **Yes**  | Filename of the zip file (must match a form field)    |
| `gpg_public_keys`               | object[] | **Yes**  | GPG signing keys (min 1)                              |
| `gpg_public_keys[].key_id`      | string   | **Yes**  | GPG key ID                                            |
| `gpg_public_keys[].ascii_armor` | string   | **Yes**  | ASCII-armored GPG public key                          |
| `gpg_public_keys[].source`      | string   | No       | Key source (defaults to empty string)                 |
| `gpg_public_keys[].source_url`  | string   | No       | URL to the key source                                 |

**Example:**

```bash
curl -X POST https://stellaris.example.com/v1/providers/myorg/custom/1.0.0 \
  -H "Authorization: Bearer stlr_your_api_key" \
  -F 'data={
    "protocols": ["6.0"],
    "platforms": [
      {
        "os": "linux",
        "arch": "amd64",
        "shasum": "abc123...",
        "filename": "terraform-provider-custom_1.0.0_linux_amd64.zip"
      }
    ],
    "gpg_public_keys": [
      {
        "key_id": "ABCD1234",
        "ascii_armor": "-----BEGIN PGP PUBLIC KEY BLOCK-----\n...\n-----END PGP PUBLIC KEY BLOCK-----",
        "source": "myorg"
      }
    ]
  }' \
  -F "terraform-provider-custom_1.0.0_linux_amd64.zip=@./terraform-provider-custom_1.0.0_linux_amd64.zip" \
  -F "SHA256SUMS=@./SHA256SUMS" \
  -F "SHA256SUMS.sig=@./SHA256SUMS.sig"
```

**Response** (`201`):

```json
{
  "id": "myorg/custom/1.0.0",
  "namespace": "myorg",
  "type": "custom",
  "version": "1.0.0",
  "protocols": ["6.0"],
  "platforms": [{ "os": "linux", "arch": "amd64" }],
  "published_at": "2026-02-18T12:00:00.000Z"
}
```

**Error Responses:**

- `400` — Missing required files, invalid JSON in `data` field, or zip exceeds 64 MB size limit
- `401` — Missing or invalid API key
- `409` — Provider version already exists
- `422` — Validation error in `data` field or path parameters

---

### Delete Provider Version

```
DELETE /v1/providers/:namespace/:type/:version
```

Delete a specific provider version. Removes the metadata from D1 (cascade-deletes platforms and GPG keys) and all associated artifacts from R2 (zip files, SHA256SUMS, SHA256SUMS.sig).

**Authentication:** Required

**Path Parameters:**

| Parameter   | Type   | Description        | Validation              |
| ----------- | ------ | ------------------ | ----------------------- |
| `namespace` | string | Provider namespace | 1-64 chars, `[a-z0-9-]` |
| `type`      | string | Provider type      | 1-64 chars, `[a-z0-9-]` |
| `version`   | string | Semver version     | Strict semver           |

**Example:**

```bash
curl -X DELETE https://stellaris.example.com/v1/providers/myorg/custom/1.0.0 \
  -H "Authorization: Bearer stlr_your_api_key"
```

**Response** (`204`): No content.

**Error Responses:**

- `401` — Missing or invalid API key
- `404` — Provider version not found
- `422` — Invalid path parameters

---

## Admin API — Registry CRUD

These endpoints provide admin-only CRUD and alias operations for registry metadata. They are API-first contracts intended for cURL/operator tooling and UI workflows.

### Admin Contract Baseline

- Base path: `/v1/admin/...`
- Authorization: Bearer API key with `admin` permission
- Auditability: every successful write is expected to emit an immutable audit record
- Error profile: `401` unauthenticated, `403` unauthorized, `404` not found, `409` conflict, `422` validation

### Optimistic Concurrency (`If-Match`)

Admin mutable resources expose a `revision` value. Clients must:

1. Read current state (`GET`) and capture `revision`
2. Send `If-Match: <revision>` on required write operations
3. On `409`, re-read current state and retry with an updated `revision`

**Required `If-Match` operations:**

- Module `PATCH` and `DELETE`
- Provider `PATCH`, `DELETE`, and platform `PUT`

`If-Match` is mandatory for those endpoints. Missing or stale revisions are rejected with conflict semantics.

### Admin Modules Endpoints

| Operation           | Method + Path                                                             | Concurrency Requirement |
| ------------------- | ------------------------------------------------------------------------- | ----------------------- |
| Create version      | `POST /v1/admin/modules/{namespace}/{name}/{system}/versions`             | Not required            |
| Get admin version   | `GET /v1/admin/modules/{namespace}/{name}/{system}/versions/{version}`    | Not required            |
| Update version      | `PATCH /v1/admin/modules/{namespace}/{name}/{system}/versions/{version}`  | `If-Match` required     |
| Hard delete version | `DELETE /v1/admin/modules/{namespace}/{name}/{system}/versions/{version}` | `If-Match` required     |
| Create alias        | `POST /v1/admin/modules/aliases`                                          | Not required            |

### Admin Providers Endpoints

| Operation                | Method + Path                                                                         | Concurrency Requirement |
| ------------------------ | ------------------------------------------------------------------------------------- | ----------------------- |
| Create version           | `POST /v1/admin/providers/{namespace}/{type}/versions`                                | Not required            |
| Get admin version        | `GET /v1/admin/providers/{namespace}/{type}/versions/{version}`                       | Not required            |
| Update version           | `PATCH /v1/admin/providers/{namespace}/{type}/versions/{version}`                     | `If-Match` required     |
| Hard delete version      | `DELETE /v1/admin/providers/{namespace}/{type}/versions/{version}`                    | `If-Match` required     |
| Upsert platform artifact | `PUT /v1/admin/providers/{namespace}/{type}/versions/{version}/platforms/{os}/{arch}` | `If-Match` required     |
| Create alias             | `POST /v1/admin/providers/aliases`                                                    | Not required            |

### Alias Behavior

- Rename behavior is implemented through alias creation endpoints only.
- Old identifiers resolve to canonical resources through existing read/discovery paths:
  - Modules: `GET /v1/modules/{namespace}/{name}/{system}/versions`
  - Providers: `GET /v1/providers/{namespace}/{type}/versions`
- Alias targets must be canonical identities.
- Alias chains/loops are invalid and must be rejected.

### Hard Delete Cleanup Contract

- Hard delete removes the canonical metadata for the target version.
- Associated aliases for that target version are removed as part of the delete contract.
- Artifact cleanup is part of the same operation contract:
  - Modules: remove version tarball artifacts
  - Providers: remove platform zip artifacts plus `SHA256SUMS` and `SHA256SUMS.sig`
- Delete is fail-closed for cleanup confirmation: metadata deletion only succeeds when cleanup contract succeeds; otherwise the request must fail.

### Concurrency Example (`409` Recovery)

```bash
# 1) Read current admin version and capture revision
curl -sS \
  -H "Authorization: Bearer stlr_admin_key" \
  https://stellaris.example.com/v1/admin/modules/myorg/vpc/aws/versions/1.2.0

# 2) Patch with If-Match
curl -X PATCH \
  -H "Authorization: Bearer stlr_admin_key" \
  -H "If-Match: 42" \
  -H "Content-Type: application/json" \
  -d '{"deprecation":{"deprecated":true,"message":"Use 2.x"}}' \
  https://stellaris.example.com/v1/admin/modules/myorg/vpc/aws/versions/1.2.0

# 3) If response is 409, re-read and retry using latest revision
```

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
| `permissions` | string[] | No       | Permission scopes (currently stored but not enforced) |
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
    "permissions": ["publish"],
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
      "permissions": ["publish"],
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
