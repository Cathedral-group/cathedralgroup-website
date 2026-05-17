#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Cathedral health-utilities cron Hetzner
#
# Deploy: copiar este script a Hetzner (`/opt/cathedral/scripts/`) + crontab.
# NO ejecutar localmente — diseñado para servidor Hetzner.
#
# Función: cada hora consulta /api/health/utilities. Si status != "ok" tres
# veces consecutivas, alerta a `admin_notifications` table (banner admin)
# vía endpoint webhook Cathedral.
#
# Setup (próxima sesión SSH Hetzner):
#   1. Copiar este script a /opt/cathedral/scripts/cathedral-health-cron.sh
#   2. chmod +x /opt/cathedral/scripts/cathedral-health-cron.sh
#   3. Crear /opt/cathedral/scripts/.env-health con (sin commitear):
#        CATHEDRAL_INTERNAL_TOKEN=<valor real, ver cathedral-credentials.md>
#        SUPABASE_URL=<URL Supabase>
#        SUPABASE_SERVICE_ROLE_KEY=<service role key>
#   4. chmod 600 /opt/cathedral/scripts/.env-health
#   5. crontab -e + añadir:
#        0 * * * * /opt/cathedral/scripts/cathedral-health-cron.sh >> /var/log/cathedral-health.log 2>&1
#
# Estado consecutivos persistido en /var/lib/cathedral/health-state.txt
# (1 número entero, fallos consecutivos hasta ahora).
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# Config
ENV_FILE="/opt/cathedral/scripts/.env-health"
STATE_FILE="/var/lib/cathedral/health-state.txt"
ENDPOINT="https://cathedralgroup-website.vercel.app/api/health/utilities"
ALERT_THRESHOLD=3  # fallos consecutivos antes alertar
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Source env file (no log secrets)
if [ ! -f "$ENV_FILE" ]; then
  echo "[$TIMESTAMP] FATAL: $ENV_FILE not found"
  exit 1
fi
# shellcheck disable=SC1090
source "$ENV_FILE"
source /opt/cathedral/scripts/dispatch_agent.sh 2>/dev/null || true

if [ -z "${CATHEDRAL_INTERNAL_TOKEN:-}" ]; then
  echo "[$TIMESTAMP] FATAL: CATHEDRAL_INTERNAL_TOKEN no set"
  exit 1
fi

# Ensure state dir
mkdir -p "$(dirname "$STATE_FILE")"

# Leer counter actual
CONSECUTIVE_FAILS=0
if [ -f "$STATE_FILE" ]; then
  CONSECUTIVE_FAILS=$(cat "$STATE_FILE" 2>/dev/null || echo 0)
  CONSECUTIVE_FAILS=${CONSECUTIVE_FAILS:-0}
fi

# Call health endpoint
RESPONSE=$(curl -s --max-time 15 \
  -H "Authorization: Bearer ${CATHEDRAL_INTERNAL_TOKEN}" \
  "${ENDPOINT}" || echo '{"status":"network_error"}')

# `|| true` para tolerar grep no-match (response sin campo status, e.g. 401
# {"error":"Unauthorized"}). Sin esto pipefail mata el script antes de llegar
# al increment counter. Bug detectado empíricamente 16/05 noche test alerting.
STATUS=$(echo "$RESPONSE" | grep -oE '"status":"[^"]*"' | head -1 | cut -d'"' -f4 || true)

if [ "$STATUS" = "ok" ]; then
  # Reset counter
  if [ "$CONSECUTIVE_FAILS" -gt 0 ]; then
    echo "[$TIMESTAMP] RECOVERY — status=ok después de $CONSECUTIVE_FAILS fallos"
  fi
  echo "0" > "$STATE_FILE"
  exit 0
fi

# Status no-ok
CONSECUTIVE_FAILS=$((CONSECUTIVE_FAILS + 1))
echo "$CONSECUTIVE_FAILS" > "$STATE_FILE"
echo "[$TIMESTAMP] FAIL #${CONSECUTIVE_FAILS} status=${STATUS} response=$(echo "$RESPONSE" | head -c 200)"

# Alertar admin_notifications cuando alcanza threshold
if [ "$CONSECUTIVE_FAILS" -ge "$ALERT_THRESHOLD" ]; then
  if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
    echo "[$TIMESTAMP] ALERT THRESHOLD reached pero Supabase env vars faltan — no alerta enviada"
    exit 1
  fi

  # INSERT en system_notifications (banner admin Cathedral)
  # Schema: severity, title, message, source, metadata (jsonb), dedup_key
  # NO existe action_url/action_label en schema actual (verificado empíricamente
  # 16/05 noche con information_schema.columns).
  ALERT_TITLE="Cathedral health-utilities degraded"
  ALERT_MESSAGE="Endpoint /api/health/utilities devolvió status='${STATUS}' por ${CONSECUTIVE_FAILS} consultas consecutivas (~${CONSECUTIVE_FAILS}h). Verificar Vercel deploy + Supabase + feature_flags."

  curl -s --max-time 10 -X POST \
    "${SUPABASE_URL}/rest/v1/system_notifications" \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=minimal" \
    -d "{
      \"severity\": \"warning\",
      \"title\": \"${ALERT_TITLE}\",
      \"message\": \"${ALERT_MESSAGE}\",
      \"source\": \"hetzner-health-cron\",
      \"dedup_key\": \"health-utilities-degraded\",
      \"metadata\": {\"consecutive_fails\": ${CONSECUTIVE_FAILS}, \"endpoint\": \"/api/health/utilities\"}
    }" > /dev/null || echo "[$TIMESTAMP] WARN: no se pudo enviar alerta a system_notifications"


  # Op 2 dispatch agente IA diagnose
  HOUR_KEY=$(date -u +%Y-%m-%d-%H)
  AGENT_SEV="medium"
  [ "$STATUS" = "critical" ] && AGENT_SEV="critical"
  if command -v dispatch_agent >/dev/null 2>&1; then
    HEALTH_PAYLOAD=$(jq -nc --arg st "$STATUS" --argjson cf "$CONSECUTIVE_FAILS" --arg ep "$ENDPOINT" '{status:$st,consecutive_fails:$cf,endpoint:$ep}' 2>/dev/null || echo "{}")
    dispatch_agent "health_monitor" "health_utilities_${STATUS}" "$AGENT_SEV" "$HEALTH_PAYLOAD" "health_${STATUS}_${HOUR_KEY}"
  fi

  echo "[$TIMESTAMP] ALERT sent — threshold ${ALERT_THRESHOLD} alcanzado"
fi

exit 1
