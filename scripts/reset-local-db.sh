#!/usr/bin/env zsh
#
# Reset Local D1 Database
#
# Wipes the local wrangler state (D1 + R2) and reinitializes
# the database from migrations. This is a LOCAL-ONLY operation.
#
# Usage: pnpm db:reset
#

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================

WRANGLER_STATE=".wrangler"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ============================================================================
# Wipe Local State
# ============================================================================

if [[ -d "$WRANGLER_STATE" ]]; then
    rm -rf "$WRANGLER_STATE"
    echo "🗑  Removed .wrangler/ (local D1 + R2 state)"
else
    echo "ℹ️  No local state found — nothing to delete"
fi

# ============================================================================
# Reinitialize
# ============================================================================

echo ""
exec zsh "$SCRIPT_DIR/setup-local-db.sh"
