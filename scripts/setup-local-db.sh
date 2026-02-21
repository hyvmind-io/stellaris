#!/usr/bin/env zsh
#
# Setup Local D1 Database
#
# Applies pending Drizzle migrations to the local Wrangler D1 database using
# Wrangler's built-in migration tracking (D1_MIGRATIONS ledger table). Safe to
# re-run: already-applied migrations are skipped automatically.
#
# Run 'pnpm db:reset' first to wipe existing state if you need a clean slate.
#
# To create an API key after setup, use:
#   pnpm db:create-key --name "local-admin" --permissions '["admin"]'
#
# Usage: pnpm db:setup
#

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================

DB_NAME="stellaris-db"
DRIZZLE_DIR="./drizzle"

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
# Apply Pending Migrations
# ============================================================================

echo "Applying pending migrations to local D1 database ($DB_NAME)..."
echo "(Already-applied migrations are skipped automatically.)"
echo ""

npx wrangler d1 migrations apply "$DB_NAME" --local

echo ""
echo "✅ Local database is up to date!"
echo ""
echo "💡 Create an API key to start using the registry:"
echo "   pnpm db:create-key --name \"local-admin\" --permissions '[\"admin\"]'"
