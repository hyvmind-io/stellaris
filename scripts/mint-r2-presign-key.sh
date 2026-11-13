#!/usr/bin/env bash
# Mint a read-only R2 token for one bucket and install it as the Worker's presign key pair.
# Usage: scripts/mint-r2-presign-key.sh [--bucket NAME] [--account ID]
set -euo pipefail

BUCKET="stellaris-modules"
ACCOUNT_ID="$(sed -nE 's/.*"account_id": *"([0-9a-f]{32})".*/\1/p' wrangler.jsonc 2>/dev/null | head -1)"
API="https://api.cloudflare.com/client/v4"

while [ $# -gt 0 ]; do
  case "$1" in
    --bucket) BUCKET="$2"; shift ;;
    --account) ACCOUNT_ID="$2"; shift ;;
    -h|--help) sed -n 2,3p "$0"; exit 0 ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
  shift
done

fail() { echo "error: $*" >&2; exit 1; }
[ -n "$ACCOUNT_ID" ] || fail "no account ID (pass --account or set account_id in wrangler.jsonc)"
command -v jq >/dev/null || fail "jq not found"

# Global API Key is used once to mint the token and never stored.
printf 'Cloudflare account email: ' >&2; read -r EMAIL
printf 'Global API Key (hidden): ' >&2; read -rs GLOBAL_KEY; printf '\n' >&2
[ -n "$EMAIL" ] && [ -n "$GLOBAL_KEY" ] || fail "email and key are required"

cf() {
  curl -fsS "$API$1" -H "X-Auth-Email: $EMAIL" -H "X-Auth-Key: $GLOBAL_KEY" \
    -H "Content-Type: application/json" "${@:2}"
}

GROUP_ID="$(cf "/user/tokens/permission_groups?per_page=200" \
  | jq -r '.result[] | select(.name == "Workers R2 Storage Bucket Item Read") | .id' | head -1)"
[ -n "$GROUP_ID" ] || fail "permission group 'Workers R2 Storage Bucket Item Read' not found"

BODY="$(jq -nc --arg name "stellaris-presign-${BUCKET}-$(date +%Y%m%d)" \
  --arg res "com.cloudflare.edge.r2.bucket.${ACCOUNT_ID}_default_${BUCKET}" --arg gid "$GROUP_ID" \
  '{name:$name, policies:[{effect:"allow", resources:{($res):"*"}, permission_groups:[{id:$gid}]}]}')"

RESP="$(cf /user/tokens -X POST --data "$BODY")"
unset GLOBAL_KEY
[ "$(jq -r .success <<<"$RESP")" = true ] || fail "token creation failed: $(jq -c .errors <<<"$RESP")"

# R2 S3 pair: access key = token ID, secret = SHA-256 of the token value.
TOKEN_ID="$(jq -r .result.id <<<"$RESP")"
SECRET="$(jq -r .result.value <<<"$RESP" | tr -d '\n' | shasum -a 256 | cut -d' ' -f1)"
unset RESP
echo "created token $TOKEN_ID (read-only, bucket $BUCKET)" >&2

# A shell CLOUDFLARE_API_TOKEN would override wrangler's login.
printf %s "$TOKEN_ID" | env -u CLOUDFLARE_API_TOKEN npx wrangler secret put R2_ACCESS_KEY_ID >/dev/null
printf %s "$SECRET" | env -u CLOUDFLARE_API_TOKEN npx wrangler secret put R2_SECRET_ACCESS_KEY >/dev/null
unset SECRET
echo "installed R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY on the Worker" >&2
