# PRD-002: PRIVATE_REGISTRY_MODE — Strict Artifact Authentication

**Version**: 1.0
**Created**: 2026-02-20
**Status**: Draft
**Priority**: P1 (Core)
**Depends On**: None (server-side change is independent; client-side PRD-001 is needed for strict mode to be usable)
**Blocked By**: None

---

## 1. Executive Summary

### 1.1 Problem Statement

Currently, artifact-serving routes (module tarballs, provider zips, SHA256SUMS files) are unauthenticated. This is necessary for compatibility with vanilla Terraform/OpenTofu, whose `go-getter` subsystem doesn't forward Bearer tokens. However, this creates a security gap: anyone who discovers or guesses an artifact URL can download the artifact without authentication. For organizations with strict security requirements, this is unacceptable.

### 1.2 Solution

Introduce `PRIVATE_REGISTRY_MODE` environment variable with two modes:

- **`relaxed`** (default): Current behavior — artifact routes are open, metadata routes require auth. Compatible with vanilla tofu/terraform CLI.
- **`strict`**: All routes require Bearer authentication, including artifact downloads. Requires `stellaris-auth` proxy (PRD-001) or equivalent on the client side to inject credentials into all requests.

### 1.3 Key Principle

This feature is **additive and backward-compatible**. The default is `relaxed` — no existing behavior changes. Users must explicitly opt into `strict` mode.

### 1.4 Relationship with `PRIVATE_REGISTRY`

These two env vars control DIFFERENT auth layers:

|                                     | `PRIVATE_REGISTRY=true`                                                                                   | `PRIVATE_REGISTRY=false`                                                   |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **`PRIVATE_REGISTRY_MODE=relaxed`** | Web UI: login required. API metadata: Bearer required. Artifacts: open. **← Current default**             | Web UI: public. API metadata: Bearer required. Artifacts: open.            |
| **`PRIVATE_REGISTRY_MODE=strict`**  | Web UI: login required. API metadata: Bearer required. Artifacts: Bearer required. **← Maximum security** | Web UI: public. API metadata: Bearer required. Artifacts: Bearer required. |

- `PRIVATE_REGISTRY` = **Web session auth** (browser cookies, middleware.ts)
- `PRIVATE_REGISTRY_MODE` = **API artifact auth** (Bearer tokens, route handlers)

### 1.5 Non-Goals

