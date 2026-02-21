#!/usr/bin/env zsh
#
# Reset Remote D1 Database
#
# ⚠️  DESTRUCTIVE: Drops ALL user tables (including the Wrangler migration
# ledger) from the REMOTE D1 database, then runs VACUUM to reclaim space.
# This is irreversible. Run 'pnpm db:setup:remote' afterwards to reinitialize
# from migrations.
#
# Table discovery is dynamic — queries sqlite_master so no stale hardcoded
# list is needed as the schema evolves.
#
# Usage: pnpm db:reset:remote
#

set -euo pipefail

DB_NAME="stellaris-db"

# ============================================================================
# Double Confirmation
# ============================================================================

echo ""
echo "🚨 DANGER: This will DROP ALL TABLES from the REMOTE database: $DB_NAME"
echo "   All data (modules, providers, API keys, migration history) will be"
echo "   permanently deleted."
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
# Discover All User Tables (including migration ledger)
# ============================================================================

echo ""
echo "Discovering tables in remote database..."

# Query sqlite_master for all tables (type='table'), excluding the built-in
# sqlite_* tables. This includes application tables AND the Wrangler migration
# ledger (D1_MIGRATIONS) so a subsequent db:setup:remote starts clean.
tables_raw=$(npx wrangler d1 execute "$DB_NAME" --remote \
    --command "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;" \
    --json 2>/dev/null || true)

# Extract table names from the JSON result array produced by --json.
# wrangler d1 execute --json returns: [{"results":[{"name":"..."},...]}]
tables=()
if [[ -n "$tables_raw" ]]; then
    while IFS= read -r tbl; do
        [[ -n "$tbl" ]] && tables+=("$tbl")
    done < <(echo "$tables_raw" | npx --yes node -e "
const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
const rows = (data[0] && data[0].results) ? data[0].results : [];
rows.forEach(r => process.stdout.write(r.name + '\n'));
" 2>/dev/null)
fi

if [[ ${#tables[@]} -eq 0 ]]; then
    echo "ℹ️  No tables found in remote database — nothing to drop."
    echo ""
    echo "Run 'pnpm db:setup:remote' to initialize from migrations."
    exit 0
fi

# ============================================================================
# Drop All Tables
# ============================================================================

echo ""
echo "Dropping all tables from remote database..."

for table in "${tables[@]}"; do
    echo "  → DROP TABLE IF EXISTS \"$table\""
    npx wrangler d1 execute "$DB_NAME" --remote \
        --command "DROP TABLE IF EXISTS \"$table\";"
done

# Reclaim space
echo ""
echo "Running VACUUM..."
npx wrangler d1 execute "$DB_NAME" --remote --command "VACUUM;"

echo ""
echo "🗑  All tables dropped and database vacuumed."
echo ""
echo "✅ Remote database wiped. Run 'pnpm db:setup:remote' to reinitialize."
