import { describe, it, expect, beforeEach } from "vitest";
import {
  SignJWT,
  generateKeyPair,
  exportJWK,
  createLocalJWKSet,
  type JWK,
} from "jose";
import {
  verifyCfAccessJwt,
  __resetJwksCacheForTests,
} from "@/lib/auth/cf-access";

// process.env entries pinned via wrangler `vars` get narrowed to their literal
// production values by `wrangler types`, which blocks `process.env.X = "..."`
// assignment and `delete env.X` in tests. Cast through a wider record
// type at the test entry point so the narrowing doesn't reach the test code.
const env = process.env as unknown as Record<string, string | undefined>;

// jose v5+ removed the `KeyLike` type alias; private/public keys are now
// `CryptoKey | Uint8Array`. Use the union directly.
type SignKey = CryptoKey | Uint8Array;

const TEAM_DOMAIN = "evilcorp.cloudflareaccess.com";
const ISSUER = `https://${TEAM_DOMAIN}`;
const AUD = "0123456789abcdef0123456789abcdef";

interface Keys {
  privateKey: SignKey;
  publicJwk: JWK;
}

async function makeKeys(kid: string): Promise<Keys> {
  const { publicKey, privateKey } = await generateKeyPair("RS256", {
    extractable: true,
  });
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = kid;
  publicJwk.alg = "RS256";
  publicJwk.use = "sig";
  return { privateKey, publicJwk };
}

function jwksFor(jwks: JWK[]) {
  return createLocalJWKSet({ keys: jwks });
}

interface SignOptions {
  iss?: string;
  aud?: string | string[];
  exp?: number; // seconds since epoch
  iat?: number;
  email?: string | null;
  name?: string;
  kid?: string;
}

async function sign(
  privateKey: SignKey,
  opts: SignOptions = {},
): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  const payload: Record<string, unknown> = {};
  if (opts.email !== null) {
    payload.email = opts.email ?? "alice@evilcorp.com";
  }
  if (opts.name) payload.name = opts.name;
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "RS256", kid: opts.kid ?? "key-1" })
    .setIssuer(opts.iss ?? ISSUER)
    .setAudience(opts.aud ?? AUD)
    .setIssuedAt(opts.iat ?? nowSec)
    .setExpirationTime(opts.exp ?? nowSec + 600)
    .sign(privateKey);
}

beforeEach(() => {
  env.CF_ACCESS_AUTH_ENABLED = "true";
  env.CF_ACCESS_AUD = AUD;
  env.CF_ACCESS_TEAM_DOMAIN = TEAM_DOMAIN;
  __resetJwksCacheForTests();
});

describe("verifyCfAccessJwt", () => {
  it("returns null for missing/empty token", async () => {
    const keys = await makeKeys("key-1");
    const ks = jwksFor([keys.publicJwk]);
    expect(await verifyCfAccessJwt(null, { keySet: ks })).toBeNull();
    expect(await verifyCfAccessJwt(undefined, { keySet: ks })).toBeNull();
    expect(await verifyCfAccessJwt("", { keySet: ks })).toBeNull();
  });

  it("returns null when AUD env is missing", async () => {
    delete env.CF_ACCESS_AUD;
    const keys = await makeKeys("key-1");
    const token = await sign(keys.privateKey);
    const ks = jwksFor([keys.publicJwk]);
    expect(await verifyCfAccessJwt(token, { keySet: ks })).toBeNull();
  });

  it("returns null when team domain env is missing", async () => {
    delete env.CF_ACCESS_TEAM_DOMAIN;
    const keys = await makeKeys("key-1");
    const token = await sign(keys.privateKey);
    const ks = jwksFor([keys.publicJwk]);
    expect(await verifyCfAccessJwt(token, { keySet: ks })).toBeNull();
  });

  it("verifies a good token and extracts email + name", async () => {
    const keys = await makeKeys("key-1");
    const token = await sign(keys.privateKey, {
      email: "Alice@EVILCORP.com",
      name: "Alice Smith",
    });
    const result = await verifyCfAccessJwt(token, {
      keySet: jwksFor([keys.publicJwk]),
    });
    expect(result).not.toBeNull();
    expect(result!.email).toBe("alice@evilcorp.com");
    expect(result!.name).toBe("Alice Smith");
  });

  it("rejects a token signed by an unknown key", async () => {
    const goodKeys = await makeKeys("key-1");
    const otherKeys = await makeKeys("key-2");
    // Signed by otherKeys, but JWKS only contains goodKeys.publicJwk
    const token = await sign(otherKeys.privateKey, { kid: "key-2" });
    const result = await verifyCfAccessJwt(token, {
      keySet: jwksFor([goodKeys.publicJwk]),
    });
    expect(result).toBeNull();
  });

  it("rejects expired tokens", async () => {
    const keys = await makeKeys("key-1");
    const past = Math.floor(Date.now() / 1000) - 3600;
    const token = await sign(keys.privateKey, {
      iat: past - 600,
      exp: past,
    });
    const result = await verifyCfAccessJwt(token, {
      keySet: jwksFor([keys.publicJwk]),
    });
    expect(result).toBeNull();
  });

  it("rejects tokens with wrong issuer", async () => {
    const keys = await makeKeys("key-1");
    const token = await sign(keys.privateKey, {
      iss: "https://attacker.example.com",
    });
    const result = await verifyCfAccessJwt(token, {
      keySet: jwksFor([keys.publicJwk]),
    });
    expect(result).toBeNull();
  });

  it("rejects tokens with wrong audience", async () => {
    const keys = await makeKeys("key-1");
    const token = await sign(keys.privateKey, { aud: "different-aud" });
    const result = await verifyCfAccessJwt(token, {
      keySet: jwksFor([keys.publicJwk]),
    });
    expect(result).toBeNull();
  });

  it("rejects tokens missing email claim", async () => {
    const keys = await makeKeys("key-1");
    const token = await sign(keys.privateKey, { email: null });
    const result = await verifyCfAccessJwt(token, {
      keySet: jwksFor([keys.publicJwk]),
    });
    expect(result).toBeNull();
  });

  it("rejects malformed tokens", async () => {
    const keys = await makeKeys("key-1");
    const result = await verifyCfAccessJwt("not.a.real.jwt", {
      keySet: jwksFor([keys.publicJwk]),
    });
    expect(result).toBeNull();
  });
});
