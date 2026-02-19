#!/usr/bin/env zsh
#
# Reset Remote D1 Database
#
# ⚠️  DESTRUCTIVE: Drops ALL tables from the REMOTE D1 database
# and reinitializes from migrations. This is irreversible.
#
# Usage: pnpm db:reset:remote
#

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================

DB_NAME="stellaris-db"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Tables in reverse dependency order (children before parents)
TABLES=(
    "sessions"
    "rate_limits"
    "api_keys"
    "gpg_public_keys"
    "provider_platforms"
    "providers"
    "modules"
    "system_settings"
    "users"
)

# ============================================================================
# Double Confirmation
# ============================================================================

echo ""
echo "🚨 DANGER: This will DROP ALL TABLES from the REMOTE database: $DB_NAME"
echo "   All data (modules, providers, API keys) will be permanently deleted."
echo ""
printf "Type the database name to confirm: "
read -r confirm_name
if [[ "$confirm_name" != "$DB_NAME" ]]; then
    echo "Database name does not match. Aborted." >&2
    exit 1
fi

printf "Are you absolutely sure? (yes/NO): "
read -r confirm_yes
if [[ "$confirm_yes" != "yes" ]]; then
    echo "Aborted."
    exit 0
fi

# ============================================================================
# Drop All Tables
# ============================================================================

echo ""
echo "Dropping tables from remote database..."

for table in "${TABLES[@]}"; do
    echo "  → DROP TABLE IF EXISTS $table"
    npx wrangler d1 execute "$DB_NAME" --remote --command "DROP TABLE IF EXISTS $table;"
done

echo ""
echo "🗑  All tables dropped."

# ============================================================================
# Reinitialize
# ============================================================================

echo ""
echo "Reinitializing remote database..."
exec zsh "$SCRIPT_DIR/setup-remote-db.sh" --yes
