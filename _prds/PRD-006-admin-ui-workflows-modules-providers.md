# PRD-006: Admin UI Workflows (Modules + Providers)

**Version**: 1.0  
**Created**: 2026-02-21  
**Status**: Draft  
**Priority**: P1

---

## 1. Goal

Define admin UI flows that consume the API-first admin namespace for module/provider version CRUD, aliases, and hard delete.

## 2. Workflow Principles

- UI is a client of `/v1/admin/...` (same contracts as cURL/client SDK).
- All write actions are gated by admin authentication.
- Conflict-safe edits: UI always sends `If-Match` and handles `409` with refresh/retry prompt.
- Rename UX creates aliases; it does not mutate historical identifiers directly.
- Destructive actions are explicit and include artifact cleanup messaging.

## 3. Core UI Flows

| Flow                           | API calls                                     | Expected UX behavior                                                     |
| ------------------------------ | --------------------------------------------- | ------------------------------------------------------------------------ |
| Edit module version            | `GET admin version` -> `PATCH admin version`  | Load revision, submit with `If-Match`, show success with audit reference |
| Edit provider version          | `GET admin version` -> `PATCH admin version`  | Same concurrency behavior                                                |
| Create alias (module/provider) | `POST .../aliases`                            | Validate old/new identity, warn about canonical redirect impact          |
| Hard delete version            | `GET admin version` -> `DELETE admin version` | Confirmation modal with artifact cleanup scope                           |
| Resolve conflict               | failed `PATCH/DELETE` (`409`)                 | Present diff/current revision, allow reload and retry                    |

## 4. API Contract Notes for UI

- Include `Authorization: Bearer <admin-token>` in all write requests.
- Include `If-Match` from latest loaded resource on all mutable writes.
- Treat `409` as expected race condition, not generic failure.
- Display alias resolution target after rename submission.

## 5. Acceptance Criteria

- AC-01: UI supports module and provider version edit flows using admin endpoints only.
- AC-02: UI supports alias creation for module and provider rename scenarios.
- AC-03: UI hard delete flow explicitly states metadata + artifact cleanup consequences.
- AC-04: UI handles optimistic concurrency conflicts with deterministic recovery path.
- AC-05: UI surfaces write audit id/reference after successful write.

## 6. Out of Scope

- Rebuilding public browse UX for non-admin users.
- New role model or delegated approvals.
- Bulk-edit UI for many versions at once.
- Historical audit explorer screen (only write confirmation linkage required).
