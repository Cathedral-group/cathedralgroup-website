#!/usr/bin/env bash
# ============================================================================
# audit-code.sh  —  El "vigilante de codigo" del repo (hermano de audit-n8n)
# ----------------------------------------------------------------------------
# Auditoria preventiva ESTATICA del repositorio (SQL de migraciones + TS/TSX).
# Mismo espiritu que scripts/audit-n8n-workflows.sh pero sin tocar nada en vivo:
# solo lee ficheros del repo con ripgrep. Cada detector nacio de un bug/fuga
# REAL ya documentado en memoria (MEMORY.md). Pensado para correr como gate de
# CI (push a main + pull_request) y a demanda.
#
# Por que existe
#   El audit-n8n vigila los workflows en produccion. Pero los bugs/fugas mas
#   graves de las ultimas semanas estaban en el REPO: vistas SECURITY DEFINER
#   que filtraban IVA a anon, RPCs con GRANT a anon, parseo europeo de numeros
#   roto (1.234,56 -> 1234), inserts "fire-and-forget" que tragan errores, etc.
#   Este script los caza ANTES de que lleguen a produccion.
#
# Convenciones (copiadas de audit-n8n-workflows.sh):
#   - JSONL-ish: cada hit es una linea JSON en $HITS_FILE.
#   - Allowlist por clave EXACTA  detector|campo1|campo2  (ver fichero hermano).
#     Para detectores a nivel FICHERO el 3er campo es el literal  FILE.
#   - Solo cuentan los hits NUEVOS (no baselined) para el exit code.
#   - Exit codes:  0 = limpio (o todo allowlisted) · 1 = hay hits nuevos ·
#                  2 = error de setup (falta ripgrep).
#   - Flag --json para salida estructurada.
#
# Comment-exclusion (OBLIGATORIO):
#   El SQL se filtra por  rg -vP '^[^:]*:[0-9]+:\s*--'  para no cazar lineas
#   comentadas (-- ...). El TS por  rg -vP '^[^:]+:[0-9]+:\s*(//|\*)'.
#
# Uso:
#   ./scripts/audit-code.sh            # informe legible (exit 1 si hay hits nuevos)
#   ./scripts/audit-code.sh --json     # salida JSON
#
# NOTA: usa  set -uo pipefail  SIN -e a proposito: ripgrep devuelve 1 cuando NO
# hay match, y eso NO es un error para nosotros.
# ============================================================================

set -uo pipefail

JSON_OUTPUT=0
[ "${1:-}" = "--json" ] && JSON_OUTPUT=1

# --- Setup: requiere ripgrep ----------------------------------------------
if ! command -v rg >/dev/null 2>&1; then
  echo "ERROR: ripgrep (rg) no instalado. Instala con 'brew install ripgrep'" >&2
  echo "       (en CI: sudo apt-get install -y ripgrep)" >&2
  exit 2
fi

# --- cd a la raiz del repo (rutas relativas: app/..., supabase/...) --------
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT" || { echo "ERROR: no se pudo cd a la raiz del repo" >&2; exit 2; }

WORK_DIR="$(mktemp -d -t code_audit_XXXXXX)"
trap 'rm -rf "$WORK_DIR"' EXIT

HITS_FILE="$WORK_DIR/hits.jsonl"
: > "$HITS_FILE"

# Globs de exclusion comunes para los detectores TS.
TS_EXCLUDES=(--glob '!**/node_modules/**' --glob '!**/_legacy/**' --glob '!**/_legacy_html/**' --glob '!**/.next/**')

# emit_hit detector severity file line preview
# Escribe un hit JSON. Para detectores FILE-level pasar  FILE  como $line.
emit_hit() {
  local detector="$1" severity="$2" file="$3" line="$4" preview="$5"
  jq -nc \
    --arg d "$detector" --arg s "$severity" --arg f "$file" \
    --arg l "$line" --arg p "$preview" \
    '{detector:$d, severity:$s, file:$f, line:$l, preview:($p[0:200])}' \
    >> "$HITS_FILE"
}

