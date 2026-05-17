#!/bin/bash
# Cathedral pdf2img watchdog Hetzner — sistema pasivo $0 LLM-free + Op 2 dispatch
# Cron */15 (3,18,33,48): chequea pdf2img localhost. >=2 fails:
#   1. INSERT system_notifications (banner admin)
#   2. dispatch_agent helper → agente IA Op 2 diagnose
# Sesión 17/05/2026 refactor Op 2 event-driven.

set -uo pipefail

ENV_FILE="/opt/cathedral/scripts/.env-health"
STATE_FILE="/var/lib/cathedral/pdf2img-state.txt"
THRESHOLD=2
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
HOUR_KEY=$(date -u +"%Y-%m-%d-%H")

[ ! -f "$ENV_FILE" ] && { echo "[$TIMESTAMP] FATAL: $ENV_FILE missing"; exit 1; }
source "$ENV_FILE"
source /opt/cathedral/scripts/dispatch_agent.sh

mkdir -p "$(dirname "$STATE_FILE")"

CONSECUTIVE_FAILS=0
[ -f "$STATE_FILE" ] && CONSECUTIVE_FAILS=$(cat "$STATE_FILE" 2>/dev/null || echo 0)
CONSECUTIVE_FAILS=${CONSECUTIVE_FAILS:-0}

HTTP_CODE=$(curl -sS --max-time 5 -o /dev/null -w "%{http_code}" http://172.17.0.1:5001/health 2>&1 || echo "000")

if [ "$HTTP_CODE" = "200" ]; then
  if [ "$CONSECUTIVE_FAILS" -gt 0 ]; then
    echo "[$TIMESTAMP] RECOVERY pdf2img — status 200 tras $CONSECUTIVE_FAILS fails"
  fi
  echo "0" > "$STATE_FILE"
  exit 0
fi

CONSECUTIVE_FAILS=$((CONSECUTIVE_FAILS + 1))
echo "$CONSECUTIVE_FAILS" > "$STATE_FILE"
echo "[$TIMESTAMP] FAIL #${CONSECUTIVE_FAILS} pdf2img http_code=${HTTP_CODE}"

if [ "$CONSECUTIVE_FAILS" -ge "$THRESHOLD" ]; then
  [ -z "${SUPABASE_URL:-}" ] && exit 1
  [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ] && exit 1

  # 1) Banner admin (siempre)
  curl -s --max-time 10 -X POST \
    "${SUPABASE_URL}/rest/v1/system_notifications" \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=minimal" \
    -d "{
      \"severity\": \"critical\",
      \"title\": \"pdf2img Hetzner DOWN\",
      \"message\": \"Container pdf2img 172.17.0.1:5001 no responde HTTP 200 (got ${HTTP_CODE}) durante ${CONSECUTIVE_FAILS} checks consecutivos. Verificar UFW docker0 rule + docker ps pdf2img.\",
      \"source\": \"hetzner-pdf2img-watchdog\",
      \"dedup_key\": \"pdf2img-down-${HOUR_KEY}\",
      \"metadata\": {\"consecutive_fails\": ${CONSECUTIVE_FAILS}, \"http_code\": \"${HTTP_CODE}\", \"checked_at\": \"${TIMESTAMP}\"}
    }" > /dev/null

  # 2) Op 2 dispatch agente IA diagnose
  dispatch_agent "health_monitor" "pdf2img_down" "critical" \
    "$(jq -nc --arg hc "$HTTP_CODE" --argjson cf "$CONSECUTIVE_FAILS" "{http_code:\$hc,consecutive_fails:\$cf,service:\"pdf2img\",endpoint:\"http://172.17.0.1:5001/health\"}")" \
    "pdf2img_down_${HOUR_KEY}"

  echo "[$TIMESTAMP] ALERT sent + agent dispatched — pdf2img threshold reached"
fi

exit 1
