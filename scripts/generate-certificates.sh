#!/usr/bin/env zsh
#
# Generate Local HTTPS Certificates
#
# Creates a complete self-signed certificate chain (Root CA + server cert)
# for local HTTPS development with Next.js.
#
# Usage:
#   pnpm dev:generate-certs
#   pnpm dev:generate-certs -- --force
#   pnpm dev:generate-certs -- --domain myregistry.local
#   pnpm dev:generate-certs -- --domain models.magnuschat.com --force
#
# Flags:
#   --domain DOMAIN   Add custom DNS name to certificate SANs (repeatable).
#   --force           Overwrite existing certificates without prompting.
#   --help            Show this help message.
#

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================

SCRIPT_DIR="${0:a:h}"
PROJECT_ROOT="${SCRIPT_DIR:h}"
CERT_DIR="${PROJECT_ROOT}/.certificates"

CA_KEY="${CERT_DIR}/ca-key.pem"
CA_CERT="${CERT_DIR}/ca-cert.pem"
SERVER_KEY="${CERT_DIR}/localhost-key.pem"
SERVER_CERT="${CERT_DIR}/localhost.pem"

CA_DAYS=3650
SERVER_DAYS=365

FORCE=false
EXTRA_DOMAINS=()

# ============================================================================
# Parse Arguments
# ============================================================================

while [[ $# -gt 0 ]]; do
    case "$1" in
        --force)
            FORCE=true
            shift
            ;;
        --domain)
            EXTRA_DOMAINS+=("$2")
            shift 2
            ;;
        -h|--help)
            echo "Usage: pnpm dev:generate-certs [-- --force] [-- --domain DOMAIN ...]"
            echo ""
            echo "Generates a self-signed certificate chain for local HTTPS development."
            echo ""
            echo "Output directory: .certificates/"
            echo ""
            echo "Files created:"
            echo "  ca-key.pem        Root CA private key"
            echo "  ca-cert.pem       Root CA certificate (valid ${CA_DAYS} days)"
            echo "  localhost-key.pem  Server private key"
            echo "  localhost.pem      Server certificate (valid ${SERVER_DAYS} days)"
            echo ""
            echo "Options:"
            echo "  --domain DOMAIN   Add a custom DNS name to the certificate SANs."
            echo "                    Can be specified multiple times. localhost is always included."
            echo "  --force           Overwrite existing certificates without prompting."
            echo "  --help            Show this help message."
            echo ""
            echo "Examples:"
            echo "  pnpm dev:generate-certs"
            echo "  pnpm dev:generate-certs -- --domain myregistry.local"
            echo "  pnpm dev:generate-certs -- --domain models.magnuschat.com --domain registry.dev.local"
            echo "  pnpm dev:generate-certs -- --force --domain myregistry.local"
            exit 0
            ;;
        --)
            shift
            ;;
        *)
            echo "Error: Unknown option: $1" >&2
            echo "Run with --help for usage." >&2
            exit 1
            ;;
    esac
done

# ============================================================================
# Check Existing Certificates
# ============================================================================

if [[ -d "$CERT_DIR" ]] && [[ -f "$CA_CERT" || -f "$SERVER_CERT" ]]; then
    if [[ "$FORCE" == "true" ]]; then
        echo "⚠️  --force specified, overwriting existing certificates..."
    else
        echo "Certificates already exist in .certificates/"
        echo ""
        echo "  CA cert:     ${CA_CERT}"
        echo "  Server cert: ${SERVER_CERT}"
        echo ""
        echo -n "Overwrite? [y/N] "
        read -r REPLY
        if [[ "$REPLY" != "y" && "$REPLY" != "Y" ]]; then
            echo "Aborted."
            exit 0
        fi
    fi
fi

# ============================================================================
# Create Output Directory
# ============================================================================

mkdir -p "$CERT_DIR"

# ============================================================================
# Generate Root CA
# ============================================================================

echo ""
echo "Generating Root CA..."

openssl genrsa -out "$CA_KEY" 4096 2>/dev/null

openssl req -new -x509 \
    -key "$CA_KEY" \
    -out "$CA_CERT" \
    -days "$CA_DAYS" \
    -subj "/CN=Stellaris Local CA" \
    2>/dev/null

# ============================================================================
# Generate Server Key + CSR
# ============================================================================

echo "Generating server key and CSR..."

openssl genrsa -out "$SERVER_KEY" 2048 2>/dev/null

openssl req -new \
    -key "$SERVER_KEY" \
    -out "${CERT_DIR}/localhost.csr" \
    -subj "/CN=localhost" \
    2>/dev/null

# ============================================================================
# Create SAN Configuration
# ============================================================================

