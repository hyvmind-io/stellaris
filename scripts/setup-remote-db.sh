#!/usr/bin/env zsh
#
# Setup Remote D1 Database
#
# Applies pending Drizzle migrations to the REMOTE Cloudflare D1 database using
# Wrangler's built-in migration tracking (D1_MIGRATIONS ledger table). Safe to
# re-run: already-applied migrations are skipped automatically.
#
# This affects your production/staging database.
#
# Usage: pnpm db:setup:remote
#   Flags: --yes, -y  Skip confirmation prompt
#

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================

DB_NAME="stellaris-db"
DRIZZLE_DIR="./drizzle"
SKIP_CONFIRM=false

for arg in "$@"; do
    case "$arg" in
        --yes|-y) SKIP_CONFIRM=true ;;
    esac
done

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
# Confirm Remote Operation
# ============================================================================

if [[ "$SKIP_CONFIRM" == "false" ]]; then
    echo "⚠️  This will apply pending migrations to the REMOTE D1 database: $DB_NAME"
    echo "   Already-applied migrations are skipped automatically."
    echo ""
    printf "Continue? (y/N): "
    read -r answer
    if [[ "$answer" != "y" && "$answer" != "Y" ]]; then
        echo "Aborted."
        exit 0
    fi
    echo ""
fi

# ============================================================================
# Apply Pending Migrations
# ============================================================================

echo "Applying pending migrations to remote D1 database ($DB_NAME)..."
echo ""

npx wrangler d1 migrations apply "$DB_NAME" --remote

echo ""
echo "✅ Remote database is up to date!"
echo ""
echo "💡 Seed the first admin (there is no unauthenticated bootstrap):"
echo "   pnpm db:seed-admin"
echo "   pnpm db:create-key --name admin --permissions '[\"admin\"]' --remote"
