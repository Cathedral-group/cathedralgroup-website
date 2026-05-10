#!/usr/bin/env bash
# Cathedral — backup del volume Docker n8n (Sprint A Backup Robusto, 10/05/2026)
#
# Qué hace
#   1. Comprime el volume `n8n_data` (sqlite con workflows + credentials +
#      executions) excluyendo storage/ y eventLog (ya en Drive aparte).
#   2. Cifra con GPG (clave pública Cathedral Backups) — sin passphrase +
#      privada custodiada, los .gpg en Drive son ilegibles.
#   3. Calcula SHA-256 del archivo cifrado.
#   4. POST al webhook n8n con header X-Backup-Type: n8n-volume → Drive
#      ADMINISTRACION/Backups/n8n-volume/.
#   5. Llama a /api/cron/backup-record para registrar en backup_runs.
#
# Dónde se ejecuta
#   En el servidor Hetzner (root@77.42.36.4) — donde corre el container n8n.
#   Cron Linux lo dispara diariamente.
#
# INSTALACIÓN (UNA VEZ, manual)
# ----------------------------
#   1. SSH al servidor:    ssh root@77.42.36.4
#   2. Crear directorio:   mkdir -p /opt/cathedral/scripts /var/log/cathedral /tmp/n8n-backup
#   3. Copiar este script:
#         scp scripts/backup-n8n-volume.sh root@77.42.36.4:/opt/cathedral/scripts/
#         chmod +x /opt/cathedral/scripts/backup-n8n-volume.sh
#   4. Copiar la clave pública GPG (Sprint A 10/05/2026):
#         scp /Users/davidvieco/cathedral-backup-keys/cathedral-backups-public.asc \
#             root@77.42.36.4:/opt/cathedral/scripts/
#         chmod 644 /opt/cathedral/scripts/cathedral-backups-public.asc
#         # Importarla al keyring del root
#         gpg --import /opt/cathedral/scripts/cathedral-backups-public.asc
#         # Verificar fingerprint:
#         gpg --list-keys backups@cathedralgroup.es
#         # Esperado: CA85D0ED5C35D808EC7E664E6B3E392F09F26DA1
#   5. Crear .env (perms 600):
#         cat > /opt/cathedral/scripts/.env <<EOF
#         BACKUP_WEBHOOK_URL=https://n8n.cathedralgroup.es/webhook/cathedral-backup-db
#         BACKUP_WEBHOOK_TOKEN=<el valor de BACKUP_WEBHOOK_TOKEN que vive en GitHub Secrets>
#         AUDIT_CRON_SECRET=<el valor de AUDIT_CRON_SECRET que vive en GitHub Secrets / Vercel>
#         CATHEDRAL_BASE_URL=https://cathedralgroup.es
#         EOF
#         chmod 600 /opt/cathedral/scripts/.env
#   6. Probar manualmente: /opt/cathedral/scripts/backup-n8n-volume.sh
#                          (debe mostrar ✓ y aparecer un .tar.gz.gpg en Drive)
#   7. Añadir cron: crontab -e   y añadir la línea:
#         0 3 * * * /opt/cathedral/scripts/backup-n8n-volume.sh >> /var/log/cathedral/n8n-volume-backup.log 2>&1
#
# Cómo restaurar
#   Ver memory/runbook_recovery.md sección "Recovery de n8n volume Docker"
#   y memory/cathedral-backup-keys/CUSTODIA.md para descifrado GPG.

set -euo pipefail

ENV_FILE="/opt/cathedral/scripts/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE no existe — ver instrucciones de instalación arriba" >&2
  exit 1
fi
# shellcheck disable=SC1090
source "$ENV_FILE"

if [[ -z "${BACKUP_WEBHOOK_URL:-}" ]] || [[ -z "${BACKUP_WEBHOOK_TOKEN:-}" ]]; then
  echo "ERROR: BACKUP_WEBHOOK_URL o BACKUP_WEBHOOK_TOKEN no definidos en $ENV_FILE" >&2
  exit 1
fi

VOLUME_PATH="/var/lib/docker/volumes/n8n_data"
if [[ ! -d "$VOLUME_PATH" ]]; then
  echo "ERROR: $VOLUME_PATH no existe — ¿n8n no está instalado o el path cambió?" >&2
  exit 1
fi

# Verificar GPG public key importada
if ! gpg --list-keys backups@cathedralgroup.es >/dev/null 2>&1; then
  echo "ERROR: GPG public key Cathedral Backups no está importada en el keyring root." >&2
  echo "       Importa con: gpg --import /opt/cathedral/scripts/cathedral-backups-public.asc" >&2
  exit 1
fi

TS=$(date -u +%Y%m%dT%H%M%SZ)
TMP_TAR="/tmp/n8n-backup/n8n_volume_${TS}.tar.gz"
TMP_ENC="${TMP_TAR}.gpg"
mkdir -p /tmp/n8n-backup