SAN_CONFIG=$(mktemp)
trap "rm -f '$SAN_CONFIG' '${CERT_DIR}/localhost.csr'" EXIT

# Build alt_names entries
DNS_INDEX=1
{
    echo "[v3_req]"
    echo "authorityKeyIdentifier = keyid,issuer"
    echo "basicConstraints = CA:FALSE"
    echo "keyUsage = digitalSignature, keyEncipherment"
    echo "extendedKeyUsage = serverAuth"
    echo "subjectAltName = @alt_names"
    echo ""
    echo "[alt_names]"
    echo "DNS.${DNS_INDEX} = localhost"
    for domain in "${EXTRA_DOMAINS[@]}"; do
        DNS_INDEX=$((DNS_INDEX + 1))
        echo "DNS.${DNS_INDEX} = ${domain}"
    done
    echo "IP.1 = 127.0.0.1"
    echo "IP.2 = ::1"
} > "$SAN_CONFIG"

# ============================================================================
# Sign Server Certificate with CA
# ============================================================================

echo "Signing server certificate with Root CA..."

openssl x509 -req \
    -in "${CERT_DIR}/localhost.csr" \
    -CA "$CA_CERT" \
    -CAkey "$CA_KEY" \
    -CAcreateserial \
    -out "$SERVER_CERT" \
    -days "$SERVER_DAYS" \
    -extfile "$SAN_CONFIG" \
    -extensions v3_req \
    2>/dev/null

# Clean up CA serial file
rm -f "${CERT_DIR}/ca-cert.srl"

# ============================================================================
# Read Expiry Dates
# ============================================================================

CA_EXPIRY=$(openssl x509 -in "$CA_CERT" -noout -enddate | cut -d= -f2)
SERVER_EXPIRY=$(openssl x509 -in "$SERVER_CERT" -noout -enddate | cut -d= -f2)

# ============================================================================
# Output
# ============================================================================

echo ""
echo "============================================"
echo "  HTTPS Certificates Generated"
echo "============================================"
echo "  CA key:      .certificates/ca-key.pem"
echo "  CA cert:     .certificates/ca-cert.pem       (expires: ${CA_EXPIRY})"
echo "  Server key:  .certificates/localhost-key.pem"
echo "  Server cert: .certificates/localhost.pem      (expires: ${SERVER_EXPIRY})"
echo "============================================"
echo ""
echo "  SANs included:"
echo "    DNS: localhost"
for domain in "${EXTRA_DOMAINS[@]}"; do
    echo "    DNS: ${domain}"
done
echo "    IP:  127.0.0.1"
echo "    IP:  ::1"
echo ""
echo "Add to .env.local (optional):"
echo ""
echo "  NEXT_PUBLIC_APP_URL=https://localhost:3000"
echo "  HTTPS_KEY_PATH=.certificates/localhost-key.pem"
echo "  HTTPS_CERT_PATH=.certificates/localhost.pem"
echo "  HTTPS_CA_PATH=.certificates/ca-cert.pem"
echo ""
echo "Start the dev server with HTTPS:"
echo ""
echo "  pnpm dev:https"
echo ""
echo "To trust the CA on macOS (removes browser warnings):"
echo ""
echo "  sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain .certificates/ca-cert.pem"
echo ""
echo "============================================"
echo "  Terraform / OpenTofu Configuration"
echo "============================================"
echo ""
echo "Option 1: Trust the CA (recommended)"
echo ""
echo "  Export the CA cert path so tofu/terraform trusts it:"
echo ""
echo "  export SSL_CERT_FILE=$(pwd)/.certificates/ca-cert.pem"
echo ""
echo "  Or configure in ~/.terraformrc (Terraform) / ~/.tofurc (OpenTofu):"
echo ""
echo "  provider_installation {"
echo "    direct {"
echo "      exclude = []"
echo "    }"
echo "  }"
echo ""
echo "  Then run with the env var:"
echo ""
echo "  SSL_CERT_FILE=$(pwd)/.certificates/ca-cert.pem tofu init"
echo "  SSL_CERT_FILE=$(pwd)/.certificates/ca-cert.pem tofu plan"
echo ""
echo "Option 2: Skip TLS verification (quick & dirty)"
echo ""
echo "  For OpenTofu:"
echo ""
echo "  export TOFU_TLS_SKIP_VERIFY=1"
echo "  tofu init"
echo ""
echo "  For Terraform (via Go's TLS):"
echo ""
echo "  export TF_SKIP_PROVIDER_VERIFY=1"
echo "  # Or use the CLI flag:"
echo "  terraform init -backend-config=\"skip_cert_verification=true\""
echo ""
echo "  ⚠️  TLS skip is for local development ONLY — never use in production."
echo ""
