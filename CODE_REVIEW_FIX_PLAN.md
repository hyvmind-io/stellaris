# Stellaris — Code Review Fix Plan

> **36 issues identified, 33 with code changes, 3 no-action.**
> **CAP Priority: CONSISTENCY FIRST.** A publish = R2 upload + DB insert. Both succeed or neither persists.

## Batch Dependency Graph

```
BATCH 1A ──┐
BATCH 1B ──┼── BATCH 2A ──┐
BATCH 1C ──┘   BATCH 2B ──┼── BATCH 3 ── BATCH 4A ──┐
                           └──────────────BATCH 4B ──┼── BATCH 5 ── BATCH 6
```

## No-Action Items (Verified Correct)

| Issue | Verdict                                                                                                  |
| ----- | -------------------------------------------------------------------------------------------------------- |
| Q-12  | `console.error` is correct for Cloudflare Workers (output goes to `wrangler tail`)                       |
| Q-13  | `suppressHydrationWarning` on `<html>` is Next.js + next-themes documented requirement                   |
| Q-14  | `eslint-disable-next-line react-hooks/exhaustive-deps` in SearchInput is correctly placed and documented |

## Batch Summary

| Batch  | Issues                  | Agent                 | Key Changes                                                          | Status     |
| ------ | ----------------------- | --------------------- | -------------------------------------------------------------------- | ---------- |
| **1A** | D-5, D-7, D-8           | x-database-engineer   | Add provider_platforms index, document updatedAt                     | 🔴 Pending |
| **1B** | D-6/Q-1, Q-4, Q-7       | x-simplifier-engineer | Remove getDbAsync, add strict TS options                             | 🔴 Pending |
| **1C** | Q-16                    | x-frontend-engineer   | Fix deprecated font.className → font.variable                        | 🔴 Pending |
| **2A** | Q-6, Q-8, Q-3           | x-backend-engineer    | New `escapeLike` utility, fix semver pre-release comparison          | 🔴 Pending |
| **2B** | Q-5, Q-9, Q-2           | x-backend-engineer    | Use unauthorized() helper, add createApiKeyBody Zod schema           | 🔴 Pending |
| **3**  | D-1, D-2, D-3, D-4, P-3 | x-backend-engineer    | SQL GROUP BY (no full scans), JOIN (no N+1), sorted versions         | 🔴 Pending |
| **4A** | C-1, D-10, D-9, Q-10    | x-backend-engineer    | CRITICAL: Publish atomicity — R2 rollback on DB failure, 409 on race | 🔴 Pending |
| **4B** | Q-9 app, Q-11           | x-backend-engineer    | Zod validation for API keys, rate limit documentation                | 🔴 Pending |
| **5**  | Q-15, Q-8 tests         | x-tester-engineer     | ~50+ new tests, updated version comparison tests                     | 🔴 Pending |
| **6**  | Verification            | x-reviewer-engineer   | `pnpm type-check && pnpm lint && pnpm test`                          | 🔴 Pending |

## Complete Issue → Batch Mapping

| Issue   | Severity     | Batch | Type                             |
| ------- | ------------ | ----- | -------------------------------- |
| C-1     | 🔴 Critical  | 4A    | Race condition → atomicity       |
| D-10    | 🔴 Critical  | 4A    | Non-atomic R2+DB → rollback      |
| D-1     | 🟡 Medium    | 3     | N+1 query → JOIN                 |
| D-2     | 🟡 Medium    | 3     | N+1 counts → IN+GROUP BY         |
| D-3     | 🟡 Medium    | 3     | Full scan → SQL GROUP BY         |
| D-4     | 🟡 Medium    | 3     | Full scan → SQL GROUP BY         |
| D-5     | 🟢 Low       | 1A    | JSDoc on updatedAt               |
| D-6/Q-1 | 🟢 Low       | 1B    | Remove dead export               |
| D-7     | 🟢 Low       | 1A    | JSDoc on providers table         |
| D-8     | 🟢 Low       | 1A    | Add DB index + migration         |
| D-9     | 🟢 Low       | 4A    | Addressed by C-1/D-10 fix        |
| Q-2     | 🟢 Low       | 2B    | JSDoc                            |
| Q-3     | 🟢 Low       | 2A    | JSDoc                            |
| Q-4     | 🟢 Low       | 1B    | JSDoc                            |
| Q-5     | 🟡 Medium    | 2B    | Use unauthorized() helper        |
| Q-6     | 🟡 Medium    | 2A+3  | Create escapeLike + apply        |
| Q-7     | 🟢 Low       | 1B    | tsconfig strict options          |
| Q-8     | 🟡 Medium    | 2A    | Fix pre-release comparison       |
| Q-9     | 🟡 Medium    | 2B+4B | Zod schema + application         |
| Q-10    | 🟢 Low       | 4A    | parseModuleKey utility           |
| Q-11    | 🟡 Medium    | 4B    | Rate limiting docs/comment       |
| Q-12    | ✅ No change | —     | console.error is correct         |
| Q-13    | ✅ No change | —     | suppressHydrationWarning correct |
| Q-14    | ✅ No change | —     | eslint-disable correct           |
| Q-15    | 🟡 Medium    | 5     | 6 new test files                 |
| Q-16    | 🟢 Low       | 1C    | inter.variable font fix          |
| P-3     | 🟡 Medium    | 3     | ORDER BY in getProviderVersions  |

## New Files Created

| File                                          | Batch | Purpose                                |
| --------------------------------------------- | ----- | -------------------------------------- |
| `lib/utils/sql.ts`                            | 2A    | `escapeLike()` utility                 |
| `lib/data/errors.ts`                          | 4A    | `isUniqueConstraintError()` utility    |
| `drizzle/0001_add_provider_platforms_idx.sql` | 1A    | Migration for provider_platforms index |
| `__tests__/lib/utils/sql.test.ts`             | 5     | Tests for escapeLike                   |
| `__tests__/lib/auth/api-keys.test.ts`         | 5     | Tests for hashApiKey, generateApiKey   |
| `__tests__/lib/auth/middleware.test.ts`       | 5     | Tests for requireAuth                  |
| `__tests__/lib/data/errors.test.ts`           | 5     | Tests for isUniqueConstraintError      |

## Key Architectural Decisions

1. **Upload-then-insert-with-rollback** for C-1 (vs DB-first with status column)
2. **`escapeLike` with `sql` template** instead of Drizzle's `like()` (no ESCAPE clause support)
3. **SQL GROUP BY subquery** for browse functions (SQLite lacks window functions)
4. **compareVersions pre-release fix** is a breaking behavior change — tests must be updated together (Batch 5)

## Verification Commands (Batch 6)

```bash
pnpm type-check
pnpm lint
pnpm test -- --run
pnpm test:coverage
grep -r "getDbAsync" --include="*.ts" --include="*.tsx" .
grep -n "like(modules\|like(providers" lib/data/
pnpm build
```

## Detailed Plan Source

Full plan with exact code changes: stored at opencode tool output `tool_c7334a59d001Gf2fDDlaNTg032`
