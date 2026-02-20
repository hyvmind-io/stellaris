#!/usr/bin/env zsh
#
# Reset Local D1 Database
#
# Wipes the local Wrangler state directory (.wrangler/), which contains
# the local D1 SQLite files and R2 object storage emulation.
#
# This is a LOCAL-ONLY, destructive operation. Run 'pnpm db:setup' after
# this to reinitialize the database from migrations.
#
# Usage: pnpm db:reset
#

set -euo pipefail

WRANGLER_STATE=".wrangler"

if [[ -d "$WRANGLER_STATE" ]]; then
    rm -rf "$WRANGLER_STATE"
    echo "🗑  Removed .wrangler/ (local D1 + R2 state)"
else
    echo "ℹ️  No local state found — nothing to delete"
fi

echo ""
echo "✅ Local state wiped. Run 'pnpm db:setup' to reinitialize."
