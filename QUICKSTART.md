# Quick Start: Local Testing

## Set up the local environment

### Install deps & set up local D1 database

```bash
pnpm install
pnpm db:setup
```

### Start dev server

```bash
pnpm dev   # → http://localhost:3000
```

### Reset local database (if needed)

```bash
pnpm db:reset
```

This wipes `.wrangler/` and re-applies all migrations from scratch.

### Generate additional API keys

```bash
# Basic key
pnpm db:create-key --name "my-key"

# With description and permissions
pnpm db:create-key --name "ci-pipeline" --description "CI/CD key" --permissions '["publish"]'

# Admin key
pnpm db:create-key --name "admin" --permissions '["admin"]'

# Insert into remote database
pnpm db:create-key --name "prod-ci" --permissions '["publish"]' --remote
```

This inserts a key directly into the D1 database via wrangler (no running server needed).
Run `pnpm db:create-key --help` for all options.

The setup script creates a well-known dev API key:

```
stlr_0000000000000000000000000000000000000dev
```

## Verify service discovery

```bash
curl http://localhost:3000/.well-known/terraform.json
```

```json
{ "modules.v1": "/v1/modules/", "providers.v1": "/v1/providers/" }
```

---

## Publishing a Module

A module is a `.tar.gz` tarball of Terraform code. Maximum size: **50 MB**.

### Create a test module tarball

```bash
# Create a minimal Terraform module
mkdir -p /tmp/test-module
cat > /tmp/test-module/main.tf << 'EOF'
variable "name" { default = "world" }
output "greeting" { value = "Hello, ${var.name}!" }
EOF
# Package it as a tarball
tar -czf /tmp/test-module.tar.gz -C /tmp/test-module .
```

### Publish from an existing module directory

When packaging a real module, exclude non-essential files to stay under the 50 MB limit:

```bash
tar -czf my-module.tar.gz \
  --exclude='.terraform' \
  --exclude='.git' \
  --exclude='.jj' \
  --exclude='node_modules' \
  --exclude='.terragrunt-cache' \
  -C /path/to/your-module .
```

### Publish it

```bash
curl -X POST http://localhost:3000/v1/modules/myorg/hello/aws/1.0.0 \
  -H "Authorization: Bearer stlr_0000000000000000000000000000000000000dev" \
  -F "module=@./my-module.tar.gz" \
  -F "owner=platform-team"
```

> **curl tip:** The `-F "module=@./file.tar.gz"` syntax means "file relative to the current directory". Using `@/file.tar.gz` would look for the file at the filesystem root, which is not what you want.

Response (201):

```json
{
  "id": "myorg/hello/aws/1.0.0",
  "namespace": "myorg",
  "name": "hello",
  "provider": "aws",
  "version": "1.0.0",
  "owner": "platform-team",
  "published_at": "2026-02-19T...",
  "downloads": 0
}
```

## Verify it works

### List versions (Terraform protocol)

```bash
curl http://localhost:3000/v1/modules/myorg/hello/aws/versions
```

### Get download redirect (Terraform CLI uses this)

```bash
curl -I http://localhost:3000/v1/modules/myorg/hello/aws/1.0.0/download
```

### Get metadata

```bash
curl http://localhost:3000/v1/modules/myorg/hello/aws/1.0.0
```

### Browse all modules

```bash
curl http://localhost:3000/v1/modules
```

### Search

```bash
curl "http://localhost:3000/v1/modules?q=hello"
```

## Use with Terraform CLI

### In your .terraformrc or terraform.rc:

```hcl
provider_installation {
  direct {}
}
```

### Or configure as a registry mirror:

```hcl
module "hello" {
  source  = "localhost:3000/myorg/hello/aws"
  version = "1.0.0"
}
```

---

## Publishing a Provider

Providers are more complex — they require zip binaries, SHA256 checksums, and GPG signing keys.

### Create test provider artifacts

### Create a dummy provider binary

```bash
mkdir -p /tmp/test-provider
echo '#!/bin/sh' > /tmp/test-provider/terraform-provider-example
chmod +x /tmp/test-provider/terraform-provider-example
```

### Zip it per-platform

```bash
cd /tmp/test-provider
zip terraform-provider-example_1.0.0_linux_amd64.zip terraform-provider-example
zip terraform-provider-example_1.0.0_darwin_arm64.zip terraform-provider-example
```

### Generate SHA256SUMS

```bash
shasum -a 256 terraform-provider-example_1.0.0_*.zip > SHA256SUMS
```

### Generate a GPG key (if you don't have one) and sign

```bash
gpg --batch --gen-key <<EOF2
%no-protection
Key-Type: RSA
Key-Length: 2048
Name-Real: Test Signer
Name-Email: test@example.com
Expire-Date: 0
%commit
EOF2
gpg --detach-sign --armor -o SHA256SUMS.sig SHA256SUMS
```

