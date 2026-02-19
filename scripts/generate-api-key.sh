#!/usr/bin/env zsh
#
# Generate API Key
#
# Creates a new API key and inserts it into the D1 database.
# Works with both local and remote databases.
#
# Usage:
#   pnpm db:create-key --name "my-key"
#   pnpm db:create-key --name "ci" --description "CI/CD pipeline" --permissions '["publish"]'
#   pnpm db:create-key --name "admin" --permissions '["admin"]' --remote
#
# Flags:
#   --name NAME          Required. Name for the API key.
#   --description DESC   Optional. Description of the key's purpose.
#   --permissions JSON   Optional. JSON array of permissions (e.g. '["admin"]').
#   --remote             Insert into remote D1 instead of local.
#

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================

DB_NAME="stellaris-db"
KEY_NAME=""
KEY_DESCRIPTION=""
KEY_PERMISSIONS=""
REMOTE=false

# ============================================================================
# Parse Arguments
# ============================================================================

while [[ $# -gt 0 ]]; do
    case "$1" in
        --name)
            KEY_NAME="$2"
            shift 2
            ;;
        --description)
            KEY_DESCRIPTION="$2"
            shift 2
            ;;
        --permissions)
            KEY_PERMISSIONS="$2"
            shift 2
            ;;
        --remote)
            REMOTE=true
            shift
            ;;
        -h|--help)
            echo "Usage: pnpm db:create-key --name NAME [--description DESC] [--permissions JSON] [--remote]"
            echo ""
            echo "Options:"
            echo "  --name NAME          Required. Name for the API key."
            echo "  --description DESC   Optional. Description of the key's purpose."
            echo "  --permissions JSON   Optional. JSON array (e.g. '[\"admin\"]')."
            echo "  --remote             Insert into remote D1 instead of local."
            exit 0
            ;;
        *)
            echo "Error: Unknown option: $1" >&2
            echo "Run with --help for usage." >&2
            exit 1
            ;;
    esac
done

# ============================================================================
# Validate Required Arguments
# ============================================================================

if [[ -z "$KEY_NAME" ]]; then
    echo "Error: --name is required." >&2
    echo "Usage: pnpm db:create-key --name NAME [--description DESC] [--permissions JSON] [--remote]" >&2
    exit 1
fi

# ============================================================================
# Generate Key
# ============================================================================

# Generate 20 random bytes → 40 hex chars (matches generateApiKey() in api-keys.ts)
KEY_HEX=$(openssl rand -hex 20)
API_KEY="stlr_${KEY_HEX}"

# Hash with SHA-256 (matches hashApiKey() in api-keys.ts)
KEY_HASH=$(echo -n "$API_KEY" | shasum -a 256 | cut -d' ' -f1)

# ============================================================================
# Build SQL
# ============================================================================

# Escape single quotes in name/description for SQL safety
ESCAPED_NAME="${KEY_NAME//\'/\'\'}"
ESCAPED_DESC="${KEY_DESCRIPTION//\'/\'\'}"

# Build the SQL INSERT
if [[ -n "$KEY_PERMISSIONS" ]]; then
    ESCAPED_PERMS="${KEY_PERMISSIONS//\'/\'\'}"
    SQL="INSERT INTO api_keys (key_hash, name, description, permissions, created_at) VALUES ('${KEY_HASH}', '${ESCAPED_NAME}', '${ESCAPED_DESC}', '${ESCAPED_PERMS}', strftime('%s', 'now'));"
else
    SQL="INSERT INTO api_keys (key_hash, name, description, created_at) VALUES ('${KEY_HASH}', '${ESCAPED_NAME}', '${ESCAPED_DESC}', strftime('%s', 'now'));"
fi

# ============================================================================
# Insert into Database
# ============================================================================

if [[ "$REMOTE" == "true" ]]; then
    echo "⚠️  Inserting API key into REMOTE database..."
    npx wrangler d1 execute "$DB_NAME" --remote --command "$SQL"
else
    npx wrangler d1 execute "$DB_NAME" --local --command "$SQL"
fi

# ============================================================================
# Output
# ============================================================================

echo ""
echo "============================================"
echo "  API Key Created"
echo "============================================"
echo "  Key:         ${API_KEY}"
echo "  Name:        ${KEY_NAME}"
if [[ -n "$KEY_DESCRIPTION" ]]; then
echo "  Description: ${KEY_DESCRIPTION}"
fi
if [[ -n "$KEY_PERMISSIONS" ]]; then
echo "  Permissions: ${KEY_PERMISSIONS}"
fi
echo "  Database:    $(if [[ "$REMOTE" == "true" ]]; then echo "remote"; else echo "local"; fi)"
echo "============================================"
echo ""
echo "⚠️  Save this key now — it cannot be retrieved later!"
