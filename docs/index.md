# Stellaris

**Private Terraform/OpenTofu module and provider registry on Cloudflare Workers.**

Stellaris is a modern, edge-first private registry for
[Terraform](https://www.terraform.io/) and [OpenTofu](https://opentofu.org/)
modules and providers. It implements the official
[Module Registry Protocol](https://developer.hashicorp.com/terraform/internals/module-registry-protocol)
and
[Provider Registry Protocol](https://developer.hashicorp.com/terraform/internals/provider-registry-protocol),
so `terraform init` works natively — no wrappers, no plugins.

It runs entirely on [Cloudflare Workers](https://workers.cloudflare.com/) with
no origin servers. Metadata lives in [Cloudflare D1](https://developers.cloudflare.com/d1/)
(SQLite at the edge), artifacts are stored in
[Cloudflare R2](https://developers.cloudflare.com/r2/) (S3-compatible object
storage), and the web UI is a full [Next.js](https://nextjs.org/) application
served from the same Worker.

## What you can do

- **Use it like any registry.** `terraform init`, `terraform get`, and
  `terraform providers` work out of the box through the standard registry
  protocols.
- **Publish modules and providers.** Push versioned modules and multi-platform
  providers with SHA256 checksums and GPG signing keys.
- **Browse and search.** A web UI lets you explore modules, providers, and
  versions across your registry.
- **Control access.** JWT session cookies for the web UI, Bearer API keys for
  the REST API, and optional Cloudflare Access passthrough for
  identity-provider-fronted deployments.
- **Keep artifacts immutable.** Published artifact bytes are protected from
  accidental overwrite by default.

## Where to go next

| If you want to… | Read |
| --- | --- |
| Understand the auth model (sessions, API keys, Cloudflare Access) | [Authentication](authentication.md) |
| Publish a module or provider from CI | [Publishing Guide](publishing.md) |
| See every endpoint, field, and error code | [API Reference](API.md) |
| Configure environment variables and runtime settings | [Configuration Reference](configuration.md) |
| Understand request throttling | [Rate Limiting](RATE_LIMITING.md) |

!!! note "Repository docs"
    This site is generated from the documentation in the Stellaris repository.
    The repository `README.md`, `QUICKSTART.md`, and `CONTRIBUTING.md` remain
    the canonical entry points for cloning, local development, and contributing,
    and are intentionally not duplicated here.
