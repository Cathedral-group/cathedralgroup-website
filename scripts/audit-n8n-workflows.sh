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
#   - Excluir nodos defensivos por nombre:
#     - placeholder|log|registrar|limpiar|marcar — defensivos clásicos
#     - mark|dispatch — bookkeeping queue (Op 2 agentes IA, sesión 17-19/05)
#     - state|drive url — actualizaciones cosméticas idempotentes
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
        ($node_name | test("(placeholder|log|registrar|limpiar|marcar|mark|dispatch|state|drive url)"; "i") | not)
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

# Detector 4: HTTP nodes que pueden cortar el flujo silenciosamente
#
# La regla: cuando un HTTP request devuelve 0 items, n8n NO ejecuta el siguiente
# nodo a menos que el HTTP tenga `alwaysOutputData: true`. Esto causa que ramas
# enteras del workflow se corten cuando una query Supabase legítimamente devuelve
# vacío (no hay duplicados, no hay match, etc.).
#
# Caso real (9/05/2026): la cascada multi-provider Gemini→GPT-4o nunca había
# llegado al INSERT en producción porque DOS nodos HTTP (Check Anti-Bucle GPT
# y Buscar Fuzzy Match) cortaban el flujo cuando devolvían 0 items.
#
# Heurística: HTTP node con método GET y URL parametrizada con expresión n8n
# (={{...}}) que NO tenga alwaysOutputData=true. Excluir INSERT/UPDATE/DELETE
# (esos no se cortan por 0 results).
for f in "$WORK_DIR"/*.json; do
  [ "$(basename "$f")" = "list.json" ] || [ "$(basename "$f")" = "hits.jsonl" ] || \
  jq -c --arg wf_id "$(basename "$f" .json)" '
    .name as $wf_name |
    .nodes[] |
    select(.type == "n8n-nodes-base.httpRequest") |
    select((.parameters.method // "GET") == "GET") |
    select((.parameters.url // "") | startswith("=")) |
    select(.alwaysOutputData != true) |
    {
      detector: "http_get_without_alwaysOutputData",
      severity: "medium",
      workflow_id: $wf_id,
      workflow_name: $wf_name,
      node_name: .name,
      node_type: "httpRequest",
      field_path: "alwaysOutputData",
      value_preview: ((.alwaysOutputData // "null") | tostring),
      reason: "GET con URL dinámica sin alwaysOutputData — corta el flujo silenciosamente al devolver 0 items"
    }
  ' "$f" 2>/dev/null >> "$HITS_FILE" || true
done

# Detector 5: HTTP nodes con predefinedCredentialType pero sin nodeCredentialType
#
# Cuando se usa authentication=predefinedCredentialType, n8n requiere también
# nodeCredentialType para identificar el tipo (openAiApi, anthropicApi, etc.).
# Sin él, el nodo falla en runtime con "Cannot read properties of undefined (reading 'status')".
#
# Caso real (9/05/2026): mi PUT atómico al General omitió nodeCredentialType
# en Llamar GPT-4o Visión → toda invocación al fallback fallaba antes de pegarse
# a OpenAI.
for f in "$WORK_DIR"/*.json; do
  [ "$(basename "$f")" = "list.json" ] || [ "$(basename "$f")" = "hits.jsonl" ] || \
  jq -c --arg wf_id "$(basename "$f" .json)" '
    .name as $wf_name |
    .nodes[] |
    select(.type == "n8n-nodes-base.httpRequest") |
    select(.parameters.authentication == "predefinedCredentialType") |
    select((.parameters.nodeCredentialType // null) == null) |
    {
      detector: "predefinedCredentialType_without_nodeCredentialType",
      severity: "high",
      workflow_id: $wf_id,
      workflow_name: $wf_name,
      node_name: .name,
      node_type: "httpRequest",
      field_path: "parameters.nodeCredentialType",
      value_preview: "missing",
      reason: "predefinedCredentialType requiere nodeCredentialType — el nodo falla en runtime sin él"
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
    .nodes[] | . as $n |
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

# ============================================================================
# Detectores ANTI-CRUCE / anti-recaida (sesion 07-08/06/2026)
# ----------------------------------------------------------------------------
# Sembrados desde 132 casos historicos (memoria) + auditoria en vivo + research
# experto (docs n8n, codigo fuente n8n extension-expression.ts, foros). Cada uno
# nacio de un bug REAL en produccion. Cuaderno completo: memory/vigilante_casos.md
#   Para anadir una regla nueva: copiar un bloque, cambiar el patron `test(...)`
#   y el nombre `detector`, anadir su caso aqui, y baseline en la allowlist.
#
#   all_index_in_expression  (CRITICO) - `.all()[idx]` en campo ={{}} rompe el
#     preprocesador de expresiones de n8n (ExpressionExtensionError "invalid
#     syntax"). Caso: cruce factura<->archivo Drive, reaparecio 6x en 4 semanas.
#   template_literal_in_expression (high) - `${...}` en ={{}}, misma familia.
#     Caso: Marcar Review Forensic (06/06).
#   incomplete_optional_chain (high) - `?.campo[` optional-chain seguido de
#     indice NO protegido -> TypeError. Caso: Parsear Gemini Fallback (09/05).
#   deprecated_node_access (high) - `$node[...]` sintaxis n8n 1.x rota en 2.x.
#     Caso: Backup Webhook Response OK (30/04).
#   hardcoded_attachment_index (medium) - valor de config `attachment_N` fijo,
#     rompe en multi-adjunto. Caso: Upload file (04/06).
#   return_array_each_item (CRITICO) - Code runOnceForEachItem con `return [`
#     debe devolver UN objeto, no array. Caso: Parsear GPT-4o Vision (26/05).
#   fixed_index_binary_buffer (high) - getBinaryDataBuffer(0,..) indice fijo en
#     vez de $itemIndex -> falla en multi-adjunto. Caso: Convertir a Vision (14/05).
#   node_ref_not_found (high) - `$('X')` debe resolver a un nodo existente.
#     Caso: Preparar Supabase referia 'Decidir Tabla Destino' renombrado (21/05).
# ============================================================================

# Leaf-walker: recorre cada string de cada nodo (incluye jsCode para las reglas
# que aplican a codigo). Usa la forma `.nodes[] | . as $n` para que `.` sea el
# nodo (NO el documento) al calcular paths(strings) — bug sutil que tenia roto
# al detector hardcoded_secret. Emite un array de matches y lo explota.
for f in "$WORK_DIR"/*.json; do
  [ "$(basename "$f")" = "list.json" ] || [ "$(basename "$f")" = "hits.jsonl" ] || \
  jq -c --arg wf_id "$(basename "$f" .json)" '
    .name as $wf_name |
    .nodes[] | . as $n |
    [paths(strings)] as $paths |
    $paths[] as $p |
    ($n | getpath($p)) as $v |
    select($v | type == "string") |
    ($p[-1]) as $seg |
    ($v | startswith("=")) as $isexpr |
    [
      (if $isexpr and $seg!="jsCode" and $seg!="functionCode" and ($v|test("\\.all\\(\\)[[:space:]]*\\[")) then {detector:"all_index_in_expression",severity:"critical"} else empty end),
      (if $isexpr and $seg!="jsCode" and $seg!="functionCode" and ($v|test("\\$\\{")) then {detector:"template_literal_in_expression",severity:"high"} else empty end),
      (if ($v|test("\\?\\.[A-Za-z_][A-Za-z0-9_]*\\[")) then {detector:"incomplete_optional_chain",severity:"high"} else empty end),
      (if ($v|test("\\$node\\[")) then {detector:"deprecated_node_access",severity:"high"} else empty end),
      (if $seg!="jsCode" and $seg!="functionCode" and ($v|test("^attachment_[0-9]+$")) then {detector:"hardcoded_attachment_index",severity:"medium"} else empty end)
    ][] |
    . + {
      workflow_id:$wf_id, workflow_name:$wf_name, node_name:$n.name,
      node_type:($n.type|sub("n8n-nodes-base.";"")),
      field_path:($p|join(".")), value_preview:($v|.[0:200])
    }
  ' "$f" 2>/dev/null >> "$HITS_FILE" || true
done

# Detectores sobre el cuerpo de Code nodes (jsCode/functionCode)
for f in "$WORK_DIR"/*.json; do
  [ "$(basename "$f")" = "list.json" ] || [ "$(basename "$f")" = "hits.jsonl" ] || \
  jq -c --arg wf_id "$(basename "$f" .json)" '
    .name as $wf_name |
    .nodes[] | select(.type | test("(code|function)$")) | . as $n |
    ($n.parameters.jsCode // $n.parameters.functionCode // "") as $code |
    [
      (if ($n.parameters.mode // "")=="runOnceForEachItem" and ($code|test("return[[:space:]]*\\[")) then {detector:"return_array_each_item",severity:"critical"} else empty end),
      (if ($code|test("getBinaryDataBuffer\\([[:space:]]*0[^0-9]")) then {detector:"fixed_index_binary_buffer",severity:"high"} else empty end)
    ][] |
    . + {
      workflow_id:$wf_id, workflow_name:$wf_name, node_name:$n.name,
      node_type:($n.type|sub("n8n-nodes-base.";"")),
      field_path:"parameters.jsCode", value_preview:"(ver jsCode del nodo)"
    }
  ' "$f" 2>/dev/null >> "$HITS_FILE" || true
done

# node_ref_not_found: toda referencia $('X')/$("X") debe existir como nodo del wf
for f in "$WORK_DIR"/*.json; do
  bn="$(basename "$f")"
  [ "$bn" = "list.json" ] && continue
  [ "$bn" = "hits.jsonl" ] && continue
  wfid="$(basename "$f" .json)"
  wfname="$(jq -r '.name // ""' "$f" 2>/dev/null || echo "")"
  jq -r '.nodes[].name' "$f" 2>/dev/null | sort -u > "$WORK_DIR/_names.txt" || true
  { grep -oE "\\\$\\('[^']+'\\)" "$f" 2>/dev/null || true; grep -oE "\\\$\\(\"[^\"]+\"\\)" "$f" 2>/dev/null || true; } \
    | sed -E "s/^\\\$\\(['\"]//; s/['\"]\\)\$//" | sort -u > "$WORK_DIR/_refs.txt" || true
  while IFS= read -r ref; do
    [ -z "$ref" ] && continue
    jq -nc --arg wf "$wfid" --arg wfn "$wfname" --arg ref "$ref" \
      '{detector:"node_ref_not_found",severity:"high",workflow_id:$wf,workflow_name:$wfn,node_name:$ref,node_type:"ref",field_path:"node_reference",value_preview:("ref:"+$ref)}' >> "$HITS_FILE"
  done < <(comm -23 "$WORK_DIR/_refs.txt" "$WORK_DIR/_names.txt" 2>/dev/null || true)
done

# --- Allowlist: baseline de hits ACEPTADOS ---------------------------------
# Hits conocidos/aceptados se listan en scripts/audit-n8n-allowlist.txt
# (1 clave por linea: detector|workflow_id|node_name|field_path; '#' = comentario).
# Solo los hits NUEVOS (no en la allowlist) cuentan para el exit code: el cron
# diario deja de fallar/emailar por deuda tecnica ya aceptada, pero SIGUE
# alertando de cualquier patron nuevo (incluidos secretos hardcodeados).
ALLOWLIST_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/audit-n8n-allowlist.txt"
ALLOWLISTED_COUNT=0
if [ -f "$ALLOWLIST_FILE" ]; then
  grep -vE '^[[:space:]]*(#|$)' "$ALLOWLIST_FILE" | sed -E 's/[[:space:]]+$//' | tr -d '\r' > "$WORK_DIR/allow.txt" || true
  NEW_HITS_FILE="$WORK_DIR/new_hits.jsonl"
  > "$NEW_HITS_FILE"
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    KEY=$(printf '%s' "$line" | jq -r '"\(.detector)|\(.workflow_id)|\(.node_name)|\(.field_path)"' 2>/dev/null) \
      || { printf '%s\n' "$line" >> "$NEW_HITS_FILE"; continue; }
    [ -z "$KEY" ] && { printf '%s\n' "$line" >> "$NEW_HITS_FILE"; continue; }
    if grep -Fxq -- "$KEY" "$WORK_DIR/allow.txt"; then
      ALLOWLISTED_COUNT=$((ALLOWLISTED_COUNT+1))
    else
      printf '%s\n' "$line" >> "$NEW_HITS_FILE"
    fi
  done < "$HITS_FILE"
  HITS_FILE="$NEW_HITS_FILE"
fi

# --- Reporte --------------------------------------------------------------
HITS_COUNT=$(wc -l < "$HITS_FILE" | tr -d ' ')

if [ "$JSON_OUTPUT" -eq 1 ]; then
  jq -s --argjson allow "$ALLOWLISTED_COUNT" '{ total: length, allowlisted: $allow, hits: . }' "$HITS_FILE"
  [ "$HITS_COUNT" -gt 0 ] && exit 1 || exit 0
fi

echo ""
echo "── Resultado ──"
[ "${ALLOWLISTED_COUNT:-0}" -gt 0 ] && echo "ℹ️  $ALLOWLISTED_COUNT hit(s) conocido(s) ignorado(s) por allowlist (scripts/audit-n8n-allowlist.txt)"
if [ "$HITS_COUNT" -eq 0 ]; then
  echo "✅ Sistema limpio: 0 hits en $WORKFLOW_COUNT workflows"
  echo "   Detectores: expression_without_equals, neverError_in_critical_context,"
  echo "   http_get_without_alwaysOutputData, predefinedCredentialType_without_nodeCredentialType,"
  echo "   hardcoded_secret, all_index_in_expression, template_literal_in_expression,"
  echo "   incomplete_optional_chain, deprecated_node_access, hardcoded_attachment_index,"
  echo "   return_array_each_item, fixed_index_binary_buffer, node_ref_not_found"
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
