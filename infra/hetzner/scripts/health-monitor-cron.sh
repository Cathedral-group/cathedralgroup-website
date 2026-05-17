#!/bin/bash
# ============================================
# Cathedral Health Monitor — cron Hetzner */15
# ============================================
# Llamado por crontab cada 15min. Firma HMAC-SHA256 y POST a Vercel endpoint.
# Regla SUPREMA feedback_vercel_hobby_limits.md: cron va en Hetzner NO Vercel.
#
# Setup:
#   1. Pegar este script en /opt/cathedral/scripts/health-monitor-cron.sh
#   2. chmod +x /opt/cathedral/scripts/health-monitor-cron.sh
#   3. echo 'HEALTH_MONITOR_HMAC_SECRET=<value>' >> /etc/cathedral/health-monitor.env
#   4. chmod 600 /etc/cathedral/health-monitor.env
#   5. Crontab: */15 * * * * /opt/cathedral/scripts/health-monitor-cron.sh >> /var/log/cathedral/health-monitor.log 2>&1
#
# Secret rotation: pattern dual env var (V1 + V2) durante ventana rotation.
# Sesión 18/05/2026 — P0.3 specs.
# ============================================

set -euo pipefail

# Cargar env (secret HMAC)
ENV_FILE="${HEALTH_MONITOR_ENV_FILE:-/etc/cathedral/health-monitor.env}"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "[$(date -u +%FT%TZ)] ERROR: env file not found: $ENV_FILE" >&2
  exit 1
fi
# shellcheck disable=SC1090
source "$ENV_FILE"

: "${HEALTH_MONITOR_HMAC_SECRET:?HEALTH_MONITOR_HMAC_SECRET required}"
: "${HEALTH_MONITOR_ENDPOINT:=https://cathedralgroup.es/api/agents/health-monitor}"

# Dependencias mínimas
for cmd in curl openssl jq date; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "ERROR: missing $cmd" >&2; exit 1; }
done

# Build body: timestamp + source + optional checks payload
TS=$(date +%s)
HOSTNAME=$(hostname -s 2>/dev/null || echo "unknown")
BODY=$(jq -n -c \
  --arg src "hetzner-cron-15m" \
  --arg host "$HOSTNAME" \
  --argjson ts "$TS" \
  '{source: $src, hostname: $host, timestamp: $ts}')

# Build signature: HMAC-SHA256(secret, timestamp + "." + rawBody)
PAYLOAD="${TS}.${BODY}"
SIG=$(printf '%s' "$PAYLOAD" \
  | openssl dgst -sha256 -hmac "$HEALTH_MONITOR_HMAC_SECRET" \
  | awk '{print $NF}')

# POST con timeout strict (Vercel cold start <10s + Health Monitor LLM call ~30-60s)
HTTP_CODE=$(curl -sS -o /tmp/health-monitor-response.json -w "%{http_code}" \
  --max-time 90 \
  --retry 2 \
  --retry-delay 5 \
  --retry-connrefused \
  -X POST "$HEALTH_MONITOR_ENDPOINT" \
  -H "Content-Type: application/json" \
  -H "X-HMAC-Timestamp: $TS" \
  -H "X-HMAC-Signature: $SIG" \
  -d "$BODY")

RESPONSE=$(cat /tmp/health-monitor-response.json 2>/dev/null || echo "{}")
rm -f /tmp/health-monitor-response.json

if [[ "$HTTP_CODE" =~ ^2[0-9][0-9]$ ]]; then
  echo "[$(date -u +%FT%TZ)] OK ($HTTP_CODE): $RESPONSE"
  exit 0
else
  echo "[$(date -u +%FT%TZ)] FAIL ($HTTP_CODE): $RESPONSE" >&2
  exit 1
fi
