# PRD-005: Providers Version CRUD + Aliases

**Version**: 1.0  
**Created**: 2026-02-21  
**Status**: Draft  
**Priority**: P0

---

## 1. Goal

Define admin contracts to manage provider versions and platform artifacts with alias-based rename semantics.

## 2. Locked Defaults Applied

- Version-level mutability for provider version metadata.
- Rename via aliases/redirects.
- Hard delete with zip/SHA256SUMS artifact cleanup.
- Admin-only writes with audit logs.
- API-first contracts under `/v1/admin/providers`.
- Optimistic concurrency for update/delete.

## 3. API Contract Summary (Providers)

| Operation                | Method + Path                                                                         | Notes                                                      |
| ------------------------ | ------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Create version           | `POST /v1/admin/providers/{namespace}/{type}/versions`                                | Creates provider version entry                             |
| Get admin version        | `GET /v1/admin/providers/{namespace}/{type}/versions/{version}`                       | Returns mutable fields + `revision`                        |
| Update version           | `PATCH /v1/admin/providers/{namespace}/{type}/versions/{version}`                     | Requires `If-Match`; updates allowed fields                |
| Hard delete version      | `DELETE /v1/admin/providers/{namespace}/{type}/versions/{version}`                    | Requires `If-Match`; deletes version + platform artifacts  |
| Upsert platform artifact | `PUT /v1/admin/providers/{namespace}/{type}/versions/{version}/platforms/{os}/{arch}` | Attach/replace artifact metadata with revision guard       |
| Create alias             | `POST /v1/admin/providers/aliases`                                                    | Maps old `{namespace,type}` to canonical target            |
| Resolve alias            | `GET /v1/providers/{namespace}/{type}/versions`                                       | Existing discovery path resolves aliases/redirect metadata |

### 3.1 Mutable Fields (Version-Level)

- `protocols`, `gpgKeyId`, release notes/deprecation metadata
- platform matrix metadata (`os`, `arch`, checksums, signing references)
- administrative publication state flags

### 3.2 Concurrency Contract

- Each version and platform row exposes `revision`.
- `PATCH`, `DELETE`, `PUT platform` require `If-Match`.
- Conflict response: `409` with current `revision`.

### 3.3 Alias Behavior

- Alias maps old provider address to canonical address.
- Discovery and download metadata lookup follow alias and return canonical references.
- Alias loops/chains are invalid.

## 4. Acceptance Criteria

- AC-01: Admin can create/update/delete provider versions through admin namespace.
- AC-02: Platform artifact metadata can be updated with concurrency protection.
- AC-03: Old provider address resolves to canonical after alias creation.
- AC-04: Hard delete removes version metadata plus zip, checksums, and signature objects for all platforms.
- AC-05: Audit entries exist for version and platform write operations.

## 5. Out of Scope

- Re-signing binaries inside registry.
- Multi-version bulk mutation endpoint.
- Automatic provider type normalization/migration.
- Non-admin provider publication workflows.