echo "[$(date -Iseconds)] Comprimiendo $VOLUME_PATH → $TMP_TAR"
# Sesión 8/05/2026 fix: excluir /storage (12GB de binary files PDFs que ya
# están en Drive — redundantes para recovery). Solo backupeamos el "núcleo":
# database.sqlite + config + nodes. ~1.5GB sin compresión → ~500MB comprimido.
tar -czf "$TMP_TAR" -C /var/lib/docker/volumes \
  --exclude='n8n_data/_data/storage' \
  --exclude='n8n_data/_data/n8nEventLog*' \
  n8n_data 2>/dev/null
TAR_SIZE=$(stat -c %s "$TMP_TAR")
echo "[$(date -Iseconds)] Tamaño tar.gz: $TAR_SIZE bytes"

echo "[$(date -Iseconds)] Cifrando con GPG (Cathedral Backups)"
gpg --batch --yes --trust-model always \
    --recipient backups@cathedralgroup.es \
    --output "$TMP_ENC" \
    --encrypt "$TMP_TAR"
ENC_SIZE=$(stat -c %s "$TMP_ENC")
SHA256=$(sha256sum "$TMP_ENC" | awk '{print $1}')
echo "[$(date -Iseconds)] Tamaño cifrado: $ENC_SIZE bytes — SHA-256: $SHA256"
# Borrar el plano para no guardarlo accidentalmente
rm -f "$TMP_TAR"

echo "[$(date -Iseconds)] Enviando al webhook n8n"
# Usar `-T file` con `-X POST` para upload streaming (sin OOM con archivos >1GB).
HTTP_CODE=$(curl -sS -o /tmp/n8n-backup/response.json -w "%{http_code}" \
  -X POST \
  -T "$TMP_ENC" \
  "$BACKUP_WEBHOOK_URL" \
  -H "Authorization: Bearer $BACKUP_WEBHOOK_TOKEN" \
  -H "X-Backup-Type: n8n-volume" \
  -H "X-Backup-Encrypted: gpg" \
  -H "X-Backup-Category: daily" \
  -H "X-Backup-Sha256: $SHA256" \
  -H "Content-Type: application/octet-stream")

echo "[$(date -Iseconds)] HTTP $HTTP_CODE"
cat /tmp/n8n-backup/response.json | head -c 500
echo

UPLOAD_STATUS="success"
UPLOAD_ERROR=""
if [[ "$HTTP_CODE" -ge 400 ]]; then
  UPLOAD_STATUS="failed"
  UPLOAD_ERROR="HTTP $HTTP_CODE"
  echo "ERROR: upload falló con HTTP $HTTP_CODE — el archivo cifrado queda en $TMP_ENC para retry manual" >&2
fi

# Drive file ID si n8n lo devolvió
DRIVE_ID=$(jq -r '.drive_file_id // empty' /tmp/n8n-backup/response.json 2>/dev/null || echo "")

# Registrar el resultado en backup_runs (siempre, aunque falle el upload)
if [[ -n "${AUDIT_CRON_SECRET:-}" ]]; then
  RECORD_URL="${CATHEDRAL_BASE_URL:-https://cathedralgroup.es}/api/cron/backup-record"
  PAYLOAD=$(jq -n \
    --arg trigger_type "hetzner_cron" \
    --arg backup_type "n8n_volume" \
    --arg status "$UPLOAD_STATUS" \
    --arg category "daily" \
    --arg triggered_by "hetzner-cron-$(hostname)" \
    --argjson size "$ENC_SIZE" \
    --arg sha "$SHA256" \
    --arg drive_id "$DRIVE_ID" \
    --arg gpg_fp "CA85D0ED5C35D808EC7E664E6B3E392F09F26DA1" \
    --arg err "$UPLOAD_ERROR" \
    --arg ts "$TS" \
    '{
      trigger_type: $trigger_type,
      backup_type: $backup_type,
      status: $status,
      category: $category,
      triggered_by: $triggered_by,
      file_size_bytes: $size,
      file_sha256: $sha,
      file_locations: {drive: $drive_id},
      gpg_encrypted: true,
      gpg_fingerprint: $gpg_fp,
      error_message: (if $err == "" then null else $err end),
      metadata: {ts: $ts, hostname: "$(hostname)"}
    }')
  echo "[$(date -Iseconds)] Registrando en backup_runs"
  curl -sS -X POST "$RECORD_URL" \
    -H "Authorization: Bearer $AUDIT_CRON_SECRET" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" | head -c 500
  echo
else
  echo "[$(date -Iseconds)] AVISO: AUDIT_CRON_SECRET no en .env — omitiendo registro en backup_runs"
fi

# Cleanup local solo si upload OK
if [[ "$UPLOAD_STATUS" == "success" ]]; then
  rm -f "$TMP_ENC"
  echo "[$(date -Iseconds)] ✓ Backup OK"
else
  echo "[$(date -Iseconds)] ⚠️ Backup FALLÓ — archivo cifrado preservado en $TMP_ENC"
  exit 1
fi
