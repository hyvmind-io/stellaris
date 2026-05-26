# Handoff: provider publish REST API cannot ingest artifact bytes

## Problem

Provider publish via REST API stores **metadata only**. No artifact-byte
ingestion. Byte upload exists solely in a UI server action. Publishing via
`curl`/CI with an admin API key is impossible today.

## Repro (real attempt)

Registry `terraform.registry.evilcorp.io`, provider `evilcorp/cloudflare`
v`5.19.1-beta.1`, 8 platforms (~30 MB each, ~240 MB total).

| Attempt | Result |
|---|---|
| `POST /v1/providers/evilcorp/cloudflare/5.19.1-beta.1` bulk multipart (`data`+`SHA256SUMS`+`SHA256SUMS.sig`+8×`.zip`) | `HTTP 500` body `error code: 1101` (Worker exception — 240 MB > Workers ~100 MB body limit) |
| same, smaller (no zips) | `HTTP 405` `{"errors":["Provider publish is only available under /v1/admin/providers"]}` |
| `POST /v1/admin/providers/evilcorp/cloudflare/versions` (JSON) | accepts metadata only — never stores bytes |

Admin key auth confirmed working (`GET /v1/admin/...` → 404 authed vs 401 unauth).

## Root cause (code)

- `app/v1/admin/providers/[namespace]/[type]/versions/route.ts` — `POST` =
  `request.json()` + `adminProviderCreateBody`. No R2 upload.
- `app/v1/admin/providers/[namespace]/[type]/versions/[version]/platforms/[os]/[arch]/route.ts`
  — `PUT` = JSON-only (`adminProviderPlatformReplaceBody`). No R2 upload.
- `app/v1/providers/[namespace]/[type]/[version]/route.ts:87` — public `POST`
  returns `methodNotAllowed` by design.
- `app/actions/admin-providers.ts:224-339` (`createProviderAction`) — ONLY byte
  path. Calls `uploadProviderZip`, `uploadShasums`, `uploadShasumsSignature`,
  then `saveProvider`. Server action (UI only). **One platform per call.**
- Parity gap: modules admin REST DOES ingest bytes —
  `app/v1/admin/modules/[namespace]/[name]/[system]/versions/route.ts:66`
  uses `request.formData()`. Providers lack this.

## Storage facts

- R2 bucket `evilcorp-stellaris-modules` (wrangler.jsonc binding `MODULES_STORAGE`).
- Keys (`lib/storage/keys.ts`):
  - zip: `providers/{ns}/{type}/{version}/terraform-provider-{type}_{version}_{os}_{arch}.zip`
  - `providers/{ns}/{type}/{version}/SHA256SUMS`
  - `providers/{ns}/{type}/{version}/SHA256SUMS.sig`
- Helpers (`lib/storage/index.ts`): `uploadProviderZip` :67, `uploadShasums` :102,
  `uploadShasumsSignature` :116.
- Download serves from R2: `app/v1/providers/.../download/[os]/[arch]/zip/route.ts`
  → `getObject(generateProviderKey(...))`. `location` field NOT used for download.

## Required fix

1. Add `multipart/form-data` support to provider admin REST (keep JSON
   metadata mode for externally-hosted artifacts; branch on `Content-Type`).
2. **Primary path = per-platform PUT with bytes** (avoids 100 MB limit; one
   ~30 MB zip/request):
   `PUT /v1/admin/providers/{ns}/{type}/versions/{version}/platforms/{os}/{arch}`
   accepts multipart `{ file=<zip>, sha256sums?=<file>, sha256sums_sig?=<file> }`.
   Upload via existing helpers; compute/verify shasum; update platform metadata.
   Keep `If-Match` revision requirement.
3. `POST .../versions` (create-version): keep JSON for metadata + gpg keys.
   Optionally accept multipart bundling `SHA256SUMS`+`SHA256SUMS.sig` + small
   platform set, but DO NOT rely on it for the full 8-platform set (size).
4. Reuse `createProviderAction` upload logic (`admin-providers.ts:261-302`),
   looped over platforms. Auth `requireAdminWriteAuth`. `409` dup, `422` schema.
5. `docs/API.md`: document multipart contract + working `curl` for create-version
   and per-platform upload.
6. Tests mirroring modules multipart tests.

## Acceptance

CI publishes a multi-platform provider with ONLY an admin API key via `curl` —
no UI, no out-of-band `wrangler r2`. `terraform init` against the registry
downloads + verifies GPG signatures.

## Client-side artifacts already produced (for end-to-end test)

`/tmp/tfp-cf-beta/dist/`: 8 zips, `_SHA256SUMS` (9 entries incl manifest),
`_SHA256SUMS.sig` (good sig, signed by YubiKey subkey
`D3C430BB730839CA150E2DD0897EBB1F03A45650`, primary key
`8DF5EB685DB8011DA28F8D61572E712384AF73A2`), `_manifest.json`.
`data.json` payload at `/tmp/tfp-cf-beta/data.json`.
