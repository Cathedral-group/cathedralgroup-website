# `scripts/`

Operaciones críticas del sistema Cathedral. Versionadas a partir de sesión 31
(antes vivían solo en la Mac de David — riesgo de pérdida si la máquina caía).

**Regla**: NUNCA hardcodear secretos. Todos los scripts leen de variables de
entorno. gitleaks pre-commit valida.

## Inventario

### Operaciones DB / Drive / Backup (legacy)

| Script | Función | Cuándo usar |
|---|---|---|
| `audit-drive-orphans.py` | Detecta archivos Drive sin referencia BD y `--apply` los manda a papelera | Tras cambios masivos en BD/Drive. Siempre `--dry-run` primero |
| `audit-n8n-workflows.sh` | Detecta 3 anti-patrones en workflows n8n (expression sin `=`, `neverError` crítico, hardcoded secrets) | Tras cambios a workflows. Cron diario en GitHub Actions (`audit-n8n-workflows.yml`) |
| `backfill-sha256.py` | Calcula SHA-256 de PDFs Drive y UPDATE BD `file_hash` | Para rows legacy sin file_hash. Idempotente, salta los ya rellenos |
| `backup-n8n-volume.sh` | Comprime volumen Docker n8n y POST al webhook backup → Drive | Instalado en Hetzner crontab `0 3 * * *`. Rotación retention en webhook |
| `populate-project-subfolders.py` | Escanea Drive y rellena `project_subfolders` con las subcarpetas por proyecto | Tras crear nuevas carpetas Drive de proyectos. Idempotente |
| `restore-db.sh` | Restaura backup `.dump.gz` desde Drive a Supabase | DR — recovery total tras data loss. Pide confirmación interactiva |

### Plan A — utility endpoints + cutover (sesión 16/05/2026)

#### Tests automatizados (`node --test`)

| Script | Tests | Para qué |
|---|---|---|
| `test-feature-flags-rollout.mjs` | 8 | Determinismo SHA-256 `isInRollout`: distribución, independencia, regex |
| `test-cathedral-utility-client.mjs` | 10 | Unit tests wrappers (sha256Hex, fetchWithTimeout, body, defensive null) |

```bash
node --test scripts/test-*.mjs
```

#### Integration tests vs prod

| Script | Tests | Auth | Para qué |
|---|---|---|---|
| `smoke-test-utilities.mjs` | 33 | Bearer CATHEDRAL_INTERNAL_TOKEN | Smoke 8 utility endpoints + health (auth, happy, edge, regex) |

```bash
CATHEDRAL_INTERNAL_TOKEN=... node scripts/smoke-test-utilities.mjs
```

#### Performance benchmark

| Script | Para qué |
|---|---|
| `perf-bench-utilities.mjs` | Latencia p50/p95/p99 por endpoint. SLA p95 warmed < 800ms |

```bash
CATHEDRAL_INTERNAL_TOKEN=... [N=20] node scripts/perf-bench-utilities.mjs
```

#### Cutover automation

| Script | Para qué |
|---|---|
| `golden-dataset-snapshot.mjs` | Baseline 50 facturas pre-cutover |
| `golden-dataset-compare.mjs` | Compare baseline vs current. Tolerancia 0 critical diffs |
| `cutover-step.mjs` | Automatización rollout (status/preview/activate-N/rollback/compare) |
| `backfill-worker-attachments-file-hash.mjs` | Backfill SHA-256 rows existentes worker_attachments |

#### CI + hooks

| Script | Para qué |
|---|---|
| `ci-full-check.mjs` | Runner unificado 5 steps (tests + smoke + health + golden) |
| `install-git-hooks.sh` | Bootstrap pre-push hook (ci-full-check si cambios api/lib) |

```bash
CATHEDRAL_INTERNAL_TOKEN=... node scripts/ci-full-check.mjs [--skip-golden]
bash scripts/install-git-hooks.sh
```

#### Hetzner deploy

| Script | Para qué |
|---|---|
| `hetzner-cron-health-check.sh` | Cron horario monitoring `/api/health/utilities` (deploy futuro SSH) |

### Snapshots persistidos

- `golden-dataset-baseline-YYYY-MM-DD.json` — baseline 50 facturas committed en repo (reference histórica + ground-truth comparator post-cutover)

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
