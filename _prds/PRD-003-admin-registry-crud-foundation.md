# PRD-003: Admin Registry CRUD Foundation

**Version**: 1.0  
**Created**: 2026-02-21  
**Status**: Draft  
**Priority**: P0 (Foundation)

---

## 1. Goal

Establish the shared foundation for admin write operations across modules and providers using one API-first admin namespace, strict authorization, auditability, optimistic concurrency, alias-based renames, and hard delete with artifact cleanup.

## 2. Locked Defaults (User-Approved)

1. **Version-level mutability**: edits are allowed at version resources.
2. **Rename via aliases/redirects**: canonical names can change while old names keep resolving.
3. **Hard delete + artifact cleanup**: deletes remove metadata and stored artifacts.
4. **Admin-only writes + auditability**: write endpoints require `admin` and produce audit records.
5. **API-first admin namespace**: same contracts power cURL, client libraries, and UI.
6. **Optimistic concurrency**: write/delete requires version guard (`If-Match` / revision).

## 3. Admin API Foundation

- Base namespace: `/v1/admin/...` for all write paths.
- Auth: Bearer token with `admin` permission.
- Concurrency: all mutable resources expose `revision`; clients must send `If-Match: <revision>` on update/delete.
- Audit: every write emits immutable audit record with actor, action, target, before/after summary, request id, timestamp.
- Error profile: `401` unauthenticated, `403` unauthorized, `404` not found, `409` revision conflict, `422` validation error.

## 4. Shared Data Rules

- Resource identity is canonical (`namespace/name/system/version` for modules; `namespace/type/version` for providers).
- Alias records map legacy identifiers to canonical identifiers.
- Hard delete removes canonical row + aliases + artifact object set for the target version.
- Cleanup is best-effort transactional policy: metadata deletion succeeds only when cleanup step is confirmed, otherwise request fails.

## 5. Acceptance Criteria

- AC-01: All write endpoints live under `/v1/admin` and require `admin`.
- AC-02: Update/delete without `If-Match` returns `409` (or contract-defined precondition error).
- AC-03: Conflicting revision returns deterministic conflict response with current revision.
- AC-04: Every successful write creates an audit record linked to target resource.
- AC-05: Rename flow creates/updates alias records; old paths resolve via redirect/alias lookup.
- AC-06: Hard delete removes version metadata and attempts artifact cleanup in same operation contract.

## 6. Out of Scope

- Non-admin self-service write permissions.
- Soft-delete/trash retention model.
- Bulk migration tooling for legacy records.
- Fine-grained RBAC expansion beyond existing `admin` gate.
