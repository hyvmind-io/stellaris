# Token Context Groups (TCG) - Stellaris

Last updated: 2026-02-22

## Scope and Method

- Repository: `stellaris` (Next.js 16 + Cloudflare Workers + Drizzle + React 19)
- Primary objective: produce practical, dependency-aware context groups for reviewer/planner phases
- Coverage: runtime source, tests, and config artifacts used during implementation and review
- Exclusions: `node_modules/`, `.git/`, `.next/`, `.wrangler/`, `.jj/`, `docs/`, `drizzle/meta/`
- Token estimation method: **character-count fallback** (`chars / 3.5`) for approximate sizing
- Counted files: 242 files assigned to groups, 0 orphan files

## TCG Catalog

| Group                  | Est. Tokens |   Files | Purpose                                                                           |
| ---------------------- | ----------: | ------: | --------------------------------------------------------------------------------- |
| `TCG-FOUNDATION`       |      ~18.5k |      18 | Shared schema/types, env, validation, API contracts, core utilities               |
| `TCG-AUTH-SECURITY`    |      ~10.9k |      16 | Authentication, session/key auth middleware, permission gates, login/signup flows |
| `TCG-MODULES-DOMAIN`   |      ~15.6k |      14 | Terraform modules domain (data + API + protected UI routes/components)            |
| `TCG-PROVIDERS-DOMAIN` |      ~23.0k |      24 | Terraform providers domain, upstream proxy, artifact delivery, storage adapters   |
| `TCG-ADMIN-OPS`        |     ~116.2k |      58 | Admin/user/settings/audit/profile operations, admin actions, admin API surfaces   |
| `TCG-UI-SHARED`        |      ~24.5k |      37 | App shell, shared UI primitives, layout and generic client components             |
| `TCG-TESTS-LIB-CORE`   |      ~67.7k |      30 | Library-level unit tests (api/auth/data/storage/validation/utils)                 |
| `TCG-TESTS-APP-ROUTES` |      ~52.9k |      22 | Route/action integration-style tests under `__tests__/app/**`                     |
| `TCG-CONFIG-INFRA`     |      ~13.3k |      23 | Build/runtime config, migrations, scripts, toolchain files                        |
| **TOTAL**              | **~342.6k** | **242** | Full reviewable code/test/config context                                          |

## Group Definitions

### `TCG-FOUNDATION`

- **Main globs/paths**
  - `db/*.ts`
  - `types/*.ts`
  - `lib/api/*.ts`
  - `lib/validation/*.ts`
  - `lib/utils.ts`, `lib/utils/version.ts`, `lib/utils/sql.ts`
  - `lib/env.ts`, `lib/storage/types.ts`, `lib/data/errors.ts`, `lib/data/concurrency.ts`
- **Why this exists**
  - Central contracts and helpers used by nearly every domain.

### `TCG-AUTH-SECURITY`

- **Main globs/paths**
  - `lib/auth/*.ts`
  - `middleware.ts`, `lib/permissions.ts`
  - `app/(auth)/**`
  - `components/auth/**`
  - `app/unauthorized/**`
- **Why this exists**
  - Keeps identity and access logic isolated for security-focused reviews.

### `TCG-MODULES-DOMAIN`

- **Main globs/paths**
  - `lib/data/modules.ts`, `lib/data/aliases.ts`
  - `app/v1/modules/**`
  - `app/(protected)/modules/**`
  - `components/module*.tsx`
- **Why this exists**
  - Groups module protocol behavior, data access, and module-facing UI together.

### `TCG-PROVIDERS-DOMAIN`

- **Main globs/paths**
  - `lib/data/providers.ts`, `lib/data/stats.ts`
  - `lib/storage/**`, `lib/upstream/**`
  - `app/v1/providers/**`
  - `app/.well-known/**`, `app/health/**`
  - `app/(protected)/providers/**`, `components/provider*.tsx`
- **Why this exists**
  - Captures provider publishing/delivery lifecycle and artifact transport concerns.

### `TCG-ADMIN-OPS`

- **Main globs/paths**
  - `app/(protected)/admin/**`
  - `app/v1/admin/**`, `app/v1/api-keys/**`
  - `components/admin/**`
  - `app/(protected)/profile/**`, `components/profile/**`
  - `app/actions/**`
  - `lib/data/users.ts`, `lib/data/settings.ts`, `lib/data/api-keys.ts`, `lib/data/audit.ts`
- **Why this exists**
  - Largest operational surface: administration, profile/key management, settings, and audits.

### `TCG-UI-SHARED`

