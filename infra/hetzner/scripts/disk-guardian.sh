#!/usr/bin/env bash
# Disk Guardian Cathedral — Hetzner
# Cron */15. Detect disk usage / progressive cleanup + notify admin panel.
set -uo pipefail

[ -f /opt/cathedral/scripts/.env.disk-guardian ] && set -a && source /opt/cathedral/scripts/.env.disk-guardian && set +a
[ -f /opt/cathedral/scripts/.env-health ] && set -a && source /opt/cathedral/scripts/.env-health && set +a
source /opt/cathedral/scripts/dispatch_agent.sh 2>/dev/null || true


# DRY_RUN mode: si DGUARD_DRY_RUN=1 entonces NO borra archivos NI llama docker, solo notifica + loguea
DGUARD_DRY_RUN=${DGUARD_DRY_RUN:-0}
maybe_find() { [ "$DGUARD_DRY_RUN" = 1 ] && { echo "(dry-run) find $*"; return; }; find "$@"; }
maybe_docker() { [ "$DGUARD_DRY_RUN" = 1 ] && { echo "(dry-run) docker $*"; return; }; docker "$@"; }

LOG=/var/log/cathedral/disk-guardian.log
HEARTBEAT=/var/log/cathedral/disk-guardian.heartbeat
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
USED=${DGUARD_TEST_USED:-$(df / --output=pcent | tail -1 | tr -d ' %')}
AVAIL=${DGUARD_TEST_AVAIL:-$(df / -h --output=avail | tail -1 | tr -d ' ')}

log() { echo "[$TS] $*" >> "$LOG"; }
heartbeat() { echo "$TS|${USED}|${AVAIL}" > "$HEARTBEAT"; }

heartbeat_post() {
  [ -z "${SUPABASE_URL:-}" ] && return
  [ -z "${SUPABASE_SECRET_KEY:-}" ] && return
  local level="${1:-silent}"
  curl -fsS -m 8 -X POST \
    -H "apikey: ${SUPABASE_SECRET_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SECRET_KEY}" \
    -H 'Content-Type: application/json' \
    -H 'Prefer: return=minimal' \
    -d "$(printf '{"host":"%s","used_pct":%d,"avail":"%s","level":"%s","metadata":{"ts":"%s"}}' \
      "$(hostname)" "$USED" "$AVAIL" "$level" "$TS")" \
    "${SUPABASE_URL}/rest/v1/disk_heartbeats" >>"$LOG" 2>&1 || log "heartbeat_post failed"
}



dispatch_disk_agent() {
  local sev="$1" used_pct="$2"
  local hour_key=$(date -u +%Y-%m-%d-%H)
  local agent_severity="medium"
  [ "$sev" = "critical" ] && agent_severity="critical"
  if command -v dispatch_agent >/dev/null 2>&1; then
    local payload
    payload=$(jq -nc --argjson up "$used_pct" --arg av "$AVAIL" --arg ho "$(hostname)" '{used_pct:$up,avail:$av,host:$ho}' 2>/dev/null || echo "{}")
    dispatch_agent "health_monitor" "disk_breach" "$agent_severity" "$payload" "disk_${sev}_${hour_key}"
  fi
}

notify() {
  local sev="$1" title="$2" msg="$3"
  [ -z "${AUDIT_CRON_SECRET:-}" ] && return
  [ -z "${NOTIFY_URL:-}" ] && return
  local dedup_key="disk-guardian-$(date +%Y-%m-%d)-${sev}"
  curl -fsS -m 8 -X POST \
    -H "Authorization: Bearer ${AUDIT_CRON_SECRET}" \
    -H 'Content-Type: application/json' \
    -d "$(printf '{"severity":"%s","title":"%s","message":"%s","source":"disk-guardian","dedup_key":"%s","metadata":{"used_pct":%d,"avail":"%s","host":"%s"}}' \
      "$sev" "$title" "$msg" "$dedup_key" "$USED" "$AVAIL" "$(hostname)")" \
    "$NOTIFY_URL" >>"$LOG" 2>&1 || log "notify failed (sev=$sev)"
}

heartbeat
log "check: used=${USED}% avail=${AVAIL}"

if [ "$USED" -lt 70 ]; then heartbeat_post silent; exit 0; fi

# 70-79 WARNING
if [ "$USED" -lt 80 ]; then
  log "WARNING ${USED}% — sweep /tmp >7d"
  maybe_find /tmp -maxdepth 2 -type f -mtime +7 -delete -print 2>>"$LOG" | head -20 >> "$LOG"
  notify warning "Disco Hetzner: ${USED}% used (avail ${AVAIL})" "Soft sweep /tmp >7d ejecutado."
  dispatch_disk_agent warning "$USED"
  heartbeat_post warning
  exit 0
fi

# 80-89 HIGH
if [ "$USED" -lt 90 ]; then
  log "HIGH ${USED}% — sweep /tmp >3d + n8n snapshots"
  maybe_find /tmp -maxdepth 2 -type f -mtime +3 -delete -print 2>>"$LOG" | head -30 >> "$LOG"
  maybe_find /tmp -maxdepth 1 -type f -name 'n8n-db-pre-*.sqlite' -mtime +1 -delete -print 2>>"$LOG" >> "$LOG"
  maybe_find /tmp/n8n-backup -maxdepth 2 -type f -name '*.tar.gz*' -mtime +1 -delete -print 2>>"$LOG" 2>/dev/null >> "$LOG"
  notify warning "Disco Hetzner: ${USED}% used (HIGH)" "Sweep /tmp >3d + n8n snapshots >1d aplicado."
  dispatch_disk_agent warning "$USED"
  heartbeat_post high
  exit 0
fi

# 90-94 CRITICAL
if [ "$USED" -lt 95 ]; then
  log "CRITICAL ${USED}% — aggressive sweep"
  maybe_find /tmp -maxdepth 3 -type f -mtime +1 -delete -print 2>>"$LOG" | head -50 >> "$LOG"
  maybe_find /opt/cathedral/backups -maxdepth 1 -type f -mtime +3 -delete -print 2>>"$LOG" 2>/dev/null >> "$LOG"
  maybe_docker exec n8n sh -c 'find /home/node/.n8n/storage -type d -name "executions" -exec sh -c "
    cd \$1
    for d in */; do
      mtime=\$(stat -c %Y \$d 2>/dev/null)
      now=\$(date +%s)
      [ \$((now-mtime)) -gt 43200 ] && rm -rf \$d
    done" _ {} \;' 2>>"$LOG"
  notify critical "Disco Hetzner: ${USED}% used (CRITICAL)" "Sweep agresivo aplicado. Revisa storage n8n manualmente si sigue subiendo."
  dispatch_disk_agent critical "$USED"
  heartbeat_post critical
  exit 0
fi

# >=95 EMERGENCY
log "EMERGENCY ${USED}% — full sweep"
maybe_find /tmp -maxdepth 3 -type f -delete 2>>"$LOG"
maybe_docker exec n8n sh -c '
  maybe_find /home/node/.n8n/storage -type d -name "executions" -empty -delete 2>/dev/null
  for d in /home/node/.n8n/storage/workflows/*/executions/*/; do
    mtime=$(stat -c %Y $d 2>/dev/null)
    now=$(date +%s)
    [ $((now-mtime)) -gt 3600 ] && rm -rf $d
  done' 2>>"$LOG"
notify critical "Disco Hetzner: ${USED}% used (EMERGENCY)" "Full sweep ejecutado. Sistema en riesgo crítico — investigar urgente."
  dispatch_disk_agent critical "$USED"
heartbeat_post emergency