### Get the GPG key ID and ASCII armor

```bash
GPG_KEY_ID=$(gpg --list-keys --keyid-format long test@example.com | grep pub | awk '{print $2}' | cut -d'/' -f2)
GPG_ASCII_ARMOR=$(gpg --export --armor test@example.com)
```

### Get the SHA sums

```bash
LINUX_SHA=$(grep linux_amd64 SHA256SUMS | awk '{print $1}')
DARWIN_SHA=$(grep darwin_arm64 SHA256SUMS | awk '{print $1}')
```

### Publish it

```bash
curl -X POST http://localhost:3000/v1/providers/myorg/example/1.0.0 \
  -H "Authorization: Bearer stlr_0000000000000000000000000000000000000dev" \
  -F "data={
    \"protocols\": [\"6.0\"],
    \"platforms\": [
      {
        \"os\": \"linux\",
        \"arch\": \"amd64\",
        \"shasum\": \"${LINUX_SHA}\",
        \"filename\": \"terraform-provider-example_1.0.0_linux_amd64.zip\"
      },
      {
        \"os\": \"darwin\",
        \"arch\": \"arm64\",
        \"shasum\": \"${DARWIN_SHA}\",
        \"filename\": \"terraform-provider-example_1.0.0_darwin_arm64.zip\"
      }
    ],
    \"gpg_public_keys\": [
      {
        \"key_id\": \"${GPG_KEY_ID}\",
        \"ascii_armor\": $(echo "$GPG_ASCII_ARMOR" | jq -Rs .),
        \"source\": \"myorg\"
      }
    ]
  }" \
  -F "terraform-provider-example_1.0.0_linux_amd64.zip=@terraform-provider-example_1.0.0_linux_amd64.zip" \
  -F "terraform-provider-example_1.0.0_darwin_arm64.zip=@terraform-provider-example_1.0.0_darwin_arm64.zip" \
  -F "SHA256SUMS=@SHA256SUMS" \
  -F "SHA256SUMS.sig=@SHA256SUMS.sig"
```

### Verify it works

### List versions (Terraform protocol)

```bash
curl http://localhost:3000/v1/providers/myorg/example/versions
```

### Get package metadata for a specific platform

```bash
curl http://localhost:3000/v1/providers/myorg/example/1.0.0/download/linux/amd64
```

### Get SHA256SUMS

```bash
curl http://localhost:3000/v1/providers/myorg/example/1.0.0/sha256sums
```

### Browse all providers

```bash
curl http://localhost:3000/v1/providers
```

## Quick Reference: API Key Management

### Via CLI script (no server needed)

```bash
pnpm db:create-key --name "my-key"
pnpm db:create-key --name "admin" --permissions '["admin"]' --remote
```

### Bootstrap first key (no auth needed when DB is empty)

```bash
curl -X POST http://localhost:3000/v1/api-keys \
  -H "Content-Type: application/json" \
  -d '{"name": "admin", "description": "Initial admin key"}'
```

### Create additional key (requires auth)

```bash
curl -X POST http://localhost:3000/v1/api-keys \
  -H "Authorization: Bearer stlr_..." \
  -H "Content-Type: application/json" \
  -d '{"name": "ci-pipeline", "permissions": ["publish"]}'
```

### List keys

```bash
curl http://localhost:3000/v1/api-keys \
  -H "Authorization: Bearer stlr_..."
```

## Quick Reference: pnpm Scripts

| Command                | Description                                        |
| ---------------------- | -------------------------------------------------- |
| `pnpm db:setup`        | Apply migrations + create dev API key (local)      |
| `pnpm db:reset`        | Wipe `.wrangler/` and re-setup (local)             |
| `pnpm db:create-key`   | Generate a new API key (local or `--remote`)       |
| `pnpm db:setup:remote` | Apply migrations to remote D1                      |
| `pnpm db:reset:remote` | Drop all tables + re-setup remote D1 (destructive) |
| `pnpm db:generate`     | Generate Drizzle migrations from schema            |
| `pnpm db:studio`       | Open Drizzle Studio (visual DB browser)            |

## Quick Reference: Validation Rules

| Field                         | Rules                                                          |
| ----------------------------- | -------------------------------------------------------------- |
| namespace, name, system, type | [a-z0-9-], 1–64 chars, no leading/trailing hyphens             |
| version                       | Strict semver (1.0.0), v-prefix auto-stripped (v1.0.0 → 1.0.0) |
| os                            | [a-z0-9_]+, 1–32 chars (e.g., linux, darwin, windows)          |
| arch                          | [a-z0-9_]+, 1–32 chars (e.g., amd64, arm64)                    |
| module tarball                | `.tar.gz` file, max **50 MB**                                  |
| provider zip (per platform)   | `.zip` file, max **64 MB**                                     |