- **Main globs/paths**
  - `app/layout.tsx`, `app/(protected)/layout.tsx`, `app/page.tsx`, `app/globals.css`
  - `components/ui/**`
  - `components/layout/**`
  - `components/search-input.tsx`, `components/theme-toggle.tsx`
  - `components/pagination.tsx`, `components/code-block.tsx`, `components/copy-button.tsx`, `components/stat-card.tsx`
- **Why this exists**
  - Shared visual and interaction primitives reused across module/provider/admin flows.

### `TCG-TESTS-LIB-CORE`

- **Main globs/paths**
  - `__tests__/lib/**`
  - `__tests__/app/actions/**`
  - `__mocks__/**`
  - `vitest.config.ts`
- **Why this exists**
  - Fastest entry point for contract and utility correctness verification.

### `TCG-TESTS-APP-ROUTES`

- **Main globs/paths**
  - `__tests__/app/**` (excluding `__tests__/app/actions/**`)
- **Why this exists**
  - Focuses on route behavior, API interactions, and integration-style assertions.

### `TCG-CONFIG-INFRA`

- **Main globs/paths**
  - `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`
  - `tsconfig.json`, `next.config.ts`, `open-next.config.ts`, `postcss.config.mjs`
  - `wrangler.jsonc`, `drizzle.config.ts`, `drizzle/**`
  - `scripts/**`, `components.json`, `next-env.d.ts`
- **Why this exists**
  - Required for deployment/build/runtime constraints and migration workflows.

## Cross-Group Dependency Map (Import-Derived)

Primary dependency flow:

`FOUNDATION -> AUTH/DOMAINS/ADMIN/UI -> TESTS`

Observed high-signal edges (import count, approximate):

- `TCG-ADMIN-OPS -> TCG-UI-SHARED` (~132)
- `TCG-ADMIN-OPS -> TCG-FOUNDATION` (~109)
- `TCG-PROVIDERS-DOMAIN -> TCG-FOUNDATION` (~32)
- `TCG-MODULES-DOMAIN -> TCG-FOUNDATION` (~25)
- `TCG-UI-SHARED -> TCG-FOUNDATION` (~28)
- `TCG-TESTS-APP-ROUTES -> {AUTH, MODULES, PROVIDERS, ADMIN, FOUNDATION}`

Important coupling notes:

- `TCG-ADMIN-OPS` is the largest and most connected group; it touches auth, shared UI, and both domains.
- `TCG-MODULES-DOMAIN` and `TCG-PROVIDERS-DOMAIN` have light cross-calls; they are mostly separable after `TCG-FOUNDATION`.
- `TCG-UI-SHARED` pulls from foundational helpers and some auth/provider-aware components.

## Loading Guidance by Review Task

### Dead code review

- Load: `TCG-FOUNDATION` + target domain group (`TCG-MODULES-DOMAIN` or `TCG-PROVIDERS-DOMAIN`) + corresponding test group.
- If dead-code suspicion is in admin flows, include `TCG-ADMIN-OPS` and `TCG-UI-SHARED`.

### UI/backend wiring review

- Load in order:
  1. `TCG-FOUNDATION`
  2. `TCG-UI-SHARED`
  3. domain group (`TCG-MODULES-DOMAIN` or `TCG-PROVIDERS-DOMAIN`)
  4. `TCG-ADMIN-OPS` if wiring crosses protected/admin/profile flows

### Auth/security review

- Load in order:
  1. `TCG-FOUNDATION`
  2. `TCG-AUTH-SECURITY`
  3. `TCG-ADMIN-OPS`
  4. affected domain group(s)
  5. `TCG-TESTS-APP-ROUTES`

## Risks and Known Blind Spots

- Token counts are fallback estimates; exact LLM-token parity requires `tiktoken-ts` measurement.
- `TCG-ADMIN-OPS` is near the practical upper bound (~116k); further growth should trigger split (`ADMIN-USERS` vs `ADMIN-CATALOG`).
- Import-derived dependencies do not capture runtime dynamic behavior (env toggles, Cloudflare bindings, storage backend switches).
- Tests are broad and include mocked/runtime-heavy cases; selective loading is recommended to avoid noise.
- Existing root `TCG.md` likely predates current architecture and underestimates current test/admin surface.

## Suggested Next Split (if required)

- Split `TCG-ADMIN-OPS` into:
  - `TCG-ADMIN-USERS-SECURITY` (`users`, `api-keys`, `profile`, role management)
  - `TCG-ADMIN-CATALOG-SETTINGS` (`admin/modules`, `admin/providers`, settings, audit)

This keeps each admin sub-group near ~55k-65k estimated tokens and improves reviewer focus.
