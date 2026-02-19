# Token Context Groups — Stellaris

## Overview

Stellaris is a private Terraform/OpenTofu module and provider registry built on
Next.js 16, Cloudflare Workers (D1 + R2), Drizzle ORM, and React 19. The
codebase is compact (~64k tokens of source, ~14k of tests) and cleanly
layered:

```
Foundation → Data/Auth/Storage → API Routes → Web UI
```

This document organizes every source file into **Token Context Groups (TCGs)**
— dependency-aware clusters optimized for LLM-assisted development. Each group
is small enough to load individually or in any combination without exceeding
context limits.

> **Token estimates** below use chars ÷ 3.5 (TypeScript/TSX average).
> The **entire codebase** (all 6 TCGs) totals **~62.5k tokens** and can be
> loaded simultaneously in most modern LLM context windows.

---

## TCG Index

| #   | Group              | Tokens      | Files  | Purpose                                              |
| --- | ------------------ | ----------- | ------ | ---------------------------------------------------- |
| 1   | **TCG-FOUNDATION** | ~5,100      | 9      | Core types, DB client, utils, API/validation helpers |
| 2   | **TCG-MODULES**    | ~7,000      | 9      | Module domain: data layer + API routes + auth        |
| 3   | **TCG-PROVIDERS**  | ~10,300     | 13     | Provider domain: data layer + API routes + storage   |
| 4   | **TCG-WEB-UI**     | ~23,200     | 35     | Pages, components, CSS, layout, shadcn/ui primitives |
| 5   | **TCG-TESTS**      | ~14,200     | 6      | All test suites + Vitest config                      |
| 6   | **TCG-CONFIG**     | ~2,800      | 12     | Project config, infra, DB migrations                 |
|     | **TOTAL**          | **~62,600** | **84** |                                                      |

### Supplementary (Documentation — not in token budget)

| Group    | Tokens  | Files | Purpose                                 |
| -------- | ------- | ----- | --------------------------------------- |
| TCG-DOCS | ~18,200 | 5     | README, CONTRIBUTING, API docs, scripts |

---

## Detailed Groups

### 1. TCG-FOUNDATION (~5,100 tokens · 9 files)

The shared foundation imported by almost every other file. Includes the
database schema and client, utility functions, environment config, API
error/response helpers, Zod validation schemas, and R2 key generators.

**Load this group first — it's a dependency of all other groups.**

| File                         | Tokens | Description                               |
| ---------------------------- | ------ | ----------------------------------------- |
| `db/schema.ts`               | ~1,442 | Drizzle schema: 5 tables + inferred types |
| `db/client.ts`               | ~213   | D1 client via `getCloudflareContext()`    |
| `lib/utils.ts`               | ~86    | `cn()` — Tailwind class merger            |
| `lib/env.ts`                 | ~92    | Type-safe environment with Zod            |
| `lib/utils/version.ts`       | ~442   | Semver validation, comparison, normalize  |
| `lib/api/errors.ts`          | ~345   | Error response helpers (404, 400, 422…)   |
| `lib/api/response.ts`        | ~499   | Response helpers (JSON, binary, text…)    |
| `lib/validation/registry.ts` | ~1,794 | All Zod schemas for API input validation  |
| `lib/storage/keys.ts`        | ~206   | R2 key generators (pure functions)        |

**Key exports consumed downstream:**

- Types: `Module`, `NewModule`, `Provider`, `NewProvider`, `ProviderPlatform`, `GpgPublicKey`, `ApiKey`
- Client: `getDb()`
- Helpers: `cn()`, `env`, `isValidSemver()`, `compareVersions()`, `normalizeVersion()`
- API: `notFound()`, `badRequest()`, `conflict()`, `jsonResponse()`, `binaryResponse()`, `textResponse()`
- Validation: `moduleVersionsParams`, `moduleDownloadParams`, `providerDownloadParams`, `providerPublishData`, etc.
- Storage: `generateModuleKey()`, `generateProviderKey()`

**Import graph (what depends on Foundation):**

- TCG-MODULES → `db/schema`, `db/client`, `lib/validation/*`, `lib/api/*`, `lib/storage/keys`
- TCG-PROVIDERS → `db/schema`, `db/client`, `lib/validation/*`, `lib/api/*`, `lib/storage/keys`
- TCG-WEB-UI → `db/schema` (types), `lib/utils` (cn), `lib/data/*` (server components)
- TCG-TESTS → `lib/validation/*`, `lib/api/*`, `lib/storage/keys`, `lib/utils/version`

