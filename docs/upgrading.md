# Upgrading

Breaking changes and the steps to adopt them, newest first.

## Publishing moved to `/v1/publish`, scoped keys can publish

**Breaking.** No redirects or aliases: the old `/v1/admin` publish paths return `404`.

### What changed

| Before | After |
| --- | --- |
| Publishing lived under `/v1/admin/modules/...` and `/v1/admin/providers/...` | Publishing lives under `/v1/publish/modules/...` and `/v1/publish/providers/...` |
| Every publish call required an `admin` key; `modules:write` and `providers:write` keys got `403` | `modules:write` publishes modules, `providers:write` publishes providers, `admin` still works for both |
| `/v1/admin` mixed publishing with administration | `/v1/admin` is administration only and always requires `admin` |

Request bodies, response bodies, `ETag`/`If-Match` semantics and status codes are unchanged. Only the path prefix and the required scope changed.

### Path mapping

Replace the `/v1/admin` prefix with `/v1/publish`; the rest of the path stays the same.

| Operation | Old path | New path |
| --- | --- | --- |
| Create module version | `POST /v1/admin/modules/{ns}/{name}/{system}/versions` | `POST /v1/publish/modules/{ns}/{name}/{system}/versions` |
| Get module version + `ETag` | `GET /v1/admin/modules/{ns}/{name}/{system}/versions/{version}` | `GET /v1/publish/modules/{ns}/{name}/{system}/versions/{version}` |
| Replace module bytes | `PUT /v1/admin/modules/{ns}/{name}/{system}/versions/{version}` | `PUT /v1/publish/modules/{ns}/{name}/{system}/versions/{version}` |
| Update module version | `PATCH /v1/admin/modules/{ns}/{name}/{system}/versions/{version}` | `PATCH /v1/publish/modules/{ns}/{name}/{system}/versions/{version}` |
| Delete module version | `DELETE /v1/admin/modules/{ns}/{name}/{system}/versions/{version}` | `DELETE /v1/publish/modules/{ns}/{name}/{system}/versions/{version}` |
| Create provider version | `POST /v1/admin/providers/{ns}/{type}/versions` | `POST /v1/publish/providers/{ns}/{type}/versions` |
| Get provider version + `ETag` | `GET /v1/admin/providers/{ns}/{type}/versions/{version}` | `GET /v1/publish/providers/{ns}/{type}/versions/{version}` |
| Update provider version | `PATCH /v1/admin/providers/{ns}/{type}/versions/{version}` | `PATCH /v1/publish/providers/{ns}/{type}/versions/{version}` |
| Delete provider version | `DELETE /v1/admin/providers/{ns}/{type}/versions/{version}` | `DELETE /v1/publish/providers/{ns}/{type}/versions/{version}` |
| Upload provider platform | `PUT /v1/admin/providers/{ns}/{type}/versions/{version}/platforms/{os}/{arch}` | `PUT /v1/publish/providers/{ns}/{type}/versions/{version}/platforms/{os}/{arch}` |

These did **not** move and still require `admin`:

| Operation | Path |
| --- | --- |
| Create module alias | `POST /v1/admin/modules/aliases` |
| Create provider alias | `POST /v1/admin/providers/aliases` |
| Read / update upstream proxy settings | `GET` / `PATCH /v1/admin/settings/proxy` |
| Manage API keys | `/v1/api-keys` |

### Scope rules

| Key scope | `/v1/publish/modules/...` | `/v1/publish/providers/...` | `/v1/admin/...` | `/v1/api-keys` |
| --- | --- | --- | --- | --- |
| `admin` | ✅ | ✅ | ✅ | ✅ |
| `modules:write` | ✅ | `403` | `403` | `403` |
| `providers:write` | `403` | ✅ | `403` | `403` |
| `modules:read` / `providers:read` only | `403` | `403` | `403` | `403` |

A write scope never grants key creation, alias creation, user management or settings changes, so it cannot be escalated to `admin`.

### Migrating CI

1. Replace the path prefix in every publish call:

    ```bash
    # before
    curl -X POST "$BASE/v1/admin/modules/$NS/$NAME/$SYSTEM/versions" ...
    # after
    curl -X POST "$BASE/v1/publish/modules/$NS/$NAME/$SYSTEM/versions" ...
    ```

2. Replace the CI `admin` key with a least-privilege key. An admin creates it:

    ```bash
    curl -X POST "$BASE/v1/api-keys" \
      -H "Authorization: Bearer $ADMIN_KEY" \
      -H "Content-Type: application/json" \
      -d '{"name": "ci-modules", "permissions": ["modules:read", "modules:write"]}'
    ```

    Use `["providers:read", "providers:write"]` for a provider pipeline, or both pairs for one that publishes both.

3. Revoke the old `admin` key once the pipeline runs green with the new one (`DELETE /v1/api-keys/{id}`).

### Checking a deployment

With a `modules:write` key, both of these hold after the upgrade:

```bash
# Old prefix is gone
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $KEY" \
  "$BASE/v1/admin/modules/$NS/$NAME/$SYSTEM/versions/$VERSION"   # → 404

# Admin endpoints reject write scopes
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $KEY" \
  "$BASE/v1/api-keys"                                              # → 403
```
