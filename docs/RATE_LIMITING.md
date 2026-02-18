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
| API key creation | `/v1/api-keys` | POST   | 5 req   | 1 min  | Block (60s) | Protects bootstrap endpoint     |
| General API      | `/v1/*`        | Any    | 200 req | 1 min  | Block (60s) | Prevents abuse of registry APIs |

### How to Create a Rule

1. Go to **Security → WAF → Rate Limiting Rules** in the Cloudflare dashboard.
2. Click **Create rule**.
3. Set the rule name and matching criteria (URI path, method).
4. Configure the rate: requests per period, per IP (or other key).
5. Set the mitigation action (Block, Challenge, JS Challenge) and duration.
6. Deploy the rule.

Documentation: https://developers.cloudflare.com/waf/rate-limiting-rules/

## Alternative: Cloudflare Workers Rate Limiting API

For more granular, programmatic rate limiting (e.g., per-API-key limits), Cloudflare provides a **Rate Limiting binding** that can be used directly inside Workers.

### How It Works

1. Define a `RateLimit` binding in `wrangler.jsonc`:

   ```jsonc
   {
     "rate_limits": [
       {
         "binding": "RATE_LIMITER",
         "namespace_id": "1001",
         "simple": {
           "limit": 10,
           "period": 60,
         },
       },
     ],
   }
   ```

2. Use the binding in a route handler:

   ```typescript
   const { success } = await env.RATE_LIMITER.limit({
     key: clientIdentifier, // e.g., IP address or API key ID
   });

   if (!success) {
     return new Response("Too Many Requests", { status: 429 });
   }
   ```

This approach runs inside the Worker but uses Cloudflare's distributed rate limiting infrastructure — no shared memory needed.

Documentation: https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/

## Bootstrap Endpoint Considerations

The `POST /v1/api-keys` endpoint has a **bootstrap mechanism**: when no API keys exist in the database, key creation is allowed without authentication. This is necessary for initial setup but creates an additional attack surface.

Mitigations:

1. **WAF rate limiting** (see table above) — restrict to 5 requests/min per IP.
2. **Cloudflare Access** — restrict the bootstrap endpoint (`POST /v1/api-keys` when unauthenticated) to trusted IPs or require identity verification via Cloudflare Access policies.
3. **Monitor** — set up Cloudflare notifications for rate limiting rule triggers to detect brute-force attempts.

See the inline documentation in [`app/v1/api-keys/route.ts`](../app/v1/api-keys/route.ts) (lines 57–76) for the full rationale and implementation notes.

## Summary

| Approach                  | Scope                   | Latency Impact | Recommended For                     |
| ------------------------- | ----------------------- | -------------- | ----------------------------------- |
| WAF Rate Limiting Rules   | Edge (before Worker)    | None           | General protection, IP-based limits |
| Workers Rate Limiting API | In-Worker (distributed) | Minimal (~1ms) | Per-key or per-user granular limits |
| In-memory counters        | ❌ Single isolate only  | N/A            | **Not viable on Workers**           |
