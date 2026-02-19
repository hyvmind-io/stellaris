<p align="center"><img src="logo.png" alt="Stellaris" width="384" /></p>

<h1 align="center">Stellaris</h1>

<p align="center">Private Terraform/OpenTofu module and provider registry on Cloudflare Workers</p>

<p align="center"><sub>This project is under active development and not yet ready for production use.</sub></p>

## Overview

Stellaris is a self-hosted Terraform and OpenTofu registry that implements the official registry protocol. It runs entirely on Cloudflare Workers with D1 for metadata and R2 for artifact storage, requiring no traditional server infrastructure.

## Tech Stack

- Next.js 16 (canary) with Turbopack
- React 19 + TypeScript 5.9
- Cloudflare Workers via @opennextjs/cloudflare
- Cloudflare D1 (SQLite) for metadata storage
- Cloudflare R2 for artifact storage
- Drizzle ORM
- Tailwind CSS 4 + shadcn/ui
- Vitest
- Zod

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- [pnpm](https://pnpm.io/)
- A Cloudflare account with D1 and R2 enabled

### Setup

```bash
# Install dependencies
pnpm install

# Copy environment config
cp .env.example .env

# Apply database migrations to local D1
./scripts/setup-local-db.sh

# Start the dev server
pnpm dev
```

### Environment Variables

| Variable                 | Description            |
| ------------------------ | ---------------------- |
| `NODE_ENV`               | Runtime environment    |
| `NEXT_PUBLIC_APP_URL`    | Public application URL |
| `CLOUDFLARE_ACCOUNT_ID`  | Cloudflare account ID  |
| `CLOUDFLARE_DATABASE_ID` | D1 database ID         |
| `CLOUDFLARE_D1_TOKEN`    | D1 API token           |

### Commands

| Command            | Description                            |
| ------------------ | -------------------------------------- |
| `pnpm dev`         | Local dev server (Turbopack)           |
| `pnpm build`       | Production build                       |
| `pnpm preview`     | Build and preview on Cloudflare        |
| `pnpm deploy`      | Build and deploy to Cloudflare Workers |
| `pnpm test`        | Run tests (Vitest)                     |
| `pnpm db:generate` | Generate Drizzle migrations            |
| `pnpm db:migrate`  | Run migrations                         |
| `pnpm db:studio`   | Open Drizzle Studio                    |

## API Endpoints

| Endpoint                            | Description               |
| ----------------------------------- | ------------------------- |
| `GET /.well-known/terraform.json`   | Service discovery         |
| `GET /v1/modules`                   | Module listing and search |
| `GET /v1/modules/tarball/[...path]` | Module tarball download   |
| `GET /health`                       | Health check              |

## Cloudflare Resources

- **D1 database**: `stellaris-db` (binding: `DB`)
- **R2 bucket**: `stellaris-modules` (binding: `MODULES_STORAGE`)

## Database Schema

Managed with Drizzle ORM. Tables: `modules`, `providers`, `provider_platforms`, `gpg_public_keys`, `api_keys`.

## License

All rights reserved. Copyright 2026 Evandro Camargo.
