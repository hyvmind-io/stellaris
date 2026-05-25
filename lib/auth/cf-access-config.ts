/**
 * Cloudflare Access configuration helpers.
 *
 * Safe to import from both Edge (middleware) and Node runtimes — does not
 * pull in "server-only" or DB modules.
 */

export const CF_ACCESS_JWT_HEADER = "cf-access-jwt-assertion";
export const CF_ACCESS_EMAIL_HEADER = "cf-access-authenticated-user-email";

/**
 * Whether CF Access passthrough auth is enabled in this deployment.
 * Off by default so local `pnpm dev` works without Access in front.
 */
export function isCfAccessEnabled(): boolean {
  return (process.env.CF_ACCESS_AUTH_ENABLED ?? "false") === "true";
}

/**
 * The expected AUD tag for this Access application.
 * Required for signature/audience validation.
 */
export function getCfAccessAud(): string | undefined {
  return process.env.CF_ACCESS_AUD;
}

/**
 * The CF Access team domain (e.g. `<team>.cloudflareaccess.com`).
 * Used to derive the JWKS endpoint and expected `iss` claim.
 *
 * Required when CF Access passthrough is enabled — there is no default. The
 * project is upstream-friendly: every operator supplies their own team.
 */
export function getCfAccessTeamDomain(): string | undefined {
  const value = process.env.CF_ACCESS_TEAM_DOMAIN?.trim();
  return value && value.length > 0 ? value : undefined;
}

export function getCfAccessIssuer(): string | undefined {
  const team = getCfAccessTeamDomain();
  return team ? `https://${team}` : undefined;
}

export function getCfAccessJwksUrl(): string | undefined {
  const issuer = getCfAccessIssuer();
  return issuer ? `${issuer}/cdn-cgi/access/certs` : undefined;
}
