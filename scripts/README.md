# `scripts/`

Operaciones críticas del sistema Cathedral. Versionadas a partir de sesión 31
(antes vivían solo en la Mac de David — riesgo de pérdida si la máquina caía).

**Regla**: NUNCA hardcodear secretos. Todos los scripts leen de variables de
entorno. gitleaks pre-commit valida.

## Inventario

| Script | Función | Cuándo usar |
|---|---|---|
| `audit-drive-orphans.py` | Detecta archivos Drive sin referencia BD y `--apply` los manda a papelera | Tras cambios masivos en BD/Drive. Siempre `--dry-run` primero |
| `audit-n8n-workflows.sh` | Detecta 3 anti-patrones en workflows n8n (expression sin `=`, `neverError` crítico, hardcoded secrets) | Tras cambios a workflows. Cron diario en GitHub Actions (`audit-n8n-workflows.yml`) |
| `backfill-sha256.py` | Calcula SHA-256 de PDFs Drive y UPDATE BD `file_hash` | Para rows legacy sin file_hash. Idempotente, salta los ya rellenos |
| `backup-n8n-volume.sh` | Comprime volumen Docker n8n y POST al webhook backup → Drive | Instalado en Hetzner crontab `0 3 * * *`. Rotación retention en webhook |
| `populate-project-subfolders.py` | Escanea Drive y rellena `project_subfolders` con las subcarpetas por proyecto | Tras crear nuevas carpetas Drive de proyectos. Idempotente |
| `restore-db.sh` | Restaura backup `.dump.gz` desde Drive a Supabase | DR — recovery total tras data loss. Pide confirmación interactiva |

## Variables de entorno requeridas

```bash
# Para audit-drive-orphans.py + backfill-sha256.py:
export SUPABASE_KEY=sb_secret_...
gcloud auth application-default login --scopes=https://www.googleapis.com/auth/drive,https://www.googleapis.com/auth/cloud-platform

# Para backup-n8n-volume.sh (Hetzner):
# /opt/cathedral/scripts/.env con BACKUP_WEBHOOK_TOKEN=...

# Para restore-db.sh:
export SUPABASE_DATABASE_URL=postgresql://...
```

## Convenciones

- Idempotentes — re-ejecutar sin riesgo
- `--dry-run` por defecto cuando hay riesgo destructivo
- Confirmación interactiva (`escribir SI MAYUSCULAS`) antes de mover a papelera/borrar
- Logs estructurados a stdout, errores a stderr
- Backups precaucionales antes de operaciones masivas (los grandes lo declaran al inicio)
