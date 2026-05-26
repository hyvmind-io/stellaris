# Configuration Reference

Stellaris is configured through environment variables (and, on Cloudflare
Workers, `wrangler` vars and secrets). A small number of operational toggles —
immutable uploads, public signup, and upstream proxy settings — are stored in
the database instead and managed through the admin API, because they need to
change at runtime without a redeploy.

This page documents the variables that operators care about. The authoritative
sources are [`.env.example`](https://github.com/hyvmind-io/stellaris/blob/master/.env.example)
and `lib/env.ts`; the defaults below are taken directly from the Zod schema in
`lib/env.ts`.

!!! note "Where each setting lives"
    Environment variables are read at startup and cannot change without a
    redeploy. Database-backed settings (immutable uploads, signup, upstream
    proxy) are read per request and are changed through the admin API or web UI.
    When both an env var and a database setting exist for the upstream proxy,
    the database value takes precedence.

## Application

| Variable | Default | Description |
| --- | --- | --- |
| `NODE_ENV` | `development` | Standard Node environment. One of `development`, `production`, `test`. |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | Public base URL of the deployment. Used for absolute links and discovery. |

## Authentication

| Variable | Default | Description |
| --- | --- | --- |
| `AUTH_SESSION_SECRET` | dev fallback (insecure) | HS256 signing secret for JWT session cookies. **Must be at least 32 characters.** A built-in development fallback is used when unset; in production this **must** be set to a strong random secret and stored as a Worker secret, never committed. |
| `PRIVATE_REGISTRY` | `true` | When `true`, every route requires an authenticated session except login/signup and infrastructure endpoints (health, `.well-known`, the API). When `false`, the homepage and other non-admin pages are publicly browsable. |
| `PRIVATE_REGISTRY_MODE` | `relaxed` | Controls whether artifact-serving API routes require a Bearer token. Independent of `PRIVATE_REGISTRY`. See [Registry modes](#registry-modes) below. |

See the [Authentication guide](authentication.md) for the full model, including
Cloudflare Access passthrough.

### Registry modes

`PRIVATE_REGISTRY_MODE` controls the artifact-download surface of the `/v1/*`
API:

| Mode | Behavior |
| --- | --- |
| `relaxed` (default) | Metadata and discovery endpoints require Bearer auth, but artifact bytes (module tarballs, provider zips, `SHA256SUMS`) are served without auth. This is compatible with vanilla `terraform`/`tofu`, which do not forward Bearer tokens when following download redirects. Anyone who discovers an artifact URL can download it. |
| `strict` | All `/v1/*` routes require Bearer auth, including artifact downloads. Because Terraform/OpenTofu does not forward Bearer tokens to redirect targets, a client-side auth proxy is required. |

`PRIVATE_REGISTRY` and `PRIVATE_REGISTRY_MODE` are orthogonal — the first gates
the web UI session, the second gates API artifact downloads:

| `PRIVATE_REGISTRY` | `PRIVATE_REGISTRY_MODE` | Web UI | API |
| --- | --- | --- | --- |
| `true` | `relaxed` | Login required | Partial auth (default) |
| `true` | `strict` | Login required | Full auth (maximum security) |
| `false` | `relaxed` | Public | Partial auth |
| `false` | `strict` | Public | Full auth |

## Cloudflare Access passthrough (optional)

These variables are only relevant when fronting Stellaris with
[Cloudflare Access](https://www.cloudflare.com/zero-trust/products/access/).
The feature is additive and off by default — self-hosters who do not use Access
can ignore this section entirely. All three variables are required when the
feature is enabled; there are no baked-in defaults, which keeps the project
portable across organizations.

| Variable | Default | Description |
| --- | --- | --- |
| `CF_ACCESS_AUTH_ENABLED` | `false` | Enables Cloudflare Access passthrough auth. When `true`, a verified `Cf-Access-Jwt-Assertion` header bridges into an app session, and local signup is force-disabled. |
| `CF_ACCESS_TEAM_DOMAIN` | _(none)_ | Your Access team domain, e.g. `your-team.cloudflareaccess.com`. Used to derive the JWKS endpoint and the expected `iss` claim. |
| `CF_ACCESS_AUD` | _(none)_ | The Application Audience (AUD) tag of the Access application (a 32-character hex string), validated against the token's `aud` claim. |

See [Cloudflare Access passthrough](authentication.md#cloudflare-access-passthrough-optional)
for the full behavior.

## Storage backend

| Variable | Default | Description |
| --- | --- | --- |
| `STORAGE_BACKEND` | `r2` | Artifact storage driver. One of `local`, `r2`, `s3`, `s3-compatible`. |

| Value | Use case |
| --- | --- |
| `local` | Node.js filesystem (`.storage/`). Used with `pnpm dev`. |
| `r2` | Cloudflare R2. Default for preview and production. |
| `s3` | AWS S3. |
| `s3-compatible` | S3-compatible services such as MinIO, Tigris, or Backblaze B2. |

### S3 / S3-compatible options

Required only when `STORAGE_BACKEND` is `s3` or `s3-compatible`. Validation of
these values is performed by the S3 backend at runtime, not by the env schema.

| Variable | Default | Description |
| --- | --- | --- |
| `S3_BUCKET` | _(none)_ | Bucket name. |
| `S3_REGION` | `us-east-1` | AWS region. |
| `S3_ACCESS_KEY_ID` | _(none)_ | Access key ID. |
| `S3_SECRET_ACCESS_KEY` | _(none)_ | Secret access key. |
| `S3_ENDPOINT` | _(none)_ | Custom endpoint URL. Required for `s3-compatible`; optional for `s3`. Empty string is treated as unset. |
| `S3_FORCE_PATH_STYLE` | `false` | Use path-style URLs instead of virtual-hosted style. Set `true` for MinIO and some other S3-compatible services. |

## Upstream proxy

When enabled, read/query/download requests that return `404` locally are proxied
to upstream public registries in a strict configured order. Write and delete
operations are **never** proxied — they always apply locally. Modules and
providers are controlled independently.

| Variable | Default | Description |
| --- | --- | --- |
| `MODULE_UPSTREAM_PROXY_ENABLED` | `false` | Enable upstream fallback for modules. |
| `PROVIDER_UPSTREAM_PROXY_ENABLED` | `false` | Enable upstream fallback for providers. |
| `MODULE_UPSTREAM_REGISTRIES` | built-in defaults | Comma- or newline-separated list of upstream module registry base URLs. Overrides the built-in defaults (OpenTofu, then HashiCorp). An empty string explicitly disables upstream even when the proxy is enabled. |
| `PROVIDER_UPSTREAM_REGISTRIES` | built-in defaults | Same as above, for providers. |

!!! warning "Database settings win"
    The upstream proxy can also be configured at runtime in the database via
    `PATCH /v1/admin/settings/proxy`. When a database setting exists, it takes
    precedence over the corresponding environment variable.

## Database-backed runtime settings

These are not environment variables. They live in the `system_settings` table
and are changed at runtime through the admin API (or web UI) without a redeploy.

| Setting | Default | Where to change | Description |
| --- | --- | --- | --- |
| Immutable uploads | On | Admin settings | When on, overwriting already-published artifact bytes returns `409`. See [Immutable uploads](publishing.md#immutable-uploads). |
| Public signup | On (open) | Admin settings | When off, the `/signup` page and signup action are disabled. Force-disabled whenever Cloudflare Access passthrough is enabled. |
| Upstream proxy | Off | `PATCH /v1/admin/settings/proxy` | Runtime override of the upstream proxy env vars. |

## Whitelabeling

Whitelabeling hides Stellaris's open-source/technology/sponsor branding and
substitutes operator-supplied brand identity (name, title suffix, tagline,
logo, favicon, footer). It only affects user-facing text, logo, and favicon —
colors, fonts, layout, and the internal "Stellaris" engine name are unchanged.
See the [Whitelabeling guide](whitelabeling.md) for a full walkthrough.

| Variable | Default | Description |
| --- | --- | --- |
| `WHITELABEL_ENABLED` | `false` | Master switch. When `true`, all OSS/tech/sponsor branding is hidden and operator branding is applied. When `false`, default Stellaris branding is shown unchanged. |
| `WHITELABEL_BRAND_NAME` | _(none)_ | Operator brand name (e.g. `Evil Corp`). When whitelabeling is enabled and this is unset, the UI degrades gracefully to generic, neutral text but still strips tech/sponsor branding. |
| `WHITELABEL_TITLE_SUFFIX` | `Registry` | Vendor-free suffix appended after the brand name in the browser title and hero (e.g. `Terraform Registry`). |
| `WHITELABEL_TAGLINE` | `Private module and provider registry` | Neutral hero tagline and meta description. No vendor/tech mentions. |
| `WHITELABEL_LOGO_URL` | _(none)_ | Custom logo by URL (external/CDN). When unset or invalid, the default terminal icon is used. |
| `WHITELABEL_FAVICON_URL` | _(none)_ | Custom favicon by URL. When unset or invalid, the existing default favicon is used. |
| `WHITELABEL_FOOTER_TEXT` | _(none)_ | Footer line. Supports the `{year}` placeholder, replaced with the current UTC year. Rendered as plain text (no HTML injection). |

!!! note "Server-runtime variables on Cloudflare Workers"
    These are plain server-side variables, not `NEXT_PUBLIC_*`. Stellaris reads
    them once on the server and passes the resolved branding to the browser via
    React context — they are never inlined into client bundles. Set them as
    `vars` in `wrangler.jsonc` for Workers deployments.

## Cloudflare account variables

Used by `drizzle-kit` for remote D1 operations during development and CI; not
required at application runtime.

| Variable | Description |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID. |
| `CLOUDFLARE_DATABASE_ID` | D1 database ID. |
| `CLOUDFLARE_D1_TOKEN` | API token with D1 permissions. |
