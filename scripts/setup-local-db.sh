#!/usr/bin/env zsh
#
# Setup Local D1 Database
#
# Applies all Drizzle migrations to the local wrangler D1 database
# and creates a default API key for local development.
#
# Usage: pnpm db:setup
#

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================

DB_NAME="stellaris-db"
DRIZZLE_DIR="./drizzle"
DEV_KEY="stlr_0000000000000000000000000000000000000dev"

# ============================================================================
# Validate Prerequisites
# ============================================================================

sql_files=($DRIZZLE_DIR/*.sql(N))

if [[ ${#sql_files[@]} -eq 0 ]]; then
    echo "Error: No migration files found in $DRIZZLE_DIR/" >&2
    echo "Run 'pnpm db:generate' first to create migrations from the schema." >&2
    exit 1
fi

# ============================================================================
# Apply Migrations
# ============================================================================

echo "Applying migrations to local D1 database ($DB_NAME)..."

for f in "${sql_files[@]}"; do
    echo "  → $(basename "$f")"
    npx wrangler d1 execute "$DB_NAME" --local --file="$f"
done

echo "✅ Migrations applied!"

# ============================================================================
# Bootstrap Default API Key (local development only)
# ============================================================================

DEV_KEY_HASH="$(echo -n "$DEV_KEY" | shasum -a 256 | cut -d' ' -f1)"

echo ""
echo "Creating default API key for local development..."
npx wrangler d1 execute "$DB_NAME" --local --command \
    "INSERT OR IGNORE INTO api_keys (key_hash, name, description, created_at) VALUES ('${DEV_KEY_HASH}', 'local-dev', 'Default local development key', strftime('%s', 'now'));"

echo ""
echo "============================================"
echo "  Local Development API Key"
echo "============================================"
echo "  Key: ${DEV_KEY}"
echo ""
echo "  Usage:"
echo "    curl -H 'Authorization: Bearer ${DEV_KEY}' ..."
echo "============================================"
echo ""
echo "⚠️  This key is for LOCAL development only. Never use it in production."
