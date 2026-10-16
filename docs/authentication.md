# Authentication

Stellaris has two distinct authentication surfaces:

- **The web UI** uses JWT session cookies, established by logging in with a
  username and password.
- **The registry and admin REST API** (`/v1/*`) uses Bearer API keys.

An optional third path, **Cloudflare Access passthrough**, lets an external
identity provider stand in front of the app and bridge verified users into a
session automatically. It is off by default and entirely optional.

## Web UI sessions

When `PRIVATE_REGISTRY=true` (the default), every page requires an authenticated
session except the login and signup pages and infrastructure endpoints (health,
`.well-known`, the API). Logging in mints a JWT stored in an HTTP-only cookie,
signed with `AUTH_SESSION_SECRET` (HS256). Set `PRIVATE_REGISTRY=false` to make
the homepage and other non-admin pages publicly browsable.

Public signup is controlled by a database setting (default open). Administrators
can disable it so that only existing accounts can sign in.

## API keys (Bearer)

All write operations (publishing, deleting, API-key management) and every
admin endpoint require an API key passed in the `Authorization` header:

```
Authorization: Bearer stlr_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2
```

Key facts:

- Keys use the format `stlr_` followed by 40 hexadecimal characters.
- Both `Bearer <key>` and a raw `<key>` value are accepted in the header.
- Keys are hashed with SHA-256 before storage; the plaintext is shown only once,
  at creation time.
- Publishing lives under `/v1/publish/...`: module routes require
  `modules:write`, provider routes require `providers:write`.
- Everything under `/v1/admin/...` (aliases, settings) and API-key management
  (`/v1/api-keys`) requires `admin`. An `admin` key satisfies every scope.
- **Bootstrap mode:** when no API keys exist yet, `POST /v1/api-keys` is allowed
  without authentication so the first key can be created. After that, normal
  auth applies.

Read endpoints (listing, downloading, searching) do not require an API key,
subject to the registry mode described below.

See the [API reference](API.md#api-keys) for the key-management endpoints.

## Registry modes and artifact downloads

Two independent environment variables shape who can reach what:

| Variable | Controls |
| --- | --- |
| `PRIVATE_REGISTRY` | Whether the **web UI** requires a session. |
| `PRIVATE_REGISTRY_MODE` | Whether **API artifact downloads** require a Bearer token. |

`PRIVATE_REGISTRY_MODE` accepts:

- **`relaxed`** (default) — Metadata and discovery endpoints require Bearer auth,
  but artifact bytes (module tarballs, provider zips, `SHA256SUMS`) are served
  without auth. This is compatible with vanilla `terraform`/`tofu`.
- **`strict`** — All `/v1/*` routes require Bearer auth, including artifact
  downloads.

!!! warning "Strict mode and the Terraform CLI"
    Terraform and OpenTofu do **not** forward the `Authorization` header when
    following the `X-Terraform-Get` / download redirect to fetch artifact bytes.
    In `strict` mode you therefore need a client-side auth proxy that re-attaches
    the Bearer token to download requests. In `relaxed` mode the CLI works
    directly because artifact routes are unauthenticated.

See [Configuration → Registry modes](configuration.md#registry-modes) for the
full matrix.

## Configuring Terraform/OpenTofu clients

Terraform and OpenTofu read registry credentials from a CLI configuration file
or an environment variable.

=== "CLI config file"

    Add a `credentials` block to `~/.terraformrc` (or `%APPDATA%\terraform.rc`
    on Windows). For OpenTofu, use `~/.tofurc`.

    ```hcl
    credentials "stellaris.example.com" {
      token = "stlr_your_api_key"
    }
    ```

=== "Environment variable"

    Set `TF_TOKEN_<host>`, with dots in the hostname replaced by underscores:

    ```bash
    export TF_TOKEN_stellaris_example_com="stlr_your_api_key"
    ```

This token authenticates discovery and metadata requests. In `relaxed` mode,
artifact downloads need no token; in `strict` mode, pair this with a client-side
auth proxy as described above.

## Cloudflare Access passthrough (optional)

When a deployment is fronted by [Cloudflare Access](https://www.cloudflare.com/zero-trust/products/access/),
Stellaris can trust the identity that Access has already verified and bridge it
into an app session. This is additive and optional: leave it disabled and
nothing changes. Self-hosters not using Access can skip this section.

### How it works

1. Cloudflare Access authenticates the user at the edge and attaches a
   `Cf-Access-Jwt-Assertion` header to the request.
2. Stellaris verifies that JWT against the team's JWKS
   (`https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`), validating the
   `iss`, `aud`, and `exp` claims.
3. On the first verified request for a given identity, the user is
   auto-provisioned with the role `user` (a standard authenticated account) and
   a password sentinel that makes local password login impossible for that
   account.
4. An app session cookie is minted, so the rest of the application sees the user
   through the existing cookie-based auth. No downstream code changes.

### Behavior changes when enabled

- **Signup is force-disabled.** Both the `/signup` page and the signup action
  are turned off regardless of the database-level signup setting, because
  identities come exclusively from Access.
- **In-app logout is hidden.** The app cookie is only one of two sessions; Access
  maintains its own session at the edge. To fully sign out, the user must hit
  `/cdn-cgi/access/logout` on the host. Stellaris does not chain this
  automatically, to avoid an unexpected global sign-out.
- **Local cookie/password login still works in parallel** for accounts that have
  a real password (it is not removed by enabling Access).

### Required variables

All three are required when the feature is enabled; there are no defaults.

| Variable | Description |
| --- | --- |
| `CF_ACCESS_AUTH_ENABLED` | Set to `true` to enable passthrough. |
| `CF_ACCESS_TEAM_DOMAIN` | Team domain, e.g. `your-team.cloudflareaccess.com`. |
| `CF_ACCESS_AUD` | The 32-character hex Application Audience (AUD) tag of the Access application. |

See [Configuration → Cloudflare Access passthrough](configuration.md#cloudflare-access-passthrough-optional)
for the variable reference.
