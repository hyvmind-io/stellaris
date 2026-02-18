#!/usr/bin/env zsh
#
# Setup Remote D1 Database
#
# Applies all Drizzle migrations to the REMOTE Cloudflare D1 database.
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
# Confirm Remote Operation
# ============================================================================

if [[ "$SKIP_CONFIRM" == "false" ]]; then
    echo "⚠️  This will apply migrations to the REMOTE D1 database: $DB_NAME"
    echo ""
    printf "Continue? (y/N): "
    read -r answer
    if [[ "$answer" != "y" && "$answer" != "Y" ]]; then
        echo "Aborted."
        exit 0
    fi
fi

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

echo "Applying migrations to remote D1 database ($DB_NAME)..."

for f in "${sql_files[@]}"; do
    echo "  → $(basename "$f")"
    npx wrangler d1 execute "$DB_NAME" --remote --file="$f"
done

echo ""
echo "✅ Remote migrations applied!"
echo ""
echo "💡 To create an API key, use the bootstrap endpoint:"
echo "   curl -X POST https://your-domain/v1/api-keys \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"name\": \"admin\", \"description\": \"Initial admin key\"}'"
