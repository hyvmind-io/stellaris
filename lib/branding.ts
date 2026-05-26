import { parseEnv } from "@/lib/env";

/**
 * Read the validated environment for branding resolution.
 *
 * `WHITELABEL_LOGO_URL` / `WHITELABEL_FAVICON_URL` are zod `.url()`-validated.
 * An invalid logo/favicon URL is operator misconfiguration that should NOT take
 * down the whole app (req 01-301: invalid → ignored + warn, fall back). If env
 * parsing fails, we warn and retry with the two URL vars cleared so the rest of
 * branding resolves and `safeUrl` returns null for the bad value.
 */
function readBrandingEnv(): ReturnType<typeof parseEnv> {
  try {
    return parseEnv();
  } catch {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[branding] Ignoring invalid WHITELABEL_LOGO_URL / WHITELABEL_FAVICON_URL; falling back to defaults.",
      );
    }
    const scrubbed = process.env as unknown as Record<
      string,
      string | undefined
    >;
    const savedLogo = scrubbed.WHITELABEL_LOGO_URL;
    const savedFavicon = scrubbed.WHITELABEL_FAVICON_URL;
    delete scrubbed.WHITELABEL_LOGO_URL;
    delete scrubbed.WHITELABEL_FAVICON_URL;
    try {
      return parseEnv();
    } finally {
      if (savedLogo !== undefined) scrubbed.WHITELABEL_LOGO_URL = savedLogo;
      if (savedFavicon !== undefined)
        scrubbed.WHITELABEL_FAVICON_URL = savedFavicon;
    }
  }
}

/**
 * Immutable, server-resolved branding object.
 *
 * Resolved once (per module load) by {@link getBranding} from the validated
 * environment, then handed to the client via `BrandingProvider`. Client
 * components MUST read this object through `useBranding()` — never
 * `process.env` directly, because `wrangler.jsonc` `vars` are available only at
 * server runtime and are not inlined into client bundles.
 */
export interface Branding {
  /** Master switch state. */
  whitelabelEnabled: boolean;
  /** Operator brand name, or null when unset (graceful generic). */
  brandName: string | null;
  /** Title suffix, e.g. "Registry" or "Terraform Registry". */
  titleSuffix: string;
  /** Browser <title> + header identity text, fully composed. */
  appTitle: string;
  /** Hero/section tagline (vendor-free). */
  tagline: string;
  /** Meta description. */
  description: string;
  /** Footer line with {year} already interpolated. */
  footerText: string;
  /** Custom logo URL, or null → render default Terminal icon. */
  logoUrl: string | null;
  /** Custom favicon URL, or null → existing default favicon. */
  faviconUrl: string | null;
  /** Whether to render OSS/tech/sponsor elements (false when whitelabeled). */
  showTechBranding: boolean;
}

const DEFAULTS = {
  appTitle: "Stellaris — Private Terraform Registry",
  tagline:
    "Private Terraform/OpenTofu module and provider registry powered by Cloudflare Workers",
  description:
    "Private Terraform/OpenTofu module and provider registry on Cloudflare Workers",
  footerText: "Powered by Next.js · Cloudflare Workers",
} as const;

const GENERIC = {
  titleSuffix: "Registry",
  tagline: "Private module and provider registry",
} as const;

let cached: Branding | null = null;

/**
 * Resolve the single immutable {@link Branding} object for this deployment.
 *
 * - Whitelabel disabled → default Stellaris branding (UI byte-for-byte
 *   unchanged from before this feature existed).
 * - Whitelabel enabled with a brand name → composed brand identity.
 * - Whitelabel enabled without a brand name → neutral generic branding (never
 *   half-branded), tech/sponsor branding still stripped.
 *
 * Memoized per module load; call {@link __resetBrandingForTests} to clear.
 */
export function getBranding(): Branding {
  if (cached) return cached;
  const env = readBrandingEnv();
  const on = env.WHITELABEL_ENABLED === "true";

  if (!on) {
    cached = {
      whitelabelEnabled: false,
      brandName: null,
      titleSuffix: "Private Terraform Registry",
      appTitle: DEFAULTS.appTitle,
      tagline: DEFAULTS.tagline,
      description: DEFAULTS.description,
      footerText: DEFAULTS.footerText,
      logoUrl: null,
      faviconUrl: null,
      showTechBranding: true,
    };
    return cached;
  }

  const brand = env.WHITELABEL_BRAND_NAME?.trim() || null;
  const suffix = env.WHITELABEL_TITLE_SUFFIX?.trim() || GENERIC.titleSuffix;
  const tagline = env.WHITELABEL_TAGLINE?.trim() || GENERIC.tagline;
  const year = new Date().getUTCFullYear();
  const footer = (env.WHITELABEL_FOOTER_TEXT?.trim() || "").replaceAll(
    "{year}",
    String(year),
  );

  cached = {
    whitelabelEnabled: true,
    brandName: brand,
    titleSuffix: suffix,
    appTitle: brand ? `${brand} — ${suffix}` : suffix,
    tagline,
    description: tagline,
    footerText: footer || (brand ? `${brand} — ${year}` : String(year)),
    logoUrl: safeUrl(env.WHITELABEL_LOGO_URL),
    faviconUrl: safeUrl(env.WHITELABEL_FAVICON_URL),
    showTechBranding: false,
  };
  return cached;
}

/** Validate a string as a URL; invalid or empty → null (fall back to default). */
function safeUrl(v: string | undefined): string | null {
  if (!v) return null;
  try {
    return new URL(v).toString();
  } catch {
    return null;
  }
}

/**
 * Identity word for per-page browser titles of the form `<page> — <identity>`.
 *
 * Defaults to "Stellaris" (engine name, 01-209). When whitelabeled with a brand
 * name, the brand replaces it so sub-page titles never leak the engine name in
 * a whitelabel deployment; without a brand name it falls back to the suffix.
 */
export function brandPageIdentity(): string {
  const b = getBranding();
  if (!b.whitelabelEnabled) return "Stellaris";
  return b.brandName ?? b.titleSuffix;
}

/** Test-only reset to clear the per-module memo between cases. */
export function __resetBrandingForTests() {
  cached = null;
}