- Does not modify web UI authentication flow
- Does not modify metadata/discovery endpoint authentication
- Does not implement the client-side proxy (that's PRD-001)
- Does not add new permission types (uses existing `modules:read`, `providers:read`)

## 2. Architecture

### 2.1 Request Flow — Relaxed Mode (Current)

```
Client → GET /v1/modules/tarball/modules/ns/name/provider/1.0.0.tar.gz
  → middleware.ts: passes (starts with /v1/)
  → route.ts: isStrictMode() → false → skip auth
  → Serve tarball → 200 OK
```

### 2.2 Request Flow — Strict Mode

```
Client → GET /v1/modules/tarball/modules/ns/name/provider/1.0.0.tar.gz
  → middleware.ts: passes (starts with /v1/)
  → route.ts: isStrictMode() → true → requireAuth(request, "modules:read")
    → No Authorization header → 401 Unauthorized
    → Invalid token → 401 Unauthorized
    → Valid token, missing modules:read → 403 Forbidden
    → Valid token, has modules:read → continue → Serve tarball → 200 OK
```

### 2.3 Affected Routes

| Route                                                         | Permission (strict) | Current Auth |
| ------------------------------------------------------------- | ------------------- | ------------ |
| `GET /v1/modules/tarball/[...path]`                           | `modules:read`      | None         |
| `GET /v1/providers/:ns/:type/:version/download/:os/:arch/zip` | `providers:read`    | None         |
| `GET /v1/providers/:ns/:type/:version/sha256sums`             | `providers:read`    | None         |
| `GET /v1/providers/:ns/:type/:version/sha256sums.sig`         | `providers:read`    | None         |

### 2.4 Unaffected Routes (always require auth, no change)

| Route                                                     | Permission                          |
| --------------------------------------------------------- | ----------------------------------- |
| `GET /v1/modules/:ns/:name/:system/:version/download`     | `modules:read`                      |
| `GET /v1/modules/:ns/:name/:system/versions`              | `modules:read`                      |
| `GET /v1/providers/:ns/:type/versions`                    | `providers:read`                    |
| `GET /v1/providers/:ns/:type/:version/download/:os/:arch` | `providers:read`                    |
| All write endpoints                                       | `modules:write` / `providers:write` |
| Admin endpoints                                           | `admin`                             |

## 3. Functional Requirements

| ID     | Requirement                                                                                                                                | Priority |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| FR-001 | Add `PRIVATE_REGISTRY_MODE` to `lib/env.ts` with Zod enum `["relaxed", "strict"]`, default `"relaxed"`                                     | P0       |
| FR-002 | Create `lib/auth/registry-mode.ts` with `isStrictMode()` function                                                                          | P0       |
| FR-003 | Module tarball route: call `requireAuth(request, "modules:read")` when `isStrictMode()` returns `true`                                     | P0       |
| FR-004 | Provider zip route: call `requireAuth(request, "providers:read")` when `isStrictMode()` returns `true`                                     | P0       |
| FR-005 | Provider SHA256SUMS route: call `requireAuth(request, "providers:read")` when `isStrictMode()` returns `true`                              | P0       |
| FR-006 | Provider SHA256SUMS sig route: call `requireAuth(request, "providers:read")` when `isStrictMode()` returns `true`                          | P0       |
| FR-007 | Log startup warning when strict mode is active: `[Stellaris] PRIVATE_REGISTRY_MODE=strict — artifact routes require Bearer authentication` | P1       |
| FR-008 | Update `.env.example` with documented `PRIVATE_REGISTRY_MODE` variable                                                                     | P0       |
| FR-009 | Update `AGENTS.md` environment section                                                                                                     | P1       |

## 4. Technical Implementation

### 4.1 `lib/env.ts` — Add to Zod Schema

```typescript
// Private Registry Mode — API artifact authentication
// Controls whether artifact-serving routes require Bearer token auth.
// "relaxed" (default) — artifacts served without auth (vanilla tofu/terraform compatible)
// "strict" — all routes require Bearer auth (requires stellaris-auth proxy)
PRIVATE_REGISTRY_MODE: z.enum(["relaxed", "strict"]).default("relaxed"),
```

### 4.2 `lib/auth/registry-mode.ts` — NEW File

```typescript
import "server-only";

import { env } from "@/lib/env";

/**
 * Whether the registry is running in strict mode.
 *
 * In strict mode, ALL API routes require Bearer authentication,
 * including artifact-serving routes (tarballs, zips, SHA256SUMS).
 *
 * This requires clients to use the stellaris-auth proxy (or equivalent)
 * to inject credentials into all requests, since Terraform/OpenTofu's
 * go-getter subsystem does not forward Bearer tokens natively.
 *
 * @see PRD-002: private-registry-mode.md
 */
export function isStrictMode(): boolean {
  return env.PRIVATE_REGISTRY_MODE === "strict";
}
```

### 4.3 Artifact Route Pattern

Applied to all 4 affected routes. Example for module tarball:

```typescript
import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/middleware";
import { isStrictMode } from "@/lib/auth/registry-mode";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    // Strict mode: require Bearer authentication for artifact downloads.
    // In relaxed mode (default), artifacts are served without auth for
    // compatibility with vanilla Terraform/OpenTofu, whose go-getter
    // subsystem does not forward Bearer tokens to artifact URLs.
    if (isStrictMode()) {
      const auth = await requireAuth(request as NextRequest, "modules:read");
      if (auth instanceof Response) return auth;
    }

    // ... existing route logic unchanged ...
  }
}
```

Note: `request as NextRequest` cast is necessary because artifact routes accept `Request` (not `NextRequest`), but `requireAuth()` only uses the `headers` API which is shared between both types.

### 4.4 `.env.example` Addition

```env
# Private Registry Mode (API artifact authentication)
# Controls whether artifact-serving routes (tarballs, zips, SHA256SUMS) require Bearer auth.
# This is INDEPENDENT of PRIVATE_REGISTRY (which controls web UI session auth).
#
# Options:
# "relaxed" (default) — Artifacts served without auth. Compatible with vanilla tofu/terraform.
#                        Metadata/discovery endpoints still require Bearer auth.
# "strict"            — ALL API routes require Bearer auth, including artifact downloads.
#                        Requires stellaris-auth proxy (or equivalent) on the client side.
#                        See: https://github.com/hyvmind-io/stellaris-auth
#
# Configuration matrix:
#   PRIVATE_REGISTRY=true  + PRIVATE_REGISTRY_MODE=relaxed  → Web: login, API: partial auth (default)
#   PRIVATE_REGISTRY=true  + PRIVATE_REGISTRY_MODE=strict   → Web: login, API: full auth (max security)
#   PRIVATE_REGISTRY=false + PRIVATE_REGISTRY_MODE=relaxed  → Web: public, API: partial auth
#   PRIVATE_REGISTRY=false + PRIVATE_REGISTRY_MODE=strict   → Web: public, API: full auth
PRIVATE_REGISTRY_MODE=relaxed
```

## 5. Files to Modify

| File                                                                              | Action     | Description                               |
| --------------------------------------------------------------------------------- | ---------- | ----------------------------------------- |
| `lib/env.ts`                                                                      | **Modify** | Add `PRIVATE_REGISTRY_MODE` to Zod schema |
| `lib/auth/registry-mode.ts`                                                       | **Create** | `isStrictMode()` helper function          |
| `app/v1/modules/tarball/[...path]/route.ts`                                       | **Modify** | Add conditional `requireAuth()`           |
| `app/v1/providers/[namespace]/[type]/[version]/download/[os]/[arch]/zip/route.ts` | **Modify** | Add conditional `requireAuth()`           |
| `app/v1/providers/[namespace]/[type]/[version]/sha256sums/route.ts`               | **Modify** | Add conditional `requireAuth()`           |
| `app/v1/providers/[namespace]/[type]/[version]/sha256sums.sig/route.ts`           | **Modify** | Add conditional `requireAuth()`           |
| `.env.example`                                                                    | **Modify** | Add `PRIVATE_REGISTRY_MODE` documentation |
| `AGENTS.md`                                                                       | **Modify** | Update environment & secrets section      |

## 6. Testing Strategy

### 6.1 Unit Tests — `isStrictMode()`

| Test                                         | Input                           | Expected |
| -------------------------------------------- | ------------------------------- | -------- |
| Returns false when mode is "relaxed"         | `PRIVATE_REGISTRY_MODE=relaxed` | `false`  |
| Returns false when mode is not set (default) | unset                           | `false`  |
| Returns true when mode is "strict"           | `PRIVATE_REGISTRY_MODE=strict`  | `true`   |

### 6.2 Route Integration Tests — Module Tarball

| Test                                                | Mode    | Auth                          | Expected |
| --------------------------------------------------- | ------- | ----------------------------- | -------- |
| Serves tarball without auth in relaxed mode         | relaxed | None                          | 200      |
| Serves tarball with valid auth in relaxed mode      | relaxed | Valid Bearer + modules:read   | 200      |
| Returns 401 without auth in strict mode             | strict  | None                          | 401      |
| Returns 401 with invalid token in strict mode       | strict  | Invalid Bearer                | 401      |
| Returns 403 with missing permission in strict mode  | strict  | Valid Bearer, no modules:read | 403      |
| Serves tarball with valid auth in strict mode       | strict  | Valid Bearer + modules:read   | 200      |
| Serves tarball with admin permission in strict mode | strict  | Valid Bearer + admin          | 200      |

### 6.3 Route Integration Tests — Provider Zip, SHA256SUMS, SHA256SUMS.sig

Same pattern as module tarball tests, but with `providers:read` permission. ~7 tests per route × 3 routes = ~21 tests.

### 6.4 Test Count Estimate

- `isStrictMode()`: 3 tests
- Module tarball route: 7 tests
- Provider zip route: 7 tests
- Provider SHA256SUMS route: 7 tests
- Provider SHA256SUMS.sig route: 7 tests
- **Total: ~31 new tests**

## 7. Implementation Batches

### Batch 02.1 — Foundation (P0, 0.5 day)

- Add `PRIVATE_REGISTRY_MODE` to `lib/env.ts`
- Create `lib/auth/registry-mode.ts`
- Update `.env.example`
- Unit tests for `isStrictMode()`

### Batch 02.2 — Route Changes (P0, 0.5 day)

- Add conditional `requireAuth()` to all 4 artifact routes
- Import `isStrictMode` and `requireAuth` in each route
- Update route JSDoc comments to document both modes

### Batch 02.3 — Testing (P1, 1 day)

- Integration tests for all 4 routes in both modes
- Test permission enforcement (401, 403 scenarios)
- Test admin permission bypass

### Batch 02.4 — Documentation & Logging (P1, 0.5 day)

- Update `AGENTS.md` environment section
- Add startup console warning for strict mode
- Update `CONTRIBUTING.md` if needed

## 8. Risks and Mitigations

| Risk                                                           | Likelihood | Impact | Mitigation                                                                                            |
| -------------------------------------------------------------- | ---------- | ------ | ----------------------------------------------------------------------------------------------------- |
| Name confusion: `PRIVATE_REGISTRY` vs `PRIVATE_REGISTRY_MODE`  | Medium     | Medium | Clear documentation in `.env.example`, AGENTS.md. Completely different scopes (web vs API).           |
| Accidental strict mode activation                              | Low        | High   | Default is `relaxed` — must explicitly set. Startup warning makes it obvious.                         |
| `Request` vs `NextRequest` type mismatch in artifact routes    | Low        | Low    | Cast `request as NextRequest` — only `headers` API used, which is shared.                             |
| Cloudflare Workers env parsing timing                          | Low        | Medium | `env` is parsed at module import via Zod — existing proven pattern.                                   |
| Future Terraform/OpenTofu versions may forward tokens natively | Low        | None   | Strict mode still works. Redundant auth injection is harmless. Relaxed mode remains the safe default. |

## 9. Acceptance Criteria

| #     | Criterion                                                                    | Verification                                                                          |
| ----- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| AC-01 | Default mode is `relaxed` with no behavior change                            | Existing tests pass, artifact routes serve without auth                               |
| AC-02 | Module tarball returns 401 in strict mode without Bearer                     | `curl /v1/modules/tarball/...` → 401                                                  |
| AC-03 | Module tarball returns 200 in strict mode with valid Bearer + `modules:read` | `curl -H "Authorization: Bearer <key>" /v1/modules/tarball/...` → 200                 |
| AC-04 | Provider zip returns 401 in strict mode without Bearer                       | `curl /v1/providers/.../zip` → 401                                                    |
| AC-05 | Provider zip returns 200 in strict mode with valid Bearer + `providers:read` | `curl -H "Authorization: Bearer <key>" /v1/providers/.../zip` → 200                   |
| AC-06 | Provider SHA256SUMS returns 401/200 correctly in strict mode                 | Same pattern as AC-04/AC-05                                                           |
| AC-07 | Provider SHA256SUMS.sig returns 401/200 correctly in strict mode             | Same pattern as AC-04/AC-05                                                           |
| AC-08 | 403 returned when Bearer is valid but lacks required permission              | Key with only `providers:read` trying to download module tarball in strict mode → 403 |
| AC-09 | `.env.example` documents both modes with matrix table                        | Visual inspection                                                                     |
| AC-10 | Startup log shows warning when strict mode is active                         | Console output inspection                                                             |
| AC-11 | All existing tests still pass (no regressions)                               | `pnpm test -- --run` → all pass                                                       |
