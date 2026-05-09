#!/usr/bin/env bash
# ============================================================================
# audit-n8n-workflows.sh
# ----------------------------------------------------------------------------
# Auditoría preventiva de workflows n8n: detecta anti-patrones que han causado
# bugs silenciosos en producción. Pensado para ejecutarse a demanda y/o como
# parte de un cron diario.
#
# Detecta:
#   1. Expresiones `{{...}}` en campos string que NO empiezan con `=`
#      → n8n las trata como literal. Bug: la string sale verbatim al HTTP/email
#      → Caso real (9/05/2026): Healthcheck "Obtener Stats 24h" + Recovery
#                                "Reenviar a administracion@" message field.
#
#   2. `neverError: true` en nodos críticos de workflows monitor / healthcheck
#      → Silencia HTTP 401/403/500 → falsos positivos.
#      → Caso real (8/05/2026): Healthcheck reportó OK durante días con 401.
#
#   3. Hardcoded secrets en nodos HTTP (API keys, Bearer tokens, sb_secret)
#      → Riesgo seguridad + se pierden al rotar la key.
#      → Caso real (8/05/2026): 5 hits en workflows varios.
#
# Uso:
#   ./scripts/audit-n8n-workflows.sh           # informe completo (exit 1 si hay hits)
#   ./scripts/audit-n8n-workflows.sh --json    # output JSON
#   N8N_URL=... N8N_API_KEY=... ./scripts/audit-n8n-workflows.sh
#
# Lee N8N_API_KEY de:
#   - Env var $N8N_API_KEY
#   - O ~/.mcp.json (campo .mcpServers.n8n.env.N8N_API_KEY)
#
# Exit codes:
#   0 = sin hits (sistema limpio)
#   1 = al menos un hit detectado
#   2 = error setup (no jq/curl/key)
# ============================================================================

set -euo pipefail

N8N_URL="${N8N_URL:-https://n8n.cathedralgroup.es}"
JSON_OUTPUT=0
[ "${1:-}" = "--json" ] && JSON_OUTPUT=1

# --- Setup checks ----------------------------------------------------------
for cmd in jq curl; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "ERROR: $cmd no instalado" >&2; exit 2; }
done

if [ -z "${N8N_API_KEY:-}" ]; then
  if [ -f ~/.mcp.json ]; then
    N8N_API_KEY=$(jq -r '.mcpServers.n8n.env.N8N_API_KEY // empty' ~/.mcp.json)
  fi
fi

if [ -z "${N8N_API_KEY:-}" ]; then
  echo "ERROR: N8N_API_KEY no configurada. Pasa env var o configura en ~/.mcp.json" >&2
  exit 2
fi

WORK_DIR=$(mktemp -d -t n8n_audit_XXXXXX)
trap 'rm -rf "$WORK_DIR"' EXIT

# --- Descargar workflows ---------------------------------------------------
[ "$JSON_OUTPUT" -eq 0 ] && echo "── Descargando workflows desde $N8N_URL ──"

curl -sS --fail -H "X-N8N-API-KEY: $N8N_API_KEY" \
  "$N8N_URL/api/v1/workflows?limit=100" > "$WORK_DIR/list.json" || {
  echo "ERROR: no se pudo listar workflows (auth?)" >&2
  exit 2
}

WORKFLOW_IDS=$(jq -r '.data[].id' "$WORK_DIR/list.json")
WORKFLOW_COUNT=$(echo "$WORKFLOW_IDS" | wc -l | tr -d ' ')

[ "$JSON_OUTPUT" -eq 0 ] && echo "  $WORKFLOW_COUNT workflows encontrados"

for ID in $WORKFLOW_IDS; do
  curl -sS --fail -H "X-N8N-API-KEY: $N8N_API_KEY" \
    "$N8N_URL/api/v1/workflows/$ID" > "$WORK_DIR/$ID.json"
done

# --- Detectores -----------------------------------------------------------
HITS_FILE="$WORK_DIR/hits.jsonl"
> "$HITS_FILE"

