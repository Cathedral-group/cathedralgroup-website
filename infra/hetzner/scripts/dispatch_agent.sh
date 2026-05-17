#!/bin/bash
# Cathedral Op 2 — helper bash insert agent_dispatch_queue (event-driven agent dispatch)
# Source este script en watchdogs: source /opt/cathedral/scripts/dispatch_agent.sh
# Usage: dispatch_agent <agent_name> <event_type> <severity> <payload_json> <dedup_key>
# Validado doc-validator 17/05/2026

dispatch_agent() {
  local agent_name="${1:-}"
  local event_type="${2:-}"
  local severity="${3:-}"
  local payload_json="${4:-}"
  [ -z "$payload_json" ] && payload_json="{}"
  local dedup_key="${5:-}"

  if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo "[dispatch_agent] FATAL: SUPABASE env missing" >&2
    return 1
  fi
  command -v jq >/dev/null 2>&1 || { echo "[dispatch_agent] jq missing" >&2; return 1; }

  local body
  body=$(jq -nc \
    --arg an "$agent_name" --arg et "$event_type" \
    --arg sv "$severity" --arg dk "$dedup_key" \
    --argjson pl "$payload_json" \
    "{agent_name:\$an,event_type:\$et,severity:\$sv,trigger_payload:\$pl,dedup_key:\$dk}")

  local http_status
  http_status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 -X POST \
    "${SUPABASE_URL}/rest/v1/agent_dispatch_queue?on_conflict=dedup_key" \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=minimal" \
    -H "Prefer: resolution=ignore-duplicates" \
    -d "$body")

  if [ "$http_status" != "201" ] && [ "$http_status" != "200" ]; then
    echo "[dispatch_agent] WARN: HTTP ${http_status} dedup_key=${dedup_key}" >&2
  fi
  return 0
}
