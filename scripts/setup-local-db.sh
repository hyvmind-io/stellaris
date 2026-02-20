#!/usr/bin/env zsh
#
# Setup Local D1 Database
#
# Applies all Drizzle migrations to the local Wrangler D1 database.
# Run 'pnpm db:reset' first to wipe existing state.
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
# Apply Migrations
# ============================================================================

echo "Applying migrations to local D1 database ($DB_NAME)..."

for f in "${sql_files[@]}"; do
    echo "  → $(basename "$f")"
    npx wrangler d1 execute "$DB_NAME" --local --file="$f"
done

echo ""
echo "✅ Migrations applied!"
echo ""
echo "💡 Create an API key to start using the registry:"
echo "   pnpm db:create-key --name \"local-admin\" --permissions '[\"admin\"]'"
