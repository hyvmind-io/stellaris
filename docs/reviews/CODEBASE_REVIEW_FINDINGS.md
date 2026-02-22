# CODEBASE_REVIEW_FINDINGS

Date: 2026-02-22

## 1) Executive summary

- Completed a full post-TCG review across FOUNDATION, AUTH, MODULES, PROVIDERS, ADMIN, UI, TESTS, and CONFIG/INFRA domains using `docs/reviews/TCG_CONTEXT_GROUPS.md` and `docs/reviews/TCG_INDEX.json` as the review map.
- The codebase is broadly healthy at runtime/test level (`pnpm test -- --run`: 49 files / 965 tests passing), but there are critical workflow regressions in engineering guardrails (`pnpm type-check`, `pnpm build`, `pnpm lint`).
- Highest-risk issues are config/tooling drift and one behavior mismatch in upstream proxy settings that can silently disable fallback registries.
- Dead code is present but concentrated in low-risk utility/data-layer exports; no broad removals were applied.

## 2) Findings table

| issue_id | severity | area                                               | file refs                                                                                                                                      | evidence                                                                                                                                                                                                                                                                            |
| -------- | -------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REV-001  | critical | Env/Build mismatch                                 | `db/client.ts:17`, `lib/storage/r2.ts:34`, `package.json:20`                                                                                   | `pnpm type-check` and `pnpm build` fail with `Property 'DB' does not exist on type 'CloudflareEnv'` and `Property 'MODULES_STORAGE' does not exist on type 'CloudflareEnv'`; `cf-typegen` script exists but generated types are missing from workspace.                             |
| REV-002  | high     | Tooling drift (lint)                               | `package.json:15`, `CONTRIBUTING.md:94`                                                                                                        | `pnpm lint` fails with `Invalid project directory provided, no such directory: .../stellaris/lint`, indicating `next lint` script drift vs Next 16 behavior.                                                                                                                        |
| REV-003  | high     | Functional drift (proxy settings UX vs behavior)   | `components/admin/proxy-settings.tsx:285`, `components/admin/proxy-settings.tsx:311`, `app/actions/admin.ts:635`, `lib/upstream/config.ts:154` | UI says empty registries "use defaults", but save path persists `[]`; resolver treats explicit empty array as "no upstream". Result: silent fallback disablement.                                                                                                                   |
| REV-004  | medium   | Security/policy drift                              | `lib/upstream/config.ts:10`, `lib/upstream/config.ts:80`                                                                                       | Comments/documentation state HTTPS-only normalization, but implementation accepts `http:` URLs. This weakens transport guarantees and mismatches intended policy.                                                                                                                   |
| REV-005  | medium   | Unwired/duplicate admin surface                    | `app/v1/admin/settings/proxy/route.ts:21`, `components/admin/proxy-settings.tsx:17`, `app/actions/admin.ts:562`                                | Admin proxy settings exist as both API route and server actions. UI is wired to server actions, no in-repo consumers of `/v1/admin/settings/proxy`, and no route tests under `__tests__/app/v1/admin/**` for this endpoint.                                                         |
| REV-006  | medium   | Platform compatibility exception (framework drift) | `middleware.ts:47`, `package.json:33`, `open-next.config.ts:1`                                                                                 | Next 16 warns that `middleware.ts` is deprecated in favor of `proxy.ts`, but this deployment uses `@opennextjs/cloudflare` and currently relies on middleware compatibility in the adapter path. For this codebase, migration is deferred to avoid adapter/runtime regression risk. |
| REV-007  | medium   | Security posture risk                              | `lib/data/settings.ts:46`, `app/actions/admin.ts:150`, `CONTRIBUTING.md:89`                                                                    | Signup status fails open on DB error (`return true`). This is test-covered behavior; risk is unintended signup enablement during partial outages.                                                                                                                                   |

## 3) Dead code candidates

High-confidence (no runtime references found, or test-only references):