# Detector 1: expresiones sin '=' en strings (excluyendo Code/Function nodes)
for f in "$WORK_DIR"/*.json; do
  [ "$(basename "$f")" = "list.json" ] || [ "$(basename "$f")" = "hits.jsonl" ] || \
  jq -c --arg wf_id "$(basename "$f" .json)" '
    .name as $wf_name |
    .nodes[] |
    select(.type | test("(code|function)$") | not) as $n |
    [paths(strings)] as $paths |
    $paths[] as $p |
    ($n | getpath($p)) as $v |
    select($v | type == "string") |
    select($v | test("\\{\\{")) |
    select($v | startswith("=") | not) |
    {
      detector: "expression_without_equals",
      severity: "high",
      workflow_id: $wf_id,
      workflow_name: $wf_name,
      node_name: $n.name,
      node_type: ($n.type | sub("n8n-nodes-base.";"")),
      field_path: ($p | join(".")),
      value_preview: ($v | .[0:200])
    }
  ' "$f" 2>/dev/null >> "$HITS_FILE" || true
done

# Detector 2: neverError:true en contextos donde silencia bugs reales
#
# La regla (feedback_n8n_arquitectura.md): neverError SOLO es válido en lookups
# opcionales / llamadas a IAs con fallback. PROHIBIDO en:
#   a) Workflows cuyo PROPÓSITO es detectar fallos (healthcheck/monitor/alert)
#   b) Nodos críticos que escriben datos (INSERT/UPDATE/DELETE en tablas core)
#
# Criterio de match:
#   - Nombre workflow contiene healthcheck|monitor|alert|watchdog (caso-insensitive)
#   - O nombre nodo contiene insert|update|delete|patch (caso-insensitive)
#   - Excluir nodos defensivos por nombre (placeholder|log|registrar|limpiar|marcar)
for f in "$WORK_DIR"/*.json; do
  [ "$(basename "$f")" = "list.json" ] || [ "$(basename "$f")" = "hits.jsonl" ] || \
  jq -c --arg wf_id "$(basename "$f" .json)" '
    .name as $wf_name |
    .nodes[] |
    select(.type == "n8n-nodes-base.httpRequest") |
    select(.parameters.options.response.response.neverError == true) |
    .name as $node_name |
    select(
      ($wf_name | test("(healthcheck|monitor|alert|watchdog)"; "i"))
      or
      (
        ($node_name | test("(insert|update|delete|patch)"; "i"))
        and
        ($node_name | test("(placeholder|log|registrar|limpiar|marcar)"; "i") | not)
      )
    ) |
    {
      detector: "neverError_in_critical_context",
      severity: "high",
      workflow_id: $wf_id,
      workflow_name: $wf_name,
      node_name: $node_name,
      node_type: "httpRequest",
      field_path: "parameters.options.response.response.neverError",
      value_preview: "true",
      reason: (
        if ($wf_name | test("(healthcheck|monitor|alert|watchdog)"; "i"))
        then "workflow tipo monitor — neverError silencia bugs detectables"
        else "nodo INSERT/UPDATE/DELETE/PATCH crítico — silencia errores reales de escritura"
        end
      )
    }
  ' "$f" 2>/dev/null >> "$HITS_FILE" || true
done

# Detector 3: hardcoded secrets (sb_secret_, sk-, AIzaSy, sQP*, Bearer eyJ, AQ.Ab)
for f in "$WORK_DIR"/*.json; do
  [ "$(basename "$f")" = "list.json" ] || [ "$(basename "$f")" = "hits.jsonl" ] || \
  jq -c --arg wf_id "$(basename "$f" .json)" '
    def patterns: [
      "sb_secret_[A-Za-z0-9_-]{20,}",
      "sk-[A-Za-z0-9_-]{20,}",
      "AIzaSy[A-Za-z0-9_-]{30,}",
      "AQ\\.Ab[A-Za-z0-9_.-]{20,}",
      "Bearer eyJ[A-Za-z0-9_.-]{50,}"
    ];
    .name as $wf_name |
    .nodes[] as $n |
    [paths(strings)] as $paths |
    $paths[] as $p |
    ($n | getpath($p)) as $v |
    select($v | type == "string") |
    patterns[] as $pat |
    select($v | test($pat)) |
    {
      detector: "hardcoded_secret",
      severity: "critical",
      workflow_id: $wf_id,
      workflow_name: $wf_name,
      node_name: $n.name,
      node_type: ($n.type | sub("n8n-nodes-base.";"")),
      field_path: ($p | join(".")),
      pattern_matched: $pat,
      value_preview: ($v | .[0:60] + "...")
    }
  ' "$f" 2>/dev/null >> "$HITS_FILE" || true
done

# --- Reporte --------------------------------------------------------------
HITS_COUNT=$(wc -l < "$HITS_FILE" | tr -d ' ')

if [ "$JSON_OUTPUT" -eq 1 ]; then
  jq -s '{ total: length, hits: . }' "$HITS_FILE"
  [ "$HITS_COUNT" -gt 0 ] && exit 1 || exit 0
fi

echo ""
echo "── Resultado ──"
if [ "$HITS_COUNT" -eq 0 ]; then
  echo "✅ Sistema limpio: 0 hits en $WORKFLOW_COUNT workflows"
  echo "   Detectores ejecutados: expression_without_equals, neverError_true_in_http, hardcoded_secret"
  exit 0
fi

echo "❌ $HITS_COUNT hits detectados:"
echo ""

for severity in critical high medium; do
  COUNT=$(jq -s --arg s "$severity" 'map(select(.severity==$s)) | length' "$HITS_FILE")
  [ "$COUNT" = "0" ] && continue
  echo "── Severity: $severity ($COUNT) ──"
  jq -s --arg s "$severity" -r '
    map(select(.severity==$s)) | .[] |
    "  [\(.detector)]\n    workflow: \(.workflow_name) (\(.workflow_id))\n    nodo: \(.node_name) (\(.node_type))\n    campo: \(.field_path)\n    preview: \(.value_preview)\n"
  ' "$HITS_FILE"
done

echo "Para output JSON: $0 --json"
exit 1