---

### 2. TCG-MODULES (~7,000 tokens · 9 files)

The **module registry domain**: data access layer, all module API route
handlers, and the shared authentication layer (auth is included here because
it's small and used by both module and provider write endpoints).

| File                                                            | Tokens | Description                                 |
| --------------------------------------------------------------- | ------ | ------------------------------------------- |
| `lib/auth/api-keys.ts`                                          | ~970   | API key hashing, generation, validation     |
| `lib/auth/middleware.ts`                                        | ~392   | `requireAuth()` per-route guard             |
| `lib/data/modules.ts`                                           | ~1,858 | Module CRUD + browse + pagination           |
| `app/v1/modules/route.ts`                                       | ~490   | `GET /v1/modules` — list/search             |
| `app/v1/modules/[namespace]/[name]/[system]/versions/route.ts`  | ~420   | `GET …/versions` — list versions            |
| `app/v1/modules/[namespace]/[name]/[system]/route.ts`           | ~416   | `GET …/system` — latest version             |
| `app/v1/modules/[namespace]/[name]/[system]/[version]/route.ts` | ~1,485 | `GET/POST/DELETE …/version` — CRUD          |
| `app/v1/modules/[…]/[version]/download/route.ts`                | ~471   | `GET …/download` — X-Terraform-Get redirect |
| `app/v1/modules/tarball/[...path]/route.ts`                     | ~515   | `GET /v1/modules/tarball/*` — serve from R2 |

**Depends on:** TCG-FOUNDATION (`db/*`, `lib/api/*`, `lib/validation/*`, `lib/storage/keys`)

**Key APIs:**

- `POST /v1/modules/:ns/:name/:system/:version` — Publish module (multipart: tarball)
- `GET /v1/modules/:ns/:name/:system/versions` — List versions (Terraform protocol)
- `GET /v1/modules/:ns/:name/:system/:version/download` — Download redirect
- `DELETE /v1/modules/:ns/:name/:system/:version` — Delete version

---

### 3. TCG-PROVIDERS (~10,300 tokens · 13 files)

The **provider registry domain**: data access layer, all provider API route
handlers, R2 storage operations, registry stats, API key management endpoint,
and the service discovery/health endpoints.

| File                                                     | Tokens | Description                                  |
| -------------------------------------------------------- | ------ | -------------------------------------------- |
| `lib/data/providers.ts`                                  | ~2,637 | Provider CRUD + browse + platform queries    |
| `lib/data/stats.ts`                                      | ~376   | Registry-wide statistics (homepage)          |
| `lib/storage/r2.ts`                                      | ~960   | R2 upload/get/delete for modules & providers |
| `app/v1/providers/route.ts`                              | ~455   | `GET /v1/providers` — list/search            |
| `app/v1/providers/[namespace]/[type]/versions/route.ts`  | ~486   | `GET …/versions` — list versions + platforms |
| `app/v1/providers/[namespace]/[type]/[version]/route.ts` | ~2,210 | `GET/POST/DELETE …/version` — full CRUD      |
| `app/v1/providers/[…]/download/[os]/[arch]/route.ts`     | ~623   | `GET …/download/:os/:arch` — find package    |
| `app/v1/providers/[…]/download/[os]/[arch]/zip/route.ts` | ~405   | `GET …/zip` — serve binary from R2           |
| `app/v1/providers/[…]/sha256sums/route.ts`               | ~369   | `GET …/sha256sums` — serve checksum file     |
| `app/v1/providers/[…]/sha256sums.sig/route.ts`           | ~412   | `GET …/sha256sums.sig` — serve signature     |
| `app/v1/api-keys/route.ts`                               | ~1,240 | `GET/POST /v1/api-keys` — key management     |
| `app/.well-known/terraform.json/route.ts`                | ~102   | Service discovery endpoint                   |
| `app/health/route.ts`                                    | ~63    | Health check endpoint                        |

**Depends on:** TCG-FOUNDATION (`db/*`, `lib/api/*`, `lib/validation/*`, `lib/storage/keys`)
**Cross-depends on:** TCG-MODULES (`lib/auth/*` — shared auth middleware)

**Key APIs:**

- `POST /v1/providers/:ns/:type/:version` — Publish provider (multipart: zips + SHA sums + metadata JSON)
- `GET /v1/providers/:ns/:type/versions` — List versions with platforms (Terraform protocol)
- `GET /v1/providers/:ns/:type/:version/download/:os/:arch` — Find provider package
- `GET /.well-known/terraform.json` — Terraform service discovery
- `POST /v1/api-keys` — Create API key (bootstrap: first key needs no auth)

---

### 4. TCG-WEB-UI (~23,200 tokens · 35 files)

All frontend code: Next.js pages (Server Components), React client components,
layout components, shadcn/ui primitives, and the Tailwind v4 / Dracula Pro
theme system.

#### Pages

| File                                     | Tokens | Description                               |
| ---------------------------------------- | ------ | ----------------------------------------- |
| `app/page.tsx`                           | ~1,502 | Homepage: hero, stats, search, usage      |
| `app/layout.tsx`                         | ~309   | Root layout: ThemeProvider, Header/Footer |
| `app/globals.css`                        | ~2,541 | TW v4 theme tokens (Dracula/Alucard)      |
| `app/modules/page.tsx`                   | ~796   | Module browse page with search            |
| `app/modules/loading.tsx`                | ~283   | Module list skeleton                      |
| `app/modules/[…]/[system]/page.tsx`      | ~1,535 | Module detail: usage, versions sidebar    |
| `app/modules/[…]/[system]/loading.tsx`   | ~237   | Module detail skeleton                    |
| `app/modules/[…]/[system]/not-found.tsx` | ~183   | Module 404 page                           |
| `app/providers/page.tsx`                 | ~788   | Provider browse page with search          |
| `app/providers/loading.tsx`              | ~270   | Provider list skeleton                    |
| `app/providers/[…]/[type]/page.tsx`      | ~1,451 | Provider detail: platforms, versions      |
| `app/providers/[…]/[type]/loading.tsx`   | ~304   | Provider detail skeleton                  |
| `app/providers/[…]/[type]/not-found.tsx` | ~184   | Provider 404 page                         |

#### Feature Components

| File                           | Tokens | Description                         |
| ------------------------------ | ------ | ----------------------------------- |
| `components/module-card.tsx`   | ~539   | Module card (server component)      |
| `components/provider-card.tsx` | ~512   | Provider card (server component)    |
| `components/stat-card.tsx`     | ~286   | Statistics card (homepage)          |
| `components/search-input.tsx`  | ~888   | Debounced search (client component) |
| `components/code-block.tsx`    | ~403   | HCL code display with copy          |
| `components/copy-button.tsx`   | ~423   | Copy-to-clipboard button (client)   |
| `components/pagination.tsx`    | ~517   | Pagination controls (client)        |
| `components/theme-toggle.tsx`  | ~407   | Dark/light mode toggle (client)     |

#### Layout Components

| File                             | Tokens | Description                    |
| -------------------------------- | ------ | ------------------------------ |
| `components/layout/header.tsx`   | ~318   | Sticky header with nav + theme |
| `components/layout/footer.tsx`   | ~395   | Footer with links              |
| `components/layout/nav-link.tsx` | ~185   | Active-aware nav link (client) |

#### shadcn/ui Primitives

| File                              | Tokens | Description            |
| --------------------------------- | ------ | ---------------------- |
| `components/ui/badge.tsx`         | ~322   | Badge component        |
| `components/ui/button.tsx`        | ~543   | Button with variants   |
| `components/ui/card.tsx`          | ~531   | Card family (6 parts)  |
| `components/ui/command.tsx`       | ~1,400 | Command palette (cmdk) |
| `components/ui/dialog.tsx`        | ~1,099 | Dialog/modal           |
| `components/ui/dropdown-menu.tsx` | ~2,178 | Dropdown menu (Radix)  |
| `components/ui/input.tsx`         | ~226   | Input field            |
| `components/ui/scroll-area.tsx`   | ~473   | Scroll area (Radix)    |
| `components/ui/separator.tsx`     | ~220   | Separator line         |
| `components/ui/skeleton.tsx`      | ~75    | Loading skeleton       |
| `components/ui/tabs.tsx`          | ~542   | Tabs component         |
| `components/ui/tooltip.tsx`       | ~345   | Tooltip (Radix)        |

**Depends on:** TCG-FOUNDATION (`lib/utils` for `cn()`, `db/schema` for types)
**Data dependencies:** `lib/data/modules` (browseModules), `lib/data/providers` (browseProviders, getProviderVersions), `lib/data/stats` (getRegistryStats)

---

### 5. TCG-TESTS (~14,200 tokens · 6 files)

All test suites using Vitest + happy-dom. Tests are pure unit tests against
the Foundation layer (no mocking of D1/R2 — those are tested indirectly
through the API routes).

| File                                        | Tokens | Tests | Description                |
| ------------------------------------------- | ------ | ----- | -------------------------- |
| `__tests__/lib/utils/version.test.ts`       | ~2,185 | 27    | Semver utilities           |
| `__tests__/lib/storage/keys.test.ts`        | ~2,028 | 22    | R2 key generation          |
| `__tests__/lib/validation/registry.test.ts` | ~5,631 | 72    | All Zod validation schemas |
| `__tests__/lib/api/errors.test.ts`          | ~1,822 | 19    | Error response helpers     |
| `__tests__/lib/api/response.test.ts`        | ~2,339 | 25    | Response helpers           |
| `vitest.config.ts`                          | ~160   | —     | Test runner configuration  |

**Depends on:** TCG-FOUNDATION (all tested modules)

**Test commands:**

```bash
pnpm test              # Run all tests (watch mode)
pnpm test:ui           # Browser-based Vitest UI
pnpm test:coverage     # Coverage report
```

---

### 6. TCG-CONFIG (~2,800 tokens · 12 files)

Project configuration, build tooling, infrastructure definitions, and database
migrations. Rarely loaded during feature development — primarily needed for
setup, CI/CD, or infrastructure changes.

| File                              | Tokens | Description                              |
| --------------------------------- | ------ | ---------------------------------------- |
| `package.json`                    | ~790   | Dependencies, scripts, engines           |
| `tsconfig.json`                   | ~215   | TypeScript strict config + `@/` alias    |
| `wrangler.jsonc`                  | ~273   | Cloudflare Workers: D1, R2 bindings      |
| `next.config.ts`                  | ~103   | Next.js config + OpenNext dev init       |
| `open-next.config.ts`             | ~31    | OpenNext.js Cloudflare adapter           |
| `drizzle.config.ts`               | ~42    | Drizzle Kit: SQLite dialect, schema path |
| `postcss.config.mjs`              | ~42    | PostCSS: @tailwindcss/postcss            |
| `components.json`                 | ~113   | shadcn/ui configuration                  |
| `next-env.d.ts`                   | ~71    | Next.js type references (auto-generated) |
| `drizzle/0000_init.sql`           | ~965   | Initial SQL migration (5 tables)         |
| `drizzle/meta/_journal.json`      | ~56    | Migration journal                        |
| `drizzle/meta/0000_snapshot.json` | ~58    | Schema snapshot (empty)                  |

**No dependencies on other TCGs.**

---

### Supplementary: TCG-DOCS (~18,200 tokens · 5 files)

Documentation files. Not included in the main token budget — load on demand
when working on docs or onboarding.

| File                        | Tokens | Description                         |
| --------------------------- | ------ | ----------------------------------- |
| `README.md`                 | ~5,981 | Project overview, setup, deployment |
| `CONTRIBUTING.md`           | ~1,348 | Contributing guide, code style      |
| `docs/API.md`               | ~8,681 | Full API reference documentation    |
| `BATCH_1_COMPLETION.md`     | ~1,745 | Development batch completion notes  |
| `scripts/setup-local-db.sh` | ~489   | Local D1 database setup script      |

---

## Cross-Group Dependencies

```
                         ┌──────────────────┐
                         │  TCG-FOUNDATION  │
                         │  (~5.1k tokens)  │
                         │                  │
                         │  db/schema+client│
                         │  lib/api/*       │
                         │  lib/validation/*│
                         │  lib/utils*      │
                         │  lib/env         │
                         │  lib/storage/keys│
                         └────────┬─────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    │             │             │
              ┌─────▼─────┐ ┌────▼──────┐ ┌────▼────┐
              │TCG-MODULES│ │TCG-PROVID.│ │TCG-TESTS│
              │ (~7k tok) │ │(~10.3k t.)│ │(~14.2k) │
              │           │ │           │ │         │
              │lib/auth/* │◄┤ (shares   │ │ Unit    │
              │lib/data/  │ │  auth)    │ │ tests   │
              │  modules  │ │lib/data/  │ │ for     │
              │app/v1/    │ │ providers │ │ Found.  │
              │  modules/*│ │ stats     │ │ layer   │
              └─────┬─────┘ │lib/stor/r2│ └─────────┘
                    │       │app/v1/    │
                    │       │ providers*│
                    │       │app/v1/    │
                    │       │ api-keys  │
                    │       └─────┬─────┘
                    │             │
                    └──────┬──────┘
                           │ (data from lib/data/*)
                     ┌─────▼──────┐
                     │ TCG-WEB-UI │
                     │(~23.2k tok)│
                     │            │
                     │ app/ pages │
                     │ components/│
                     │ globals.css│
                     └────────────┘

              ┌────────────┐
              │ TCG-CONFIG │  (standalone — no runtime dependencies)
              │ (~2.8k tok)│
              └────────────┘
```

### Dependency Summary

| Group      | Depends On                     | Depended On By                    |
| ---------- | ------------------------------ | --------------------------------- |
| FOUNDATION | —                              | MODULES, PROVIDERS, WEB-UI, TESTS |
| MODULES    | FOUNDATION                     | PROVIDERS (auth shared), WEB-UI   |
| PROVIDERS  | FOUNDATION, MODULES (auth)     | WEB-UI                            |
| WEB-UI     | FOUNDATION, MODULES, PROVIDERS | —                                 |
| TESTS      | FOUNDATION                     | —                                 |
| CONFIG     | —                              | —                                 |

---

## Usage Guidelines

### Common Loading Combinations

| Workflow                         | Groups to Load                            | Total Tokens |
| -------------------------------- | ----------------------------------------- | ------------ |
| **Module API development**       | FOUNDATION + MODULES                      | ~12,100      |
| **Provider API development**     | FOUNDATION + MODULES + PROVIDERS          | ~22,400      |
| **Frontend development**         | FOUNDATION + WEB-UI                       | ~28,300      |
| **Full API work**                | FOUNDATION + MODULES + PROVIDERS          | ~22,400      |
| **Writing/fixing tests**         | FOUNDATION + TESTS                        | ~19,300      |
| **Full-stack feature**           | FOUNDATION + MODULES + PROVIDERS + WEB-UI | ~45,600      |
| **Everything (entire codebase)** | All 6 groups                              | ~62,600      |
| **Infrastructure/config work**   | CONFIG                                    | ~2,800       |
| **Onboarding / overview**        | FOUNDATION + CONFIG + DOCS                | ~26,100      |

### Loading Priority

1. **Always load FOUNDATION first** — it contains the types and helpers everything else needs
2. **Load domain groups as needed** — MODULES and PROVIDERS are independent (except auth sharing)
3. **WEB-UI is self-contained** for purely visual changes, but load domain groups too for data-layer context
4. **TESTS only need FOUNDATION** — they test the foundation layer directly
5. **CONFIG is standalone** — load when working on infrastructure, CI/CD, or dependency updates

---

## File Coverage Verification

### All source files accounted for: ✅

```
Total source files:  84 (TypeScript/TSX/CSS/JSON/SQL/config)
Files in TCGs:       84
Orphaned files:      0
```

### Files NOT in TCGs (intentional exclusions):

- `node_modules/` — Dependencies
- `.git/`, `.jj/` — Version control
- `.next/` — Build artifacts
- `.wrangler/` — Local dev runtime state
- `public/` — Static assets (empty)

---

## Maintenance Notes

### When to Update This File

- **New files added**: Assign to the appropriate TCG, update token estimates
- **Files moved/renamed**: Update paths in the relevant TCG
- **Significant growth** (>30% in a group): Consider splitting
- **New domain added**: Create a new TCG following the pattern

### Token Budget Rules

- **Maximum TCG size**: 130k tokens (hard limit)
- **Ideal TCG size**: 10k–50k tokens
- **Foundation TCG**: Keep minimal (~5–10k) — it's loaded with every combination
- **Current status**: All groups well within limits ✅

### Splitting Triggers

The codebase is currently compact enough that no splits are needed. Consider
splitting if:

- **TCG-WEB-UI** grows past ~40k tokens → split into TCG-WEB-PAGES + TCG-UI-COMPONENTS
- **TCG-PROVIDERS** grows past ~25k tokens → split API routes from data layer
- **TCG-TESTS** grows past ~30k tokens → split by domain (module tests vs provider tests)
