# AGENTS.md — Stellaris

Private Terraform/OpenTofu module and provider registry. Next.js 16 + React 19 on Cloudflare Workers (D1 + R2) via OpenNext.js. Drizzle ORM, shadcn/ui, Tailwind CSS v4, Zod validation.

## Commands

```bash
pnpm dev              # Local dev (Turbopack)
pnpm build            # Next.js build
pnpm lint             # ESLint (next lint)
pnpm type-check       # tsc --noEmit
pnpm test             # Vitest (watch mode)
pnpm test -- --run    # Vitest single run (CI)
pnpm test -- path/to/file.test.ts        # Run single test file
pnpm test -- -t "test name"              # Run single test by name
pnpm test:coverage    # Coverage (v8)
pnpm test:ui          # Vitest UI

# Cloudflare
pnpm preview          # Build + local Workers preview
pnpm deploy           # Build + deploy to Cloudflare
pnpm cf-typegen       # Generate CloudflareEnv types

# Database (Drizzle + D1)
pnpm db:generate      # Generate migrations from schema
pnpm db:migrate       # Run migrations
pnpm db:push          # Push schema directly
pnpm db:studio        # Drizzle Studio
```

## Tech Stack

- **Runtime**: Cloudflare Workers (via @opennextjs/cloudflare)
- **Framework**: Next.js 16 (canary), React 19, App Router only
- **DB**: Cloudflare D1 (SQLite) via Drizzle ORM — schema at `db/schema.ts`
- **Storage**: Cloudflare R2 for module tarballs and provider zips
- **UI**: shadcn/ui + Tailwind CSS v4 + Radix primitives + lucide-react icons
- **Validation**: Zod schemas in `lib/validation/`
- **Testing**: Vitest + happy-dom + @vitejs/plugin-react
- **Theme**: Dracula Pro (dark) / Alucard (light) via next-themes, dark-first design
- **Package manager**: pnpm

## Project Structure

```
app/
  .well-known/terraform.json/  — Terraform service discovery
  health/                      — Health check endpoint
  v1/modules/                  — Terraform Module Registry Protocol API
  v1/providers/                — Terraform Provider Registry Protocol API
  modules/                     — Browse UI pages (SSR)
  providers/                   — Browse UI pages (SSR)
  layout.tsx                   — Root layout with ThemeProvider
  globals.css                  — Tailwind v4 theme + CSS custom props
components/
  ui/                          — shadcn/ui primitives (DO NOT manually edit)
  layout/                      — Header, Footer, NavLink
  *.tsx                        — Shared app components
db/
  schema.ts                    — Drizzle schema (modules, providers, platforms, gpg_keys, api_keys)
  client.ts                    — DB client factory (getDb)
lib/
  api/errors.ts                — Error response helpers (notFound, badRequest, conflict, etc.)
  api/response.ts              — Response helpers (jsonResponse, binaryResponse, etc.)
  data/modules.ts              — Module data access layer
  data/providers.ts            — Provider data access layer
  data/stats.ts                — Registry stats queries
  storage/r2.ts                — R2 upload/download/delete operations
  storage/keys.ts              — R2 key generation
  validation/registry.ts       — Zod schemas for all route params/queries
  utils.ts                     — cn() tailwind-merge utility
  utils/version.ts             — Semver utilities
  env.ts                       — Zod-validated env schema
```

## Code Style

### TypeScript

- **Strict mode** enabled. No `any` — use proper types or `unknown`.
- Path alias: `@/*` maps to project root. Always use `@/` imports for non-relative paths.
- Infer DB types from schema: `type Module = typeof modules.$inferSelect`
- Export explicit return types on public data functions.
- Use `type` imports: `import type { Foo } from "..."` when importing only types.

### Import Order

1. External packages (react, next, drizzle-orm, zod, lucide-react)
2. Internal `@/` aliases (lib, db, components)
3. Relative imports (./sibling)
4. CSS imports last (only in layout.tsx)

### Naming

- **Files**: kebab-case (`module-card.tsx`, `provider-card.tsx`)
- **Components**: PascalCase exports (`export function ModuleCard`)
- **Utilities/data**: camelCase exports (`export async function findModule`)
- **DB columns**: camelCase in TS, snake_case in SQL (`publishedAt` → `published_at`)
- **Zod schemas**: camelCase (`moduleListQuery`, `providerDownloadParams`)
- **Types**: PascalCase (`Module`, `NewModule`, `ApiError`)
- **Interfaces**: PascalCase with `Props` suffix for component props (`StatCardProps`)

### Route Handlers (App Router API)

