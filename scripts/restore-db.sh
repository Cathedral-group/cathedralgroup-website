#!/usr/bin/env bash
# Restaurar un backup de la BD Supabase de Cathedral Group desde un .dump.gz
# generado por .github/workflows/backup-db.yml.
#
# Los backups se guardan diariamente en:
#   Drive: ADMINISTRACION/Backups/Supabase/cathedral_db_YYYY-MM-DD_HHMMSS_<categoría>.dump.gz
#
#   Política retention en Drive:
#     - daily: últimos 30
#     - weekly: últimas 52 (lunes)
#     - monthly: TODOS para siempre (día 1 de cada mes)
#
#   Backups secundarios (si Drive falló): GitHub Actions artifacts (90 días).
#
# Pre-requisitos
#   - postgresql-client instalado (incluye pg_restore): `brew install postgresql`
#   - DATABASE_URL en el entorno → ver cathedral-credentials.md sección Supabase
#     (formato estándar de connection string Postgres apuntando a Supabase)
#
# USO 1 — restaurar TODA la BD (overwrites todo)
# ----------------------------------------------
#   Solo úsalo si la BD está corrompida/borrada y necesitas reconstruir todo.
#
#   1. Descarga el .dump.gz desde Drive (o GitHub Actions artifacts)
#   2. Descomprime: gunzip cathedral_db_YYYY-MM-DD_HHMMSS_daily.dump.gz
#   3. Restaura (ejemplo — DATABASE_URL exportada en el entorno):
#       pg_restore \
#         --dbname="$DATABASE_URL" \
#         --clean --if-exists --no-owner --no-acl \
#         --verbose \
#         cathedral_db_YYYY-MM-DD_HHMMSS_daily.dump
#
# USO 2 — restaurar SOLO una tabla (recovery quirúrgico)
# ------------------------------------------------------
#   Caso típico: alguien borró 50 facturas hoy. Quieres restaurar solo
#   `invoices` desde el backup de ayer SIN tocar el resto.
#
#   1. Descarga el .dump.gz
#   2. Descomprime
#   3. Restaura solo esa tabla, modo data-only (no recrea schema):
#       pg_restore \
#         --dbname="postgresql://..." \
#         --table=invoices \
#         --data-only \
#         --verbose \
#         cathedral_db_YYYY-MM-DD_HHMMSS_daily.dump
#
#   ⚠️ ESTO NO BORRA LAS FILAS ACTUALES — INSERTA ENCIMA. Si quieres
#   reemplazar completamente, primero TRUNCATE invoices CASCADE en SQL
#   (peligroso, hazlo con cuidado y otro backup justo antes).
#
# USO 3 — inspeccionar contenido sin restaurar
# --------------------------------------------
#   pg_restore --list cathedral_db_YYYY-MM-DD_HHMMSS_daily.dump
#   (muestra el manifiesto: cuántas tablas, índices, etc.)
#
# USO 4 — restaurar a una BD nueva (sandbox para inspección)
# ----------------------------------------------------------
#   Útil si quieres comparar BD actual vs backup sin tocar producción.
#
#   1. Crear proyecto Supabase nuevo (free tier vale para inspección)
#   2. Apuntar pg_restore a su connection string
#   3. Restaurar completo: --clean --if-exists --no-owner --no-acl

set -euo pipefail

usage() {
  cat <<EOF
Uso: $0 <archivo.dump.gz> [tabla]

  archivo.dump.gz   Backup descargado de Drive
  tabla             (opcional) restaurar solo esta tabla, data-only

Variables de entorno requeridas:
  DATABASE_URL      Connection string Postgres a Supabase
                    (NO uses el pooler para pg_restore — usa la directa)

Ejemplo (la connection string exacta vive en cathedral-credentials.md):
  export DATABASE_URL=...
  $0 cathedral_db_2026-04-29_023000_daily.dump.gz
  $0 cathedral_db_2026-04-29_023000_daily.dump.gz invoices
EOF
  exit 1
}

[[ $# -lt 1 ]] && usage
[[ -z "${DATABASE_URL:-}" ]] && { echo "ERROR: DATABASE_URL no definida" >&2; usage; }

DUMP_GZ="$1"
TABLE="${2:-}"

[[ -f "$DUMP_GZ" ]] || { echo "ERROR: archivo no encontrado: $DUMP_GZ" >&2; exit 1; }

# Descomprimir si viene en .gz
DUMP="$DUMP_GZ"
if [[ "$DUMP_GZ" =~ \.gz$ ]]; then
  DUMP="${DUMP_GZ%.gz}"
  echo "Descomprimiendo $DUMP_GZ → $DUMP ..."
  gunzip -k "$DUMP_GZ"
fi

if [[ -n "$TABLE" ]]; then
  echo "→ Restaurando SOLO tabla '$TABLE' (modo data-only)"
  echo "  ⚠️  NO se borran filas actuales — los datos del backup se INSERTAN encima."
  echo "  ⚠️  Si quieres reemplazo limpio: TRUNCATE TABLE $TABLE CASCADE; antes."
  read -r -p "¿Continuar? [s/N] " ans
  [[ "$ans" =~ ^[sS]$ ]] || { echo "Cancelado."; exit 0; }

  pg_restore \
    --dbname="$DATABASE_URL" \
    --table="$TABLE" \
    --data-only \
    --no-owner \
    --no-acl \
    --verbose \
    "$DUMP"
else
  echo "→ Restaurando TODA la BD (--clean --if-exists)"
  echo "  ⚠️  ESTO BORRA Y RECREA todas las tablas. Se pierden los datos actuales."
  read -r -p "¿Continuar? Escribe 'BORRAR Y RESTAURAR' para confirmar: " ans
  [[ "$ans" == "BORRAR Y RESTAURAR" ]] || { echo "Cancelado."; exit 0; }

  pg_restore \
    --dbname="$DATABASE_URL" \
    --clean --if-exists \
    --no-owner --no-acl \
    --verbose \
    "$DUMP"
fi

echo "✓ Restauración completada."
