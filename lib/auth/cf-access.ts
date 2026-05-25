/**
 * Cloudflare Access JWT verification.
 *
 * Verifies the `Cf-Access-Jwt-Assertion` header against the team's JWKS,
 * validating signature (RS256), issuer, audience, and expiry. Caches the
 * JWKS via jose's createRemoteJWKSet (in-memory, with cooldown + rotation).
 *
 * Safe to import from Edge runtime — uses `jose` only.
 */

import {
  jwtVerify,
  createRemoteJWKSet,
  type JWTPayload,
  type JWTVerifyResult,
} from "jose";
import {
  getCfAccessAud,
  getCfAccessIssuer,
  getCfAccessJwksUrl,
} from "./cf-access-config";

export interface CfAccessClaims extends JWTPayload {
  email?: string;
  name?: string;
  identity_nonce?: string;
  custom?: Record<string, unknown>;
}

export interface CfAccessVerifyResult {
  email: string;
  name?: string;
  payload: CfAccessClaims;
}

/**
 * Module-scoped JWKS cache. jose's `createRemoteJWKSet` performs its own
 * caching + cooldown (default cooldownDuration: 30s, cacheMaxAge: 600s).
 * We override to be friendlier to CF Access rotation (~1h key TTL).
 */
let cachedJwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let cachedJwksUrl: string | null = null;

function getJwks(): ReturnType<typeof createRemoteJWKSet> | null {
  const url = getCfAccessJwksUrl();
  if (!url) return null;
  if (cachedJwks && cachedJwksUrl === url) return cachedJwks;
  cachedJwks = createRemoteJWKSet(new URL(url), {
    cacheMaxAge: 60 * 60 * 1000, // 1h — matches CF Access rotation cadence
    cooldownDuration: 30 * 1000, // refetch no more than once per 30s on miss
  });
  cachedJwksUrl = url;
  return cachedJwks;
}

/**
 * Test-only hook: reset the cached JWKS resolver. Allows tests to inject a
 * fixture by re-stubbing the `createRemoteJWKSet` module before re-calling.
 */
export function __resetJwksCacheForTests(): void {
  cachedJwks = null;
  cachedJwksUrl = null;
}

/**
 * Verify a CF Access JWT.
 *
 * @param token Raw value of `Cf-Access-Jwt-Assertion` header.
 * @param opts.keySet Optional override for the JWKS resolver (used in tests).
 * @returns Verified claims, or null when the token is missing/invalid.
 */
export async function verifyCfAccessJwt(
  token: string | null | undefined,
  opts: {
    keySet?: Parameters<typeof jwtVerify>[1];
  } = {},
): Promise<CfAccessVerifyResult | null> {
  if (!token) return null;

  const aud = getCfAccessAud();
  if (!aud) {
    console.error(
      "[cf-access] CF_ACCESS_AUD is not configured — refusing to verify",
    );
    return null;
  }

  const issuer = getCfAccessIssuer();
  if (!issuer) {
    console.error(
      "[cf-access] CF_ACCESS_TEAM_DOMAIN is not configured — refusing to verify",
    );
    return null;
  }

  try {
    const keySet = opts.keySet ?? getJwks();
    if (!keySet) return null;
    const result: JWTVerifyResult = await jwtVerify(token, keySet, {
      issuer,
      audience: aud,
      algorithms: ["RS256"],
    });

    const payload = result.payload as CfAccessClaims;
    const email = typeof payload.email === "string" ? payload.email : null;
    if (!email) {
      console.warn("[cf-access] verified token missing email claim");
      return null;
    }

    return {
      email: email.toLowerCase(),
      name: typeof payload.name === "string" ? payload.name : undefined,
      payload,
    };
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[cf-access] token verification failed", error);
    }
    return null;
  }
}