- File: `app/v1/.../route.ts` — export named HTTP methods (`GET`, `POST`, `DELETE`).
- Next.js 16 params are async: `params: Promise<{...}>` — always `await params`.
- `searchParams` in pages are also async Promises — always await.
- Pattern: validate with Zod → call data layer → return via response helpers.
- Use `lib/api/errors.ts` helpers for error responses (`notFound`, `badRequest`, `validationError`, `conflict`, `internalError`).
- Use `lib/api/response.ts` helpers for success responses (`jsonResponse`, `binaryResponse`, `noContentResponse`).
- Wrap handler body in try/catch; log errors with `console.error`; return `internalError()`.
- Route params type: `type RouteParams = { params: Promise<{ ... }> }`.

### Components

- All components are React Server Components by default (RSC). No `"use client"` unless required.
- Props interface defined above component, named `{ComponentName}Props`.
- Use `cn()` from `@/lib/utils` for conditional Tailwind classes.
- Icons from `lucide-react` only.
- UI primitives from `@/components/ui/` (shadcn/ui). Do NOT manually edit files in `components/ui/`.
- Add new shadcn components via: `npx shadcn@latest add <component>`.

### Tailwind / CSS

- Tailwind CSS v4 with `@theme` directive in `globals.css`.
- Colors via CSS custom properties (HSL): `--primary`, `--background`, etc.
- Custom utilities: `shadow-glow`, `shadow-card`, `gradient-brand`, `animate-shimmer`.
- Dark-first design (default theme: "dark"). Use semantic color tokens, not raw colors.

### Database (Drizzle ORM + D1)

- Schema at `db/schema.ts`. Use section dividers (`// ====...`) between tables.
- Use `getDb()` (sync, via React cache) in route handlers and server components.
- All data access in `lib/data/*.ts` — never query DB directly in route handlers or components.
- Transactions via `db.transaction(async (tx) => {...})` for multi-table writes.

### Validation (Zod)

- All schemas in `lib/validation/registry.ts`.
- Use `z.safeParse()` in route handlers; return `validationError(parsed.error.issues)` on failure.
- Query params: use `z.coerce.number()` for numeric URL params.

### Error Handling

- Route handlers: try/catch → `console.error` → `internalError()`.
- Data functions: let errors propagate to route handler catch block.
- Graceful degradation in UI pages: catch DB errors, log `console.warn`, show empty state.
- R2 cleanup is best-effort (nested try/catch that silently ignores failures).

### Environment & Secrets

- Env validation via Zod in `lib/env.ts`.
- Cloudflare bindings: `DB` (D1), `MODULES_STORAGE` (R2), `ASSETS`, `WORKER_SELF_REFERENCE`.
- Local dev bindings via `.dev.vars` (gitignored).
- NEVER commit `.env`, `.dev.vars`, or any secrets.

### Testing

- Vitest with happy-dom environment, globals enabled.
- Path alias `@/` resolved via vitest.config.ts.
- Test files: `*.test.ts` or `*.test.tsx` colocated or in `__tests__/`.
- No tests exist yet — when adding, follow Vitest conventions with `describe`/`it`/`expect`.

### Cloudflare Workers Constraints

- No Node.js APIs (fs, path, child_process). Use Web APIs only.
- D1 is SQLite — no window functions, limited SQL features.
- R2 for binary storage. Keys follow patterns in `lib/storage/keys.ts`.
- `getCloudflareContext()` from `@opennextjs/cloudflare` for bindings access.

## Protected Files — DO NOT MODIFY

The following files contain subtle, hard-won bug fixes. **Sub-agents MUST NOT overwrite, rewrite, or "clean up" these files** unless the task explicitly targets them with a specific bug fix.

### `components/search-input.tsx`

This component has a **carefully designed `useRef` flag pattern** to prevent an infinite refresh loop. The fix was applied twice after regressions caused by agents overwriting the file.

**Why it breaks**: The `SearchInput` uses `useEffect` + `router.push()` + `useSearchParams()`. Naïve implementations create a dependency cycle:

```
searchParams changes → useCallback recreates → useEffect fires →
router.push() → searchParams changes → ∞ LOOP
```

**How the fix works**:

- A `useRef(false)` flag (`isUserInput`) distinguishes user typing from URL sync.
- The debounce `useEffect` depends ONLY on `[value]` — NOT on `searchParams`, `router`, or any callback.
- `handleChange`/`handleClear` set `isUserInput.current = true` before calling `setValue`.
- The URL sync effect (`useEffect([searchParams])`) does NOT set the flag, so it never re-triggers the push.

**If you need to modify search behavior**: Read the entire component first, understand the `useRef` guard, and preserve the pattern. Do NOT refactor to `useCallback` with `searchParams` in deps.
