# REVIEW_ORCHESTRATION_STATUS

Last updated: 2026-02-22

## Stage Timeline

- 2026-02-22: TCG mapping complete (`TCG_CONTEXT_GROUPS.md`, `TCG_INDEX.json`)
- 2026-02-22: Reviewer pass complete (`CODEBASE_REVIEW_FINDINGS.md`, issues REV-001..REV-007)
- 2026-02-22: Planner pass 1 complete (batches B0..B7 with dependencies and machine-readable output)
- 2026-02-22: Planner pass 2 complete (execution matrix RB0..RB3 + issue-level remediation actions)

## Main Findings Snapshot (REV-001..REV-007)

- `REV-001` (critical): Cloudflare binding type drift blocks `type-check` and `build`.
- `REV-002` (high): lint script/tooling drift (`next lint` behavior mismatch in Next 16).
- `REV-003` (high): proxy settings UX/behavior mismatch; empty list can disable upstream fallback.
- `REV-004` (medium): HTTPS-only policy drift; `http:` upstream URLs currently accepted.
- `REV-005` (medium): duplicate/unwired admin proxy settings surface (API route + server actions).
- `REV-006` (medium): framework deprecation warning acknowledged, but migration is deferred due to OpenNext Cloudflare compatibility constraint (keep `middleware.ts`).
- `REV-007` (medium): signup fail-open on DB error can unintentionally enable registrations.

## Batch Architecture (Planner Pass 1)

Execution intent: unblock CI/guardrails first, then remediate runtime/security behavior, then converge architecture and cleanup.

- `B0`: Core unblockers (typed bindings + build/type baseline)
- `B1`: Tooling guardrails (lint command + docs alignment)
- `B2`: Proxy fallback behavior fix (empty override semantics)
- `B3`: Upstream URL policy enforcement (HTTPS normalization)
- `B4`: Admin proxy surface convergence (single read/write path + route coverage)
- `B5`: Compatibility guardrails for request gate (`middleware.ts` retained; `proxy.ts` migration deferred)
- `B6`: Signup posture hardening (fail-closed behavior + explicit handling)
- `B7`: Follow-up cleanup and consolidation (dead-code/legacy surface after functional fixes)

Plain-text dependency graph:

`B0 -> B1`
`B1 -> {B2, B3, B5, B6}`
`{B2, B3} -> B4`
`{B4, B5, B6} -> B7`

## Planner Pass 2 Remediation Matrix

Execution intent: run dependency-safe remediation slices in four rollout bundles (`RB0`..`RB3`) with explicit gates.

- `RB0` (unblock baseline): `REV-001`, `REV-002`.
  - dependency: none (entry point for all other work)
  - validation gates: `pnpm type-check`, `pnpm build`, `pnpm lint`
- `RB1` (proxy behavior/policy): `REV-003`, `REV-004`.
  - dependency: `RB0` green
  - validation gates: proxy settings behavior tests + URL normalization tests + `pnpm test -- --run`
- `RB2` (surface convergence + security posture): `REV-005`, `REV-007`, with `REV-006` held deferred.
  - dependency: `RB1` green
  - validation gates: admin proxy route/server-action parity checks, signup fail-closed tests, targeted auth/matcher coverage, `pnpm test -- --run`
- `RB3` (cleanup objective): dead code consolidation objective (`OBJ-DEAD-CODE`) after functional convergence.
  - dependency: `RB2` green
  - validation gates: no-callsite verification for removals + full regression pass (`pnpm test -- --run`, `pnpm type-check`)

## Compatibility Note (REV-006)

- `REV-006` remains `deferred` by design.
- Constraint: current deployment target is OpenNext Cloudflare; keep request gating in `middleware.ts`.
- Rule: do **not** migrate to `proxy.ts` until adapter parity/support is explicitly documented and validated in both preview and deploy paths.

## Execution Progress

