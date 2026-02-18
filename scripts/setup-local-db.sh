#!/usr/bin/env zsh
#
# Setup Local D1 Database
# Applies Drizzle migrations to the local wrangler D1 database
#

set -euo pipefail

echo "Applying migrations to local D1 database..."
npx wrangler d1 execute stellaris-db --local --file=./drizzle/0000_init.sql
echo "✅ Local database ready!"
