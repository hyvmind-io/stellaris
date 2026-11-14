# Rate Limiting Strategy

Stellaris runs on Cloudflare Workers. This document explains why application-level rate limiting is not viable and how to configure rate limiting at the edge.

## Why Application-Level Rate Limiting Doesn't Work

Traditional rate limiting (in-memory counters, sliding window maps, etc.) relies on shared state between request handlers. Cloudflare Workers are **stateless isolates** — each request may be handled by a different Worker instance with **no shared memory** across isolates or regions.

This means:

- An in-memory counter in one isolate is invisible to all other isolates.
- A burst of requests may be spread across dozens of isolates, each seeing only 1 request.
- Libraries like `express-rate-limit` or custom `Map`-based counters are **completely ineffective**.

Even D1-backed counters would add unacceptable per-request latency and become a bottleneck under load.

## Recommended: Cloudflare WAF Rate Limiting Rules

The recommended approach is to configure rate limiting at the Cloudflare edge layer using **WAF Rate Limiting Rules**. These operate before the Worker is invoked, adding zero latency to legitimate requests.

### Configuration

Navigate to: **Cloudflare Dashboard → Security → WAF → Rate Limiting Rules**

### Suggested Rules

| Rule Name        | Path           | Method | Limit   | Period | Action      | Notes                           |
| ---------------- | -------------- | ------ | ------- | ------ | ----------- | ------------------------------- |
| API key creation | `/v1/api-keys` | POST   | 5 req   | 1 min  | Block (60s) | Slows admin-key brute forcing   |
| General API      | `/v1/*`        | Any    | 200 req | 1 min  | Block (60s) | Prevents abuse of registry APIs |

### How to Create a Rule

1. Go to **Security → WAF → Rate Limiting Rules** in the Cloudflare dashboard.
2. Click **Create rule**.
3. Set the rule name and matching criteria (URI path, method).
4. Configure the rate: requests per period, per IP (or other key).
5. Set the mitigation action (Block, Challenge, JS Challenge) and duration.
6. Deploy the rule.

Documentation: https://developers.cloudflare.com/waf/rate-limiting-rules/

## Built in: Workers Rate Limiting bindings

Stellaris ships with two [Workers Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) bindings (available on Workers Free), keyed on the client IP from `CF-Connecting-IP`. `X-Forwarded-For` is never trusted, since clients can set it.

| Binding | Guards | Suggested limit |
| --- | --- | --- |
| `API_RATE_LIMITER` | Every Bearer-authenticated `/v1` request, checked **before** the D1 key lookup | 300 req / 60 s |
| `AUTH_RATE_LIMITER` | Login and signup attempts | 10 req / 60 s |

Over the limit, the API answers `429` with `Retry-After: 60` and login/signup return a "too many attempts" error. Add both to `wrangler.jsonc` (see `wrangler.example.jsonc`):

```jsonc
"ratelimits": [
  { "name": "API_RATE_LIMITER", "namespace_id": "1001", "simple": { "limit": 300, "period": 60 } },
  { "name": "AUTH_RATE_LIMITER", "namespace_id": "1002", "simple": { "limit": 10, "period": 60 } }
]
```

Limits apply per Cloudflare location and are approximate. Without the bindings (for example under `pnpm dev`), requests are not limited. WAF rules above still help, because they stop traffic before the Worker runs.

## API Key Endpoint Considerations

`POST /v1/api-keys` always requires an `admin` key; there is no unauthenticated path. Rate limit it anyway (see table above) and set up Cloudflare notifications for rule triggers to spot brute-force attempts against keys.

## Summary

| Approach                  | Scope                   | Latency Impact | Recommended For                     |
| ------------------------- | ----------------------- | -------------- | ----------------------------------- |
| WAF Rate Limiting Rules   | Edge (before Worker)    | None           | General protection, IP-based limits |
| Workers Rate Limiting API | In-Worker (distributed) | Minimal (~1ms) | Per-key or per-user granular limits |
| In-memory counters        | ❌ Single isolate only  | N/A            | **Not viable on Workers**           |
