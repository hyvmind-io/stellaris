# Registry Admin CRUD Execution Plan

## 1. Purpose

Implementation-oriented plan for PRD batches 003-007, using approved defaults without deviation.

## 2. Locked Decisions (Do Not Re-open)

1. Version-level mutability
2. Rename via aliases/redirects
3. Hard delete + artifact cleanup
4. Admin-only writes + auditability
5. API-first admin namespace for cURL/client+UI
6. Optimistic concurrency

## 3. API Contract Snapshot

### 3.1 Modules (Admin)

- `POST /v1/admin/modules/{namespace}/{name}/{system}/versions`
- `GET /v1/admin/modules/{namespace}/{name}/{system}/versions/{version}`
- `PATCH /v1/admin/modules/{namespace}/{name}/{system}/versions/{version}` (`If-Match` required)
- `DELETE /v1/admin/modules/{namespace}/{name}/{system}/versions/{version}` (`If-Match` required, hard delete + artifact cleanup)
- `POST /v1/admin/modules/aliases` (rename via alias)

### 3.2 Providers (Admin)

- `POST /v1/admin/providers/{namespace}/{type}/versions`
- `GET /v1/admin/providers/{namespace}/{type}/versions/{version}`
- `PATCH /v1/admin/providers/{namespace}/{type}/versions/{version}` (`If-Match` required)
- `DELETE /v1/admin/providers/{namespace}/{type}/versions/{version}` (`If-Match` required, hard delete + artifact cleanup)
- `PUT /v1/admin/providers/{namespace}/{type}/versions/{version}/platforms/{os}/{arch}` (`If-Match` required)
- `POST /v1/admin/providers/aliases` (rename via alias)

### 3.3 Alias Behavior

- Old identifiers resolve to canonical records via alias lookup.
- Alias chains/loops are invalid.
- Canonical target only (no alias-to-alias).

## 4. Batch Plan

| Batch | PRD     | Focus                                                 | Exit Criteria                                                |
| ----- | ------- | ----------------------------------------------------- | ------------------------------------------------------------ |
| B1    | PRD-003 | Foundation contracts (auth, audit, concurrency model) | Admin namespace and shared error/concurrency contract agreed |
| B2    | PRD-004 | Module version CRUD + aliases                         | Module API contracts and acceptance criteria complete        |
| B3    | PRD-005 | Provider version CRUD + aliases                       | Provider API contracts and acceptance criteria complete      |
| B4    | PRD-006 | Admin UI workflows                                    | UI flow contracts mapped to API, including conflict handling |
| B5    | PRD-007 | Rollout/risk/rollback/observability                   | Phased rollout + alerts + rollback playbook documented       |

## 5. Validation Checklist

- Every write endpoint is under `/v1/admin` and requires `admin`.
- Every mutable write/delete requires optimistic concurrency guard.
- Rename requirements are represented exclusively through alias endpoints.
- Hard delete contract includes artifact cleanup expectation.
- Audit trail requirements are explicitly testable.
- Acceptance criteria and out-of-scope are present in each PRD.

## 6. Non-Goals for This Plan

- No code implementation.
- No schema migration execution.
- No UI visual design specs beyond workflow/API integration behavior.

## 7. Execution Status

- [x] B5-P1 documentation completed
  - Admin CRUD contracts, concurrency, alias behavior, and hard-delete cleanup expectations documented in `docs/API.md`.
  - Rollout, observability, and rollback operator guidance documented in `docs/implementation/REGISTRY_ADMIN_CRUD_ROLLOUT.md`.
