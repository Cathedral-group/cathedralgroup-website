#!/bin/bash
# ============================================
# Cathedral hook PreToolUse — bloquea PUT n8n API
# Regla SUPREMA: feedback_n8n_no_put_api.md
# ============================================
# n8n /api/v1/workflows PUT con triggers polling activos = workflow corruption
# Cambios SIEMPRE via /rest/ con cookie session + 4 pasos draft/active
# (n8n-deploy.sh)
#
# Configurado en .claude/settings.json:
# hooks.PreToolUse[].command -> .claude/hooks/block-n8n-put.sh
# matcher: "Bash"
#
# Sesión 18/05/2026 — S1.4 doc-validator-validated.
# ============================================

set -euo pipefail

# Leer JSON input desde stdin (Claude Code envía tool_input)
input=$(cat)

# Extract bash command field
cmd=$(echo "$input" | jq -r '.tool_input.command // ""' 2>/dev/null)

# Patrones bloqueados (PUT a workflows producción)
if echo "$cmd" | grep -qiE 'curl[^|]*-X[[:space:]]+PUT[^|]*/api/v1/workflows'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "🚨 REGLA SUPREMA — PUT a n8n /api/v1/workflows prohibido. Usa /rest/ con cookie session + 4 pasos canónicos draft/active (infra/n8n/scripts/n8n-deploy.sh). Refs: feedback_n8n_no_put_api.md + feedback_n8n_draft_active.md."
    }
  }'
  exit 0
fi

# Bloqueo adicional: PATCH a workflow producción sin verificar POST /activate posterior
# (heurístico: si hay PATCH /rest/workflows sin POST /activate en mismo comando)
if echo "$cmd" | grep -qE 'curl[^|]*-X[[:space:]]+PATCH[^|]*/rest/workflows/' && \
   ! echo "$cmd" | grep -qE '/activate'; then
  # Solo warning (no deny) — David decide
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: "⚠️ PATCH a n8n workflow detected SIN POST /activate después. Recordatorio: regla SUPREMA draft/active requiere POST /rest/workflows/{id}/activate con {versionId} tras PATCH. Si vas a aplicar manualmente después, OK aprobar. Si script automatizado: usa infra/n8n/scripts/n8n-deploy.sh que hace los 4 pasos."
    }
  }'
  exit 0
fi

# No match → exit 0 sin output (allow)
exit 0
