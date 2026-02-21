# PRD-004: Modules Version CRUD + Aliases

**Version**: 1.0  
**Created**: 2026-02-21  
**Status**: Draft  
**Priority**: P0

---

## 1. Goal

Define admin contracts to create, update, rename (via aliases), and hard-delete module versions.

## 2. Locked Defaults Applied

- Version-level mutability is enabled for module versions.
- Rename is handled through aliases/redirects, not in-place identity rewrite.
- Delete is hard delete with artifact cleanup.
- Writes are admin-only and auditable.
- Contracts are API-first under `/v1/admin/modules`.
- Optimistic concurrency is mandatory.

## 3. API Contract Summary (Modules)

| Operation           | Method + Path                                                             | Notes                                                           |
| ------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Create version      | `POST /v1/admin/modules/{namespace}/{name}/{system}/versions`             | Creates new version metadata + artifact references              |
| Get admin version   | `GET /v1/admin/modules/{namespace}/{name}/{system}/versions/{version}`    | Returns mutable fields + `revision`                             |
| Update version      | `PATCH /v1/admin/modules/{namespace}/{name}/{system}/versions/{version}`  | Requires `If-Match`; mutates allowed version fields             |
| Hard delete version | `DELETE /v1/admin/modules/{namespace}/{name}/{system}/versions/{version}` | Requires `If-Match`; deletes version + cleans tarball artifacts |
| Create alias        | `POST /v1/admin/modules/aliases`                                          | Adds alias from old tuple to canonical tuple                    |
| Resolve alias       | `GET /v1/modules/{namespace}/{name}/{system}/versions`                    | Existing read path resolves aliases and redirects/rewrites      |

### 3.1 Mutable Fields (Version-Level)

- `protocols` / compatibility metadata
- `publishedAt` (admin correction flow)
- `deprecation` flags/messages
- checksums/artifact metadata references (without changing immutable content hash semantics)

### 3.2 Concurrency Contract

- Response includes `revision`.
- `PATCH` and `DELETE` require `If-Match: <revision>`.
- On mismatch: `409` with current `revision` in payload.

### 3.3 Alias Behavior

- Alias target is canonical module identity.
- Reads using alias return canonical version set with redirect-friendly metadata.
- Alias chains are disallowed (`alias -> alias`); must always point to canonical identity.

## 4. Acceptance Criteria

- AC-01: Admin can create/update/delete a module version through admin endpoints only.
- AC-02: Update/delete with stale `If-Match` is rejected with conflict.
- AC-03: Renaming namespace/name/system is achieved by alias creation and read-path resolution.
- AC-04: Hard delete removes module version record and associated tarball artifacts.
- AC-05: All successful writes emit audit events with actor + target + revision delta.

## 5. Out of Scope

- Rewriting artifact binary contents in place.
- Automatic alias inference from typo detection.
- Cross-system merge workflows.
- Public, unauthenticated module write endpoints.
