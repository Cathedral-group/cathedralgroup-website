#!/bin/bash
# Cathedral cron: barrido diario rows ai_confidence<0.5 → POST webhook Reprocesador.
# Deploy: /opt/cathedral/scripts/reprocess-low-confidence.sh + crontab CRON_TZ=Europe/Madrid 0 6 * * *
# Env file: /etc/cathedral/reprocesador-cron.env (chmod 600)

set -euo pipefail

SCRIPT_NAME="reprocess-low-confidence"
LOG_FILE="/var/log/cathedral/reprocess-cron.log"

TIMESTAMP() { date -Iseconds; }
log() { echo "$(TIMESTAMP) [$SCRIPT_NAME] $*" | tee -a "$LOG_FILE"; }

# shellcheck source=/dev/null
. /etc/cathedral/reprocesador-cron.env

log "START - querying Supabase for low-confidence candidates"

CANDIDATES=$(curl -sf \
  -H "apikey: ${SUPABASE_SECRET_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SECRET_KEY}" \
  "${SUPABASE_URL}/rest/v1/invoices?select=id,ai_confidence,reprocess_attempts\
&ai_confidence=lt.0.5\
&reprocess_attempts=lt.3\
&manually_edited=is.false\
&deleted_at=is.null\
&drive_file_id=not.is.null\
&review_status=in.(pendiente,error,rechazado)\
&limit=50\
&order=ai_confidence.asc") || {
  log "ERROR: Supabase query failed (curl exit $?)"
  exit 1
}

COUNT=$(echo "$CANDIDATES" | jq 'length')
log "Found ${COUNT} candidates"

if [ "$COUNT" -eq 0 ]; then
  log "No candidates. Exiting clean."
  exit 0
fi

mapfile -t IDS < <(echo "$CANDIDATES" | jq -r '.[].id')

OK_COUNT=0
SKIP_COUNT=0
FAIL_COUNT=0

for ID in "${IDS[@]}"; do
  log "Reprocessing ${ID}"

  PAYLOAD=$(jq -n \
    --arg id "$ID" \
    --arg source "cron_daily" \
    '{target_invoice_id: $id, trigger_source: $source}')

  RESP=$(curl -sf -X POST "${REPROCESADOR_WEBHOOK_URL}" \
    -H "Authorization: Bearer ${CATHEDRAL_INTERNAL_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" \
    --max-time 90) || {
    log "  WARN: webhook POST failed for ${ID} (curl exit $?)"
    FAIL_COUNT=$((FAIL_COUNT+1))
    sleep 5
    continue
  }

  SKIPPED=$(echo "$RESP" | jq -r '.skipped // false' 2>/dev/null || echo "false")
  if [ "$SKIPPED" = "true" ]; then
    REASON=$(echo "$RESP" | jq -r '.reason // "unknown"')
    log "  SKIP ${ID}: ${REASON}"
    SKIP_COUNT=$((SKIP_COUNT+1))
  else
    CONF=$(echo "$RESP" | jq -r '.new_confidence // "?"')
    ATT=$(echo "$RESP" | jq -r '.reprocess_attempts // "?"')
    log "  OK ${ID}: attempt=${ATT} conf=${CONF}"
    OK_COUNT=$((OK_COUNT+1))
  fi

  sleep 5
done

log "END - total=${#IDS[@]} ok=${OK_COUNT} skipped=${SKIP_COUNT} failed=${FAIL_COUNT}"
