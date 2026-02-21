# Registry Admin CRUD Rollout and Rollback Guide

Operator guide for Batch B5-P1 based on locked decisions in `docs/implementation/REGISTRY_ADMIN_CRUD_EXECUTION_PLAN.md` and PRD-007.

## 1. Scope and Locked Constraints

- Applies to admin CRUD for modules/providers, alias-based rename behavior, and hard-delete cleanup expectations.
- Uses `/v1/admin/...` as the only write namespace.
- Keeps optimistic concurrency (`If-Match` + `revision`) mandatory on mutable guarded operations.
- Keeps rename behavior exclusive to alias endpoints (no in-place identity rewrite).
- Keeps hard delete as metadata removal plus artifact cleanup in the same operation contract.

## 2. Phased Rollout Sequence

Roll out in this order:

1. Foundation + read-safe alias resolution
2. Module admin CRUD endpoints
3. Provider admin CRUD endpoints
4. Admin UI workflows after API validation (cURL/client first)

Do not advance to the next phase unless the current phase passes observability and rollback checkpoints.

## 3. Pre-Flight Checklist Per Phase

- Confirm admin auth gate is enforced for all `/v1/admin` write endpoints.
- Confirm audit records are written for successful admin writes.
- Confirm `If-Match` guard behavior is active on required endpoints (`PATCH`/`DELETE`, plus provider platform `PUT`).
- Confirm alias validation rejects loop/chain patterns and alias-to-alias targets.
- Confirm hard-delete contract is fail-closed when artifact cleanup cannot be confirmed.

## 4. Observability and Alerts

Track the following metrics and logs during rollout:

- `admin_write_requests_total{resource,action,status}`
- `admin_write_conflicts_total{resource}`
- `admin_alias_creations_total{resource}`
- `admin_hard_delete_cleanup_failures_total{resource}`
- Structured write logs with: actor, endpoint, target id, revision before/after, result

Recommended alert checkpoints:

- Any non-zero sustained `admin_hard_delete_cleanup_failures_total` increment
- Elevated `409` conflict rate above normal baseline for the active phase
- Elevated `403` rate for admin write paths (potential permission/config drift)
- Missing audit record evidence for successful writes (sampling or integrity check)

## 5. Rollout Checkpoints (Go/No-Go)

At each phase boundary:

- **Contract health:** expected status profile is stable (`2xx/4xx` pattern, no unexplained `5xx` drift).
- **Concurrency health:** `409` responses are present only under expected concurrent edits and recover through read-refresh-retry.
- **Alias health:** old identifiers resolve to canonical resources without loops/chains.
- **Delete safety:** hard-delete flows either complete with cleanup confirmation or fail without partial success.
- **Audit coverage:** successful writes have corresponding audit entries.

If any checkpoint fails, stop promotion and execute rollback strategy.

## 6. Rollback Strategy

Primary rollback action:

- Disable admin write routes using feature/config switch.

Required rollback guarantees:

- Keep read/discovery endpoints available.
- Keep alias resolution backward-compatible on read paths.

Recovery actions after rollback:

1. Identify failed writes and affected targets from audit and structured logs.
2. Reconcile metadata state versus storage object state for deleted resources.
3. Reconstruct mistaken alias/deletion outcomes using audit records and storage backups.
4. Re-validate metrics, then re-enable phases progressively.

## 7. Incident-Specific Guidance

### 7.1 Alias Misconfiguration

- Freeze new alias writes.
- Inspect recent alias creation events and canonical targets.
- Remove/correct invalid alias records according to canonical-only rule.
- Verify old identifiers resolve correctly before reopening writes.

### 7.2 Accidental Hard Delete

- Disable admin writes immediately.
- Confirm whether artifact cleanup succeeded or failed.
- Recover metadata/artifacts using backup and audit trail.
- Re-run reconciliation before restoring write access.

### 7.3 Elevated Conflict Rate (`409`)

- Verify clients are reading latest `revision` before writes.
- Verify clients always send `If-Match` on guarded operations.
- Temporarily reduce concurrent operator activity on affected resources.

## 8. Exit Criteria for B5

- Phased rollout order is documented and executable.
- Rollback path can disable writes without breaking reads.
- Conflicts, authorization failures, and cleanup failures are measurable and alertable.
- Recovery steps for alias and deletion mistakes are documented for operators.