- 2026-02-22: `RB0` executed for `REV-001` and `REV-002`.
- `REV-001`: partially remediated by wiring deterministic Cloudflare binding type generation into npm lifecycle (`pretype-check`, `prebuild` -> `pnpm cf-typegen`); `pnpm type-check` is green and CloudflareEnv binding failures are resolved. `pnpm build` still fails due pre-existing prerender/runtime-context issues outside REV-001 scope.
- `REV-002`: completed by replacing broken `next lint` invocation with Next 16-compatible ESLint CLI flow and updating contributor docs; validated with `pnpm lint`.
- 2026-02-22: `RB1` lane A executed for `REV-003` and `REV-004`.
- `REV-003`: proxy settings semantics made explicit in admin action/UI path — `undefined` (unchanged), `null` (clear override/use env-defaults), `[]` (explicit disable), non-empty list (explicit ordered override). UI blank textarea now sends `null`, so leaving inputs empty no longer persists `[]` and silently disables fallback.
- `REV-004`: upstream URL policy is now HTTPS-only in normalization and validation; invalid/non-HTTPS entries are rejected explicitly rather than silently filtered.
- RB1 lane A validation evidence: `pnpm exec vitest run __tests__/app/actions/admin-proxy.test.ts __tests__/lib/upstream/config.test.ts __tests__/lib/validation/registry.test.ts` (3 files, 218 tests passing).
- 2026-02-22: `RB1` lane B executed for `REV-007` (security posture hardening). Signup status DB-read failures now fail closed (`false`) with explicit structured logging in both `lib/data/settings.ts` and `app/actions/admin.ts`; missing-setting default behavior remains unchanged. Targeted evidence: `__tests__/lib/data/settings.test.ts` and `__tests__/app/actions/admin.test.ts`.
- `REV-006`: intentionally untouched in this batch; `middleware.ts` remains in place per deferred compatibility rule.
- 2026-02-22: `RB2` executed for `REV-005` (admin proxy surface convergence).
- `REV-005`: extracted canonical proxy settings service (`lib/upstream/config-service.ts`) and rewired both `app/actions/admin.ts` and `app/v1/admin/settings/proxy/route.ts` to shared read/write implementation. Route GET now reads effective+override payloads via `getProxySettingsSnapshot({ includeOverrides: true })`; route PATCH and server action updates both delegate to `updateProxySettings(...)` to remove behavior drift.
- RB2 validation evidence: `pnpm exec vitest run __tests__/app/actions/admin-proxy.test.ts __tests__/app/v1/admin/settings-proxy-route.test.ts` (targeted action+route parity coverage passing).
- 2026-02-22: `RB3` executed for `OBJ-DEAD-CODE` with low-blast-radius cleanup.
- High-confidence removals: unused exports/functions removed from data/auth layers (`deleteModule`, `deleteProvider`, `createApiKey`, `getSystemSettings`, and legacy duplicate user lookups in `lib/auth/user.ts`). Also narrowed `NEUTRAL_PROVIDER_KEYWORD` visibility to internal module scope.
- Medium-confidence wrappers: upstream settings compatibility helpers in `lib/data/settings.ts` retained but explicitly marked `@deprecated`, with migration hints to `lib/upstream/config.ts` and `lib/upstream/config-service.ts`.
- `REV-006` remains deferred and untouched; no migration from `middleware.ts` to `proxy.ts` was performed.
- 2026-02-22: `RB3` regression hardening executed (post-RB0..RB2).
- Added targeted regression tests for review issues `REV-001`..`REV-005` and `REV-007`:
  - `__tests__/project/workflow-regressions.test.ts`: Cloudflare typegen lifecycle (`pretype-check`/`prebuild`), generated `cloudflare-env.d.ts` presence, lint script shape, and CONTRIBUTING workflow consistency checks.
  - `__tests__/lib/upstream/config-service.test.ts`: canonical proxy service semantics (`null` clear override vs `[]` explicit disable vs explicit list), HTTPS-only rejection, and snapshot override exposure.
  - `__tests__/app/actions/admin-proxy.test.ts` + `__tests__/app/v1/admin/settings-proxy-route.test.ts`: action/route parity assertions for `null` and `[]` payload forwarding to shared service.
- RB3 focused validation evidence:
  - `pnpm exec vitest run __tests__/project/workflow-regressions.test.ts __tests__/lib/upstream/config-service.test.ts __tests__/app/actions/admin-proxy.test.ts __tests__/app/v1/admin/settings-proxy-route.test.ts __tests__/lib/upstream/config.test.ts __tests__/lib/validation/registry.test.ts __tests__/lib/data/settings.test.ts __tests__/app/actions/admin.test.ts`
  - Result: `8` files, `264` tests passing.
- RB3 broader validation evidence:
  - `pnpm test -- --run`
  - Result: `52` files, `977` tests passing.
- Additional guardrail checks in RB3 window:
  - `pnpm type-check`: passing (Cloudflare typegen lifecycle still green).
  - `pnpm lint`: passing with existing warnings only.
  - `pnpm build`: still failing on pre-existing prerender/runtime constraints (dynamic `cookies` usage in statically rendered routes + missing suspense boundary for `useSearchParams()` on `/`), not introduced by RB3 tests.
- `REV-006` remains deferred by compatibility exception (no `proxy.ts` migration tests added; `middleware.ts` path unchanged).
- 2026-02-22: Build-blocker remediation package B executed for prerender/runtime-context compatibility.
- Auth/session compatibility fix: `lib/auth/get-auth.ts` now calls `unstable_rethrow(error)` before fallback logging/`null` return so Next.js dynamic/render-control errors (including `DYNAMIC_SERVER_USAGE`) are not swallowed.
- Dynamic rendering intent is now explicit on auth-sensitive layouts (`app/layout.tsx`, `app/(auth)/layout.tsx`, `app/(protected)/layout.tsx`, `app/(protected)/admin/layout.tsx`) to prevent static prerender attempts where `cookies()`/auth context and Cloudflare runtime context are required.
- Validation evidence: `pnpm build` is green; prior dynamic-cookie prerender errors and sync `getCloudflareContext` static-prerender errors are resolved.
- `REV-006` remains deferred by design; `middleware.ts` retained (no `proxy.ts` migration in this package).
- 2026-02-22: Final validation gates rerun after build-blocker fixes on current working tree.
- `pnpm lint`: passing (`0` errors, `9` existing warnings).
- `pnpm type-check`: passing (`pnpm cf-typegen` + `tsc --noEmit` both green).
- `pnpm test -- --run`: passing (`52` files, `977` tests).
- `pnpm build`: passing; known deferred `REV-006` deprecation warning (`middleware` -> `proxy`) still present by compatibility exception.
- Additional non-blocking notice: Wrangler runtime-types migration advisory (`@cloudflare/workers-types`) emitted during `cf-typegen`.
