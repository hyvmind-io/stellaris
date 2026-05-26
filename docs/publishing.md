# Publishing Guide

This guide covers the end-to-end flow for publishing **modules** and
**providers** to Stellaris from CI using only an admin API key and `curl`. It
focuses on the operational shape of each flow; for the complete field-by-field
contract, response bodies, and error codes, see the
[API reference](API.md).

## Prerequisites

- An admin API key (`stlr_...`). See [Authentication → API keys](authentication.md#api-keys-bearer).
- The base URL of your registry, e.g. `https://stellaris.example.com`.
- For providers: a built release with per-platform zips, a `SHA256SUMS` file, a
  detached GPG signature (`SHA256SUMS.sig`), and the public GPG key(s).

Throughout, the API key is passed as `Authorization: Bearer $KEY`.

## Publishing a module

A module version is published in a single `multipart/form-data` request. The
tarball is uploaded to R2 and metadata is stored in D1.

```bash
curl -X POST https://stellaris.example.com/v1/modules/myorg/vpc/aws/1.0.0 \
  -H "Authorization: Bearer $KEY" \
  -F "module=@./module.tar.gz" \
  -F "owner=platform-team" \
  -F 'tags=["aws"]'
```

- The `module` field is the only required field; it carries the `.tar.gz`
  tarball.
- `tags` is sent as a single text field containing a JSON array.
- Use the canonical `multi` keyword in the `system` path segment for
  multi-system modules.

A successful publish returns `201`. See
[API → Publish Module](API.md#publish-module) for all fields, size limits, and
error codes.

## Publishing a provider

Provider releases are larger and multi-platform, so publishing is a two-stage
flow:

1. **Create the version** with a single request that uploads the version-level
   `SHA256SUMS` and `SHA256SUMS.sig`, plus protocol versions and GPG public
   keys. Platform zips are not uploaded here.
2. **Upload each platform zip** with a separate per-platform `PUT`, one request
   per `{os}/{arch}`.

!!! info "Why per-platform uploads?"
    Cloudflare Workers caps the request body at roughly 100 MB. A full provider
    release across all platforms can easily exceed that. Splitting the upload so
    that each request carries a single platform zip (≤ 64 MB) keeps every
    request comfortably under the limit. The version-level checksums and
    signature are uploaded once at create time and shared by all platforms.

### Step 1 — Create the version

```bash
BASE=https://stellaris.example.com
KEY=stlr_admin_key
NS=evilcorp; TYPE=cloudflare; VER=5.19.1-beta.1

curl -sS -D - -o /dev/null -X POST \
  "$BASE/v1/admin/providers/$NS/$TYPE/versions" \
  -H "Authorization: Bearer $KEY" \
  -F "version=$VER" \
  -F 'protocols=["5.0"]' \
  -F 'gpg_public_keys=[{"key_id":"D3C430BB730839CA150E2DD0897EBB1F03A45650","ascii_armor":"-----BEGIN PGP PUBLIC KEY BLOCK-----\n...\n-----END PGP PUBLIC KEY BLOCK-----","source":"evilcorp"}]' \
  -F "SHA256SUMS=@./dist/_SHA256SUMS" \
  -F "SHA256SUMS.sig=@./dist/_SHA256SUMS.sig"
# → 201, response header: ETag: W/"1"
```

Capture the `ETag` from the response headers. It is the resource **revision**
used for optimistic concurrency on the next step.

### Step 2 — Upload each platform zip

Each platform `PUT` requires an `If-Match` header carrying the current revision.
The revision bumps on every successful write, so re-read the `ETag` after each
upload and use it in the next request.

```bash
curl -sS -D - -o /dev/null -X PUT \
  "$BASE/v1/admin/providers/$NS/$TYPE/versions/$VER/platforms/linux/amd64" \
  -H "Authorization: Bearer $KEY" \
  -H 'If-Match: W/"1"' \
  -F "file=@./dist/terraform-provider-${TYPE}_${VER}_linux_amd64.zip"
# → 200, response header: ETag: W/"2"

curl -sS -D - -o /dev/null -X PUT \
  "$BASE/v1/admin/providers/$NS/$TYPE/versions/$VER/platforms/darwin/arm64" \
  -H "Authorization: Bearer $KEY" \
  -H 'If-Match: W/"2"' \
  -F "file=@./dist/terraform-provider-${TYPE}_${VER}_darwin_arm64.zip"
# → 200, response header: ETag: W/"3"  (repeat for remaining platforms)
```

The route computes each zip's SHA-256, uploads the zip to R2, and upserts the
platform row. The version-level checksum and signature pointers uploaded in
step 1 keep the GPG verification chain intact across all platforms, whether the
release is published in one session or platform-by-platform.

For the complete field lists, the alternative JSON mode (for externally-hosted
artifacts), the GPG verification chain, and every error code, see
[API → Admin Provider Byte Ingestion](API.md#admin-provider-byte-ingestion-multipart).

## Immutable uploads

Stellaris has a database-backed **Immutable Uploads** setting that controls
whether already-published artifact bytes may be overwritten. It is **on by
default**, which is the fail-safe choice for a registry serving signed
artifacts.

| Setting | Initial publish (empty slot) | Overwriting published bytes |
| --- | --- | --- |
| **On** (default) | Allowed | Rejected with `409` before any storage work |
| **Off** | Allowed | Overwrites R2 object and metadata in place |

Important details:

- **Initial publish to an empty slot is always allowed**, regardless of the
  setting. Immutability only governs *re-publishing over existing bytes*.
- When the setting is off, the re-push paths replace bytes in place, bump the
  resource revision, and delete the previous R2 object only when its storage key
  actually changed.
- The setting is enforced on the provider per-platform `PUT` and on the module
  byte-replace path.

### Re-pushing bytes when immutability is off

Two endpoints replace bytes for an existing version. Both require `If-Match`:

| Artifact | Endpoint |
| --- | --- |
| Provider platform | `PUT /v1/admin/providers/{namespace}/{type}/versions/{version}/platforms/{os}/{arch}` |
| Module version | `PUT /v1/admin/modules/{namespace}/{name}/{system}/versions/{version}` |

The module byte-replace `PUT` is the module analogue of the per-platform provider
upload — the CI re-push route. It validates `If-Match` and confirms the version
exists (returning `404` if not — use the `POST .../versions` create path
instead), then applies the immutable-uploads gate. See
[API → Replace module version bytes](API.md#admin-provider-byte-ingestion-multipart)
for the precise order of operations and error codes.

To change the setting, an administrator toggles it through the admin settings.
With immutability on, attempting to overwrite returns `409` — the expected,
safe outcome for a registry that has already served a signed artifact.
