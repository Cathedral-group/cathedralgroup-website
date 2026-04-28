#!/usr/bin/env bash
# Cathedral — backup del volume Docker n8n
#
# Qué hace
#   Comprime el volume `n8n_data` (sqlite con workflows + credentials +
#   executions + todo lo que vive en n8n) y lo envía al webhook de backup
#   con el header X-Backup-Type: n8n-volume → Drive ADMINISTRACION/Backups/n8n-volume/.
#
# Dónde se ejecuta
#   En el servidor Hetzner (root@77.42.36.4) — donde corre el container n8n.
#   El cron del propio Linux lo dispara diariamente.
#
# INSTALACIÓN (UNA VEZ, manual)
# ----------------------------
#   1. SSH al servidor:    ssh root@77.42.36.4
#   2. Crear directorio:   mkdir -p /opt/cathedral/scripts /var/log/cathedral /tmp/n8n-backup
#   3. Copiar este script: scp scripts/backup-n8n-volume.sh root@77.42.36.4:/opt/cathedral/scripts/
#                           chmod +x /opt/cathedral/scripts/backup-n8n-volume.sh
#   4. Crear archivo de credenciales SOLO LEGIBLE POR ROOT:
#         cat > /opt/cathedral/scripts/.env <<EOF
#         BACKUP_WEBHOOK_URL=https://n8n.cathedralgroup.es/webhook/cathedral-backup-db
#         BACKUP_WEBHOOK_TOKEN=<el valor de BACKUP_WEBHOOK_TOKEN que vive en GitHub Secrets>
#         EOF
#         chmod 600 /opt/cathedral/scripts/.env
#   5. Probar manualmente: /opt/cathedral/scripts/backup-n8n-volume.sh
#                          (debe mostrar ✓ y aparecer un archivo en Drive)
#   6. Añadir cron: crontab -e   y añadir la línea:
#         0 3 * * * /opt/cathedral/scripts/backup-n8n-volume.sh >> /var/log/cathedral/n8n-volume-backup.log 2>&1
#       (ejecutará a las 03:00 UTC = 05:00 Madrid en verano)
#
# Cómo restaurar
#   Ver RECOVERY.md sección "Recovery de n8n volume Docker"

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

TS=$(date -u +%Y%m%dT%H%M%SZ)
TMP_FILE="/tmp/n8n-backup/n8n_volume_${TS}.tar.gz"
mkdir -p /tmp/n8n-backup

echo "[$(date -Iseconds)] Comprimiendo $VOLUME_PATH → $TMP_FILE"
tar -czf "$TMP_FILE" -C /var/lib/docker/volumes n8n_data 2>/dev/null
ls -lh "$TMP_FILE"

echo "[$(date -Iseconds)] Enviando al webhook"
HTTP_CODE=$(curl -sS -o /tmp/n8n-backup/response.json -w "%{http_code}" \
  -X POST "$BACKUP_WEBHOOK_URL" \
  -H "Authorization: Bearer $BACKUP_WEBHOOK_TOKEN" \
  -H "X-Backup-Type: n8n-volume" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @"$TMP_FILE")

echo "[$(date -Iseconds)] HTTP $HTTP_CODE"
cat /tmp/n8n-backup/response.json | head -c 500
echo

if [[ "$HTTP_CODE" -ge 400 ]]; then
  echo "ERROR: upload falló con HTTP $HTTP_CODE — el archivo local queda en $TMP_FILE para retry manual" >&2
  exit 1
fi

# Cleanup local solo si upload OK
rm -f "$TMP_FILE"
echo "[$(date -Iseconds)] ✓ Backup OK"