- `lib/data/modules.ts:348` — `deleteModule` export has no in-repo callers.
- `lib/data/providers.ts:379` — `deleteProvider` export has no in-repo callers.
- `lib/data/settings.ts:113` — `getSystemSettings` export has no in-repo callers.
- `lib/auth/api-keys.ts:138` — `createApiKey` export has no in-repo callers.
- `lib/auth/user.ts:19` — `getUserById` export appears unused.
- `lib/auth/user.ts:24` — `getUserByUsername` export appears unused.

Medium-confidence (test-only usage, likely legacy API surface):

- `lib/data/settings.ts:142` — `setModuleUpstreamProxyEnabled` appears test-only.
- `lib/data/settings.ts:163` — `setProviderUpstreamProxyEnabled` appears test-only.
- `lib/data/settings.ts:181` — `getModuleUpstreamRegistries` appears test-only.
- `lib/data/settings.ts:200` — `getProviderUpstreamRegistries` appears test-only.
- `lib/data/settings.ts:190` — `setModuleUpstreamRegistries` appears test-only.
- `lib/data/settings.ts:209` — `setProviderUpstreamRegistries` appears test-only.

## 4) Unwired feature candidates

- `app/v1/admin/settings/proxy/route.ts` likely unwired internally: admin UI uses server actions (`getProxySettingsAction` / `updateProxySettingsAction`) instead of this API route.
- Proxy settings have two write/read paths (server actions + API route) with duplicated logic, increasing divergence risk and reducing confidence in consistent behavior.
- No route-level tests were found for `/v1/admin/settings/proxy`, while nearby admin/provider routes are covered.

## 5) Bug/risk candidates

- **Blocking CI/build path**: missing Cloudflare binding typings (`CloudflareEnv`) causes type-check/build failure.
- **Lint command broken**: current script does not run lint checks in this Next 16 setup.
- **Proxy fallback bug**: empty textarea in UI can disable all upstream fallback despite UI copy claiming default fallback usage.
- **Policy drift**: HTTP upstream URLs accepted despite HTTPS-only stated intent.
- **Framework drift with adapter constraint**: Next 16 deprecation warning exists, but immediate migration is intentionally deferred for OpenNext Cloudflare compatibility.
- **Security posture**: fail-open signup behavior can reopen public registration under DB instability.

## 6) Quick wins vs deep refactors

### Quick wins (low risk, high impact)

- Add/commit/update Cloudflare env typing workflow so `pnpm type-check` and `pnpm build` are green by default (either generated file lifecycle or explicit ambient interface strategy).
- Replace `next lint` script with Next 16-compatible ESLint invocation and align `CONTRIBUTING.md` check command.
- Fix proxy settings save semantics for empty lists (distinguish "clear override" from "set empty").
- Enforce HTTPS-only in `normaliseRegistryUrl` (or update docs if HTTP is intentionally supported).

### Deep refactors (higher effort)

- Consolidate proxy settings logic into a single source (route or server actions) to eliminate dual-write drift.
- Rationalize settings API surface (`lib/data/settings.ts`) by removing or deprecating test-only/legacy exports after confirming no external consumers.
- Keep `middleware.ts` as the active gate in this OpenNext Cloudflare deployment; defer `proxy.ts` migration until adapter compatibility is explicitly confirmed.

## 7) REV-006 disposition (updated)

- Decision: do not execute the `middleware.ts` -> `proxy.ts` migration in current remediation scope.
- Status: deferred/blocked by platform compatibility constraint for OpenNext Cloudflare deployment.
- Guardrails:
  - Keep auth/request gating logic in `middleware.ts`.
  - Treat Next deprecation output as known warning, not an implementation action item in this stack.
  - Re-open only when OpenNext Cloudflare documentation/changelog confirms `proxy.ts` parity for this deployment model and local preview + production deploy validation pass.
- Safe risk-reduction alternatives (without migration):
  - Keep matcher scope minimal and explicit in `middleware.ts` to reduce unintended interception.
  - Add focused integration tests for auth redirects/matcher exclusions to catch regressions early.
  - Add an explicit reviewer note in remediation/orchestration docs so `proxy.ts` migration is not re-proposed without compatibility evidence.
