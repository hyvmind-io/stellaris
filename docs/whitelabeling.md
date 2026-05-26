# Whitelabeling

Stellaris ships with open-source, technology, and sponsor branding visible in
the UI — a hero tagline that mentions "Cloudflare Workers", a "Powered by
Next.js · Cloudflare Workers" footer line, a "built with ❤️ by nmindz"
signature, and a row of technology badges (Next.js, React, Cloudflare Workers,
D1, R2, Drizzle ORM).

Organizations that deploy Stellaris internally often want to present it as their
own service, without third-party or vendor attribution. Whitelabeling lets you
do that entirely through configuration — no code changes per deployment.

!!! info "What whitelabeling does *not* change"
    Whitelabeling only affects user-facing **text, logo, and favicon**. It does
    not change colors, fonts, or layout, and it does not rename the internal
    "Stellaris" engine name in code, logs, or the package. The "Stellaris"
    identity in the top-left navigation stays visible by design — it marks the
    underlying engine, not your brand.

## How it works

A single master switch, `WHITELABEL_ENABLED`, turns the feature on. When
enabled, Stellaris hides all OSS/technology/sponsor branding at once and
substitutes the brand identity you supply through environment variables.

Branding is resolved **once on the server** into an immutable object and passed
to the browser through React context. On Cloudflare Workers this matters: the
`vars` you set in `wrangler.jsonc` are available at server runtime but are *not*
inlined into client bundles (unlike `NEXT_PUBLIC_*`). You therefore set plain
server-side variables, and Stellaris takes care of getting them to the UI.

## Quick start

Set the master switch and a brand name:

```env
WHITELABEL_ENABLED=true
WHITELABEL_BRAND_NAME=Evil Corp
WHITELABEL_TITLE_SUFFIX=Terraform Registry
WHITELABEL_FOOTER_TEXT=Evil Corp — {year}
```

With this configuration:

- The browser title and hero heading read **Evil Corp — Terraform Registry**.
- The footer reads **Evil Corp — 2026** (the `{year}` token resolves to the
  current UTC year).
- The "Powered by …", "built with ❤️ …", and technology-badge row are all
  hidden.

## Graceful generic fallback

You can enable whitelabeling **without** a brand name. The UI then degrades to
neutral, vendor-free text rather than failing or showing a half-branded state:

```env
WHITELABEL_ENABLED=true
```

In this mode the title becomes the generic suffix (default **Registry**), the
hero tagline becomes **Private module and provider registry**, and all
OSS/tech/sponsor branding is still removed. This is useful when you want to
strip third-party attribution but have not finalized a brand name yet.

## Custom logo and favicon

Provide a logo and/or favicon by URL (for example, an asset hosted on your CDN):

```env
WHITELABEL_LOGO_URL=https://cdn.example.com/brand/logo.svg
WHITELABEL_FAVICON_URL=https://cdn.example.com/brand/favicon.ico
```

The logo replaces the default terminal icon in the header and footer. When a URL
is unset or invalid, Stellaris falls back to the default icon (logo) or the
existing favicon — an invalid URL is ignored and logged, never fatal.

!!! note "Logos are referenced, not bundled"
    Logos and favicons are loaded by URL only; Stellaris does not bundle or
    upload image files. Host the assets yourself and ensure the URLs are
    reachable from your users' browsers.

## Footer text and the `{year}` token

`WHITELABEL_FOOTER_TEXT` is rendered as **plain text** — it is never interpreted
as HTML, so it cannot inject markup. The only interpolation is the `{year}`
token, which is replaced with the current UTC year. Every occurrence is
replaced:

```env
WHITELABEL_FOOTER_TEXT=© {year} Evil Corp. All rights reserved.
```

renders as `© 2026 Evil Corp. All rights reserved.`. Any other braces are left
untouched.

## Cloudflare Workers deployment

For a Workers deployment, set the variables as `vars` in `wrangler.jsonc`:

```jsonc
"vars": {
  "WHITELABEL_ENABLED": "true",
  "WHITELABEL_BRAND_NAME": "Evil Corp",
  "WHITELABEL_TITLE_SUFFIX": "Terraform Registry",
  "WHITELABEL_FOOTER_TEXT": "Evil Corp — {year}"
}
```

These are server-runtime variables, not `NEXT_PUBLIC_*`. Stellaris reads them on
the server and hands the resolved branding to the client through context — the
raw values are never shipped to the browser as a separate payload.

## Variable reference

See the [whitelabeling section in the Configuration reference](configuration.md#whitelabeling)
for the full table of variables and defaults.

## Behavior summary

| State | Title / hero | Footer | Tech badges & sponsor |
| --- | --- | --- | --- |
| `WHITELABEL_ENABLED=false` (default) | Default Stellaris branding | "Powered by …" | Shown |
| Enabled **with** brand name | `<brand> — <suffix>` | Your footer text | Hidden |
| Enabled **without** brand name | Generic neutral text | Year (or your footer text) | Hidden |
</content>
</invoke>
