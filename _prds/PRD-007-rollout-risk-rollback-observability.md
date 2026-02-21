# PRD-007: Rollout, Risk, Rollback, Observability

**Version**: 1.0  
**Created**: 2026-02-21  
**Status**: Draft  
**Priority**: P1

---

## 1. Goal

Define a safe rollout strategy for admin CRUD + aliases + hard delete, including risk controls, rollback, and runtime observability.

## 2. Rollout Plan

1. Enable foundation + read-safe alias resolution first.
2. Enable module admin CRUD endpoints (write path) behind admin usage monitoring.
3. Enable provider admin CRUD endpoints.
4. Enable UI workflows after API validation via cURL/client tests.

## 3. Operational Risks and Controls

| Risk                                    | Impact | Control                                                            |
| --------------------------------------- | ------ | ------------------------------------------------------------------ |
| Accidental hard delete                  | High   | Confirmations, strict admin auth, audit trail, staged rollout      |
| Alias misconfiguration                  | Medium | Canonical target validation, loop prevention, dry-run checks       |
| Write conflicts under concurrent admins | Medium | Mandatory optimistic concurrency (`If-Match`)                      |
| Artifact cleanup partial failure        | High   | Delete operation fails closed unless cleanup succeeds per contract |
| Unauthorized write attempts             | High   | `admin`-only namespace + auth metrics + alerting                   |

## 4. Observability Requirements

- Structured logs for each admin write: actor, endpoint, target id, revision before/after, result.
- Metrics:
  - `admin_write_requests_total{resource,action,status}`
  - `admin_write_conflicts_total{resource}`
  - `admin_alias_creations_total{resource}`
  - `admin_hard_delete_cleanup_failures_total{resource}`
- Audit record persistence verified for every successful write.
- Alert thresholds for elevated `409`, `403`, and cleanup failures.

## 5. Rollback Strategy

- Disable admin write routes via feature flag/config switch if severe incident.
- Preserve read/discovery behavior; alias resolution remains backward compatible.
- Reconstruct accidentally removed mapping from audit records and storage backups.
- Post-incident task: reconcile metadata vs storage and replay missing audit-index updates.

## 6. Acceptance Criteria

- AC-01: Rollout can be phased by resource type (modules, providers, UI).
- AC-02: All admin writes are visible in logs, metrics, and audit trail.
- AC-03: Conflict and cleanup failure rates are measurable and alertable.
- AC-04: Rollback path can disable writes without breaking read API.
- AC-05: Recovery steps are documented for alias or deletion mistakes.

## 7. Out of Scope

- Full disaster recovery policy for entire platform.
- Vendor-specific monitoring implementation details.
- New backup infrastructure implementation.
- Non-admin operational runbooks unrelated to registry CRUD.