SQL_GLOB=(supabase/migrations/*.sql)
# Filtro de comentarios SQL: descarta  fichero:NN:   -- ...
sql_decomment() { rg -vP '^[^:]*:[0-9]+:\s*--'; }
# Filtro de comentarios TS: descarta  fichero:NN:   // ...  o  * ...
ts_decomment() { rg -vP '^[^:]+:[0-9]+:\s*(//|\*)'; }

# ===========================================================================
# DETECTORES SQL  (sobre supabase/migrations/*.sql)
# ===========================================================================

# --- sql_grant_execute_anon (critical) -------------------------------------
# GRANT EXECUTE ON FUNCTION ... TO ... anon  -> RPC SECURITY DEFINER invocable
# sin login via /rest/v1/rpc. Caso real: 6 RPCs forenses exponian proveedores/
# importes/presupuestos a cualquiera con la anon key (OWASP A01).
while IFS= read -r m; do
  file="${m%%:*}"; rest="${m#*:}"; ln="${rest%%:*}"; txt="${rest#*:}"
  emit_hit "sql_grant_execute_anon" "critical" "$file" "$ln" "$txt"
done < <(rg -nH -iP 'GRANT\s+EXECUTE\s+ON\s+FUNCTION[^;]*\bTO\b[^;]*\banon\b' "${SQL_GLOB[@]}" 2>/dev/null | sql_decomment)

# --- sql_alter_default_privileges_anon (critical) --------------------------
# ALTER DEFAULT PRIVILEGES re-concede permisos a anon en cada CREATE futuro,
# deshaciendo silenciosamente los REVOKE de seguridad. Caso real: el fix de las
# RPCs forenses se revertia solo por un ALTER DEFAULT PRIVILEGES ... TO anon.
while IFS= read -r m; do
  file="${m%%:*}"; rest="${m#*:}"; ln="${rest%%:*}"; txt="${rest#*:}"
  emit_hit "sql_alter_default_privileges_anon" "critical" "$file" "$ln" "$txt"
done < <(rg -nH -iP 'ALTER\s+DEFAULT\s+PRIVILEGES' "${SQL_GLOB[@]}" 2>/dev/null | sql_decomment)

# --- sql_secdef_no_search_path (medium, FILE-level) ------------------------
# Una funcion SECURITY DEFINER sin  SET search_path  es vulnerable a secuestro
# de search_path (un esquema malicioso puede sombrear funciones/tablas). Regla
# de get_advisors. FILE-level: si el fichero tiene SECURITY DEFINER (no en
# comentario) y NO tiene ningun  SET search_path  -> hit.
while IFS= read -r f; do
  [ -z "$f" ] && continue
  if rg -nP 'SECURITY\s+DEFINER' "$f" 2>/dev/null | rg -qvP '^[0-9]+:\s*--'; then
    if ! rg -qiP 'SET\s+search_path' "$f" 2>/dev/null; then
      emit_hit "sql_secdef_no_search_path" "medium" "$f" "FILE" "SECURITY DEFINER sin SET search_path"
    fi
  fi
done < <(printf '%s\n' "${SQL_GLOB[@]}")

# --- sql_view_dropcreate_no_invoker (high, FILE-level) ---------------------
# Cualquier DROP/CREATE de las vistas vat_quarterly o project_financials DEBE
# re-poner  security_invoker=true , o la vista corre como owner (BYPASSRLS) y,
# con GRANT a anon, filtra datos de TODAS las empresas. Caso real (6ae0e85): la
# vista vat_quarterly se regreso a SECURITY DEFINER y filtraba el IVA via REST.
while IFS= read -r f; do
  [ -z "$f" ] && continue
  if rg -qiP '(CREATE\s+(OR\s+REPLACE\s+)?VIEW|DROP\s+VIEW(\s+IF\s+EXISTS)?)\s+(public\.)?(vat_quarterly|project_financials)\b' "$f" 2>/dev/null; then
    if ! rg -qiP 'security_invoker\s*=\s*true' "$f" 2>/dev/null; then
      emit_hit "sql_view_dropcreate_no_invoker" "high" "$f" "FILE" "DROP/CREATE de vat_quarterly|project_financials sin security_invoker=true"
    fi
  fi
done < <(printf '%s\n' "${SQL_GLOB[@]}")

# --- sql_rls_policy_true_anon (medium) -------------------------------------
# Politica RLS  USING (true)  concedida a anon/authenticated/public = la tabla
# queda abierta a cualquiera (lectura total). Se excluye service_role (USING
# (true) para service_role es el patron correcto de backend).
while IFS= read -r m; do
  file="${m%%:*}"; rest="${m#*:}"; ln="${rest%%:*}"; txt="${rest#*:}"
  emit_hit "sql_rls_policy_true_anon" "medium" "$file" "$ln" "$txt"
done < <(rg -nH -iP 'TO\s+[^;]*\b(anon|authenticated|public)\b[^;]*USING\s*\(\s*true\s*\)|USING\s*\(\s*true\s*\)[^;]*TO\s+[^;]*\b(anon|authenticated|public)\b' "${SQL_GLOB[@]}" 2>/dev/null | rg -vP 'service_role' | sql_decomment)

# --- sql_create_table_no_rls (high, FILE-level) ----------------------------
# CREATE TABLE public.* sin ENABLE ROW LEVEL SECURITY en el mismo fichero = la
# tabla nace sin RLS. Regla de get_advisors (security: rls_disabled_in_public).
# FILE-level: si crea tabla public. (no en comentario) y no hay ENABLE ROW
# LEVEL SECURITY en el fichero -> hit.
while IFS= read -r f; do
  [ -z "$f" ] && continue
  if rg -nP 'CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?public\.' "$f" 2>/dev/null | rg -qvP '^[0-9]+:\s*--'; then
    if ! rg -qiP 'ENABLE\s+ROW\s+LEVEL\s+SECURITY' "$f" 2>/dev/null; then
      emit_hit "sql_create_table_no_rls" "high" "$f" "FILE" "CREATE TABLE public.* sin ENABLE ROW LEVEL SECURITY"
    fi
  fi
done < <(printf '%s\n' "${SQL_GLOB[@]}")

# --- sql_hardcoded_secret (critical) ---------------------------------------
# Secretos pegados en el SQL: service_role key (sb_secret_), API keys (sk-,
# AIzaSy), JWT (eyJ.eyJ.firma) o DSN postgres con password. NOTA: el  \b  antes
# de  sk-  es OBLIGATORIO (si no, casa "disk-...", "task-...", etc.).
SECRET_TARGETS=(supabase/migrations/*.sql)
[ -f supabase/migration_completa.sql ] && SECRET_TARGETS+=(supabase/migration_completa.sql)
while IFS= read -r m; do
  file="${m%%:*}"; rest="${m#*:}"; ln="${rest%%:*}"; txt="${rest#*:}"
  emit_hit "sql_hardcoded_secret" "critical" "$file" "$ln" "${txt:0:60}..."
done < <(rg -nH -P 'sb_secret_[A-Za-z0-9_-]{20,}|\bsk-[A-Za-z0-9]{20,}|AIzaSy[A-Za-z0-9_-]{30,}|eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}|postgres(ql)?://[^@\s]+:[^@\s]+@' "${SECRET_TARGETS[@]}" 2>/dev/null | sql_decomment)

# ===========================================================================
# DETECTORES TS/TSX  (sobre app lib components + next.config.*)
# ===========================================================================

# --- ts_european_number_parse (high) ---------------------------------------
# parseFloat(x.replace(',', '.')) ROMPE numeros europeos: "1.234,56" -> 1.234
# (1000x mal) porque solo cambia la coma, el punto de millar se queda. El parser
# correcto vive en lib/verifier/invoice-math.ts (toNumber), que se EXCLUYE. Caso
# real (526335e): OCR de recibos extraia importes 1000x menores.
while IFS= read -r m; do
  file="${m%%:*}"; rest="${m#*:}"; ln="${rest%%:*}"; txt="${rest#*:}"
  emit_hit "ts_european_number_parse" "high" "$file" "$ln" "$txt"
done < <(rg -nH --glob '*.ts' --glob '*.tsx' --glob '!lib/verifier/invoice-math.ts' "${TS_EXCLUDES[@]}" "parseFloat\([^)]*\.replace\(\s*['\"],\s*['\"]" app lib components 2>/dev/null | ts_decomment)

# --- ts_fire_and_forget_insert (high) --------------------------------------
# void supabase.from(...).insert/update/delete/upsert(...)  = escritura sin
# await ni .then/.catch: si la promesa rechaza, el error se PIERDE (unhandled
# rejection silenciada por void). Caso: logs/registros que nunca se escribian.
while IFS= read -r m; do
  file="${m%%:*}"; rest="${m#*:}"; ln="${rest%%:*}"; txt="${rest#*:}"
  emit_hit "ts_fire_and_forget_insert" "high" "$file" "$ln" "$txt"
done < <(rg -nH --glob '*.ts' --glob '*.tsx' "${TS_EXCLUDES[@]}" "\bvoid\s+[A-Za-z_\$][A-Za-z0-9_\$]*\.from\(.*\.(insert|update|delete|upsert)\(" app lib components 2>/dev/null | ts_decomment)

# --- ts_fetch_no_timeout (medium, FILE-scoped) -----------------------------
# Un fetch() a una API externa (OpenAI/Mistral/Gemini/Anthropic/CF gateway) sin
# AbortSignal/signal puede colgarse para siempre y bloquear el handler. Si el
# fichero referencia uno de esos hosts, tiene fetch( y NO tiene AbortSignal|
# signal: -> hit (clave: detector|file|<primera linea de fetch>).
HOST_RE='api\.openai\.com|api\.mistral\.ai|generativelanguage\.googleapis|api\.anthropic\.com|gateway\.ai\.cloudflare'
while IFS= read -r f; do
  [ -z "$f" ] && continue
  if rg -q 'fetch\(' "$f" 2>/dev/null && ! rg -qP 'AbortSignal|signal:' "$f" 2>/dev/null; then
    fetch_ln="$(rg -nP 'fetch\(' "$f" 2>/dev/null | head -1 | cut -d: -f1)"
    [ -z "$fetch_ln" ] && fetch_ln="FILE"
    emit_hit "ts_fetch_no_timeout" "medium" "$f" "$fetch_ln" "fetch a API externa sin AbortSignal/timeout"
  fi
done < <(rg -l --glob '*.ts' --glob '*.tsx' "${TS_EXCLUDES[@]}" -P "$HOST_RE" app lib components 2>/dev/null)

# --- ts_permissions_policy_disabled (high) ---------------------------------
# Una cabecera Permissions-Policy que deshabilita por completo camera=() o
# geolocation=() rompe funcionalidades del navegador de forma silenciosa. Si el
# next.config tiene Permissions-Policy con camera=() o geolocation=() -> hit.
while IFS= read -r m; do
  file="${m%%:*}"; rest="${m#*:}"; ln="${rest%%:*}"; txt="${rest#*:}"
  emit_hit "ts_permissions_policy_disabled" "high" "$file" "$ln" "$txt"
done < <(rg -nH 'Permissions-Policy' next.config.* 2>/dev/null | rg -P 'camera=\(\)|geolocation=\(\)')

# --- ts_link_to_missing_route (high) ---------------------------------------
# Enlaces (href / router.push / router.replace) a rutas /admin|/portal que NO
# corresponden a ningun app/**/page.tsx -> 404 al hacer clic. Caso real
# (956a1aa): CalendarioView enlazaba a /admin/proyectos/[code] (sin page.tsx).
# El cruce de rutas lo hace python3 (robusto con [seg] -> [^/]+); se omite
# limpio si no hay python3 (se reporta como deferred).
if command -v python3 >/dev/null 2>&1; then
  python3 "$REPO_ROOT/scripts/_audit_routes.py" "$REPO_ROOT" 2>/dev/null >> "$HITS_FILE" || true
  ROUTE_CHECK="on"
else
  ROUTE_CHECK="deferred (python3 no disponible)"
fi

# ===========================================================================
# ALLOWLIST: baseline de hits ACEPTADOS
# ===========================================================================
# scripts/audit-code-allowlist.txt: 1 clave por linea  detector|file|line
# ('#' = comentario; FILE-level usan  FILE  como 3er campo). Solo los hits
# NUEVOS (no listados) cuentan para el exit code: el CI deja de fallar por deuda
# tecnica aceptada pero SIGUE alertando de cualquier patron nuevo.
ALLOWLIST_FILE="$REPO_ROOT/scripts/audit-code-allowlist.txt"
ALLOWLISTED_COUNT=0
if [ -f "$ALLOWLIST_FILE" ]; then
  grep -vE '^[[:space:]]*(#|$)' "$ALLOWLIST_FILE" | sed -E 's/[[:space:]]+$//' | tr -d '\r' > "$WORK_DIR/allow.txt" || true
  NEW_HITS_FILE="$WORK_DIR/new_hits.jsonl"
  : > "$NEW_HITS_FILE"
  while IFS= read -r jline; do
    [ -z "$jline" ] && continue
    KEY="$(printf '%s' "$jline" | jq -r '"\(.detector)|\(.file)|\(.line)"' 2>/dev/null)" \
      || { printf '%s\n' "$jline" >> "$NEW_HITS_FILE"; continue; }
    [ -z "$KEY" ] && { printf '%s\n' "$jline" >> "$NEW_HITS_FILE"; continue; }
    if grep -Fxq -- "$KEY" "$WORK_DIR/allow.txt"; then
      ALLOWLISTED_COUNT=$((ALLOWLISTED_COUNT+1))
    else
      printf '%s\n' "$jline" >> "$NEW_HITS_FILE"
    fi
  done < "$HITS_FILE"
  HITS_FILE="$NEW_HITS_FILE"
fi

# ===========================================================================
# REPORTE
# ===========================================================================
HITS_COUNT="$(wc -l < "$HITS_FILE" | tr -d ' ')"

DETECTORS_LIST="sql_grant_execute_anon, sql_alter_default_privileges_anon, sql_secdef_no_search_path, sql_view_dropcreate_no_invoker, sql_rls_policy_true_anon, sql_create_table_no_rls, sql_hardcoded_secret, ts_european_number_parse, ts_fire_and_forget_insert, ts_fetch_no_timeout, ts_permissions_policy_disabled, ts_link_to_missing_route"

if [ "$JSON_OUTPUT" -eq 1 ]; then
  jq -s --argjson allow "$ALLOWLISTED_COUNT" --arg routecheck "$ROUTE_CHECK" \
    '{ total: length, allowlisted: $allow, route_check: $routecheck, hits: . }' "$HITS_FILE"
  [ "$HITS_COUNT" -gt 0 ] && exit 1 || exit 0
fi

echo ""
echo "── Resultado (vigilante de codigo) ──"
[ "$ROUTE_CHECK" != "on" ] && echo "⚠️  ts_link_to_missing_route: $ROUTE_CHECK"
[ "${ALLOWLISTED_COUNT:-0}" -gt 0 ] && echo "ℹ️  $ALLOWLISTED_COUNT hit(s) conocido(s) ignorado(s) por allowlist (scripts/audit-code-allowlist.txt)"

if [ "$HITS_COUNT" -eq 0 ]; then
  echo "✅ Repo limpio: 0 hits nuevos"
  echo "   Detectores: $DETECTORS_LIST"
  exit 0
fi

echo "❌ $HITS_COUNT hits nuevos detectados:"
echo ""
for severity in critical high medium; do
  COUNT="$(jq -s --arg s "$severity" 'map(select(.severity==$s)) | length' "$HITS_FILE")"
  [ "$COUNT" = "0" ] && continue
  echo "── Severity: $severity ($COUNT) ──"
  jq -s --arg s "$severity" -r '
    map(select(.severity==$s)) | .[] |
    "  [\(.detector)]\n    fichero: \(.file):\(.line)\n    preview: \(.preview)\n"
  ' "$HITS_FILE"
done

echo "Para salida JSON: $0 --json"
exit 1
