# ADR-0009: Testing + Performance Strategy

- **Status**: Accepted
- **Date**: 2026-05-16
- **Deciders**: David Vieco + Claude

## Contexto

Sesión 16/05/2026 noche escaló cobertura tests Cathedral de cero (solo manual + n8n cron) a 46 tests automatizados + 5-step CI runner + GitHub Actions cloud + branch protection. Plus benchmark performance baseline. Sin estrategia documentada quién mantiene qué + qué threshold tolerar regresión.

## Decisión

**Triple capa tests Cathedral:**

### Capa 1 — Unit tests offline (`node --test`)

- **`scripts/test-feature-flags-rollout.mjs`** (8 tests): determinismo SHA-256 `isInRollout`. Distribución, independencia keys, regex format.
- **`scripts/test-cathedral-utility-client.mjs`** (10 tests): wrappers `lib/cathedral-utility-client.ts` con mock `fetch` global. `sha256Hex`, `fetchWithTimeout` defensive null, body construction, query params encoding.

**Características:**
- Cero red, cero deps externas
- <300ms total ambos
- Run en cada commit (pre-push hook + GitHub Actions)
- **Sincronizar manualmente si lib cambia algoritmo core** — tests replican lógica en JS puro (no importan TS directo). Coste técnico aceptable: lib auth + sha256 + isInRollout son code estable, raramente cambian.

### Capa 2 — Integration smoke vs producción

- **`scripts/smoke-test-utilities.mjs`** (29 tests): HTTP calls a `cathedralgroup-website.vercel.app/api/*` con casos happy + edge + auth + regex.
- Cubre 7 endpoints (`dedup`, `fuzzy-supplier`, `fuzzy-ticket-invoice`, `decide-table`, `feature-flag-check`, `feature-flag-toggle`, `feature-flag-list`) + `/api/health/utilities`.
- Requiere `CATHEDRAL_INTERNAL_TOKEN` (Bearer auth).
- **~7-8 segundos total** (warmed). Cold start primer test ~600ms.
- Run pre-deploy + post-deploy + hourly (Hetzner cron) + cada PR GitHub Actions.

### Capa 3 — Regresión BD con golden dataset

- **`scripts/golden-dataset-snapshot.mjs`**: baseline 50 facturas recientes con campos críticos (file_hash, supplier_id, project_id, doc_type, direction, issue_date, amount_total).
- **`scripts/golden-dataset-compare.mjs`**: post-cutover compara mismos IDs.
- CRITICAL_FIELDS (file_hash, direction, doc_type, issue_date, amount_total): tolerancia **0 diffs**.
- MUTABLE_FIELDS (supplier_id, project_id, review_status, payment_status): info-only.
- Exit 1 si CRITICAL diff detectado → automatable rollback en cutover-step.mjs.

**Régimen baseline**: regenerar manualmente antes cutover workflow general. Committed en repo para reference histórica.

## Performance baselines

**SLA p95 warmed (cold start excluido) < 800ms** para todos utility endpoints. Cold start ephemeral Vercel típico 300-700ms — NO cuenta.

**Baseline N=20 16/05/2026 noche:**

| Endpoint | p50 | p95 | Cold |
|---|---|---|---|
| `/api/decide-table` (factura) | 136ms | 144ms | 143ms |
| `/api/feature-flag-check` | 140ms | 294ms | 259ms |
| `/api/health/utilities` | 249ms | 474ms | 672ms |
| `/api/admin/feature-flag-list` | 252ms | 324ms | 284ms |
| `/api/fuzzy-supplier` (no match) | 263ms | 371ms | 278ms |
| `/api/fuzzy-ticket-invoice` (no match) | 305ms | 331ms | 266ms |
| `/api/dedup` (no match) | 303ms | 509ms | 413ms |

Re-correr `scripts/perf-bench-utilities.mjs` post-deploy mayor o trimestral. Si p95 regresa >800ms cualquier endpoint → investigar (cambio schema, index missing, BD lenta, Vercel infra issue).

## CI integration

### Local

- **pre-commit hook** (`.git/hooks/pre-commit`): gitleaks scan secrets staged (existente desde sesión 30 abril).
- **pre-push hook** (`.git/hooks/pre-push`): `ci-full-check --skip-golden` si cambios `app/api/` o `lib/`. Bootstrap: `bash scripts/install-git-hooks.sh`.

### Cloud (GitHub Actions)

- **`.github/workflows/ci-utilities.yml`**: trigger push main + PR main + path filter api/lib/scripts/test/smoke.
- **Branch protection main**: required status check `ci-full-check`, no force push, no delete. `enforce_admins=false` (David/JM/Julián pueden bypass emergencia).
- **Secret `CATHEDRAL_INTERNAL_TOKEN`** configurado repo Settings → Secrets → Actions.
- Runtime ~15s warmed (Node 20 ubuntu-latest, sin npm install — ESM puro cero deps).

### Production monitoring

- **`/api/health/utilities`**: status=ok si Supabase + feature_flags + 4 seeds OK.
- **Hetzner cron `cathedral-health-cron.sh`** horario `5 * * * *`:
  - Consulta health endpoint
  - Counter consecutive fails persistido `/var/lib/cathedral/health-state.txt`
  - Tras 3 fallos consecutivos → INSERT `system_notifications` (banner admin Cathedral, severity=warning, dedup_key=health-utilities-degraded)
  - Recovery automático al volver status=ok (reset counter)
- Log `/var/log/cathedral/health.log` (vacío en happy path).

## Cobertura post-sesión 16/05/2026

| Componente | Test layer | Frecuencia |
|---|---|---|
| `lib/feature-flags.ts` isInRollout SHA-256 | Unit | Cada commit |
| `lib/cathedral-utility-client.ts` wrappers | Unit (mock fetch) | Cada commit |
| 7 utility endpoints (auth/happy/edge) | Integration smoke | Cada PR + push main + hourly |
| `feature_flags` table + 4 flags seed | Integration (`/api/health/utilities`) | Hourly Hetzner |
| 50 facturas BD baseline | Golden dataset | Manual pre-cutover |

**NO cubierto** (acepta riesgo):
- React Client Components (FlagsManager.tsx, etc.) — UI manual testing
- Workflow general n8n (cobertura via cron audit-n8n-workflows.yml separado, anti-patterns detection)
- Pages admin RSC — auth+redirect critical, auditado manualmente
- OCR providers cascade integration end-to-end — testing manual con uploads reales
- Server Actions (feature-flags.ts) — testing via UI manual

## Política regresiones

1. **Capa 1 fail (unit)**: bloquea push automáticamente (pre-push hook).
2. **Capa 2 fail (smoke)**: bloquea merge PR (GitHub Actions + branch protection).
3. **Capa 3 fail (golden compare CRITICAL)**: rollback rollout inmediato (`cutover-step.mjs <flag> rollback`).
4. **Health degraded 3h consecutivas**: banner admin + revisar deploy/Supabase.

## Coste de mantenimiento

- Unit tests: ~0 mantenimiento (lógica estable, replicada JS puro)
- Smoke tests: actualizar cuando endpoint cambia shape response (low frequency)
- Golden dataset: regenerar pre-cutover (manual ~30s)
- Performance baseline: re-correr trimestral + post cambios mayor schema

## Alternativas descartadas

### Vitest framework
- **Razón rechazo**: añadiría `vitest` + `@vitest/coverage` + config + ~20 MB deps. node:test built-in suficiente para nuestros 18 tests.
- **Re-considerar si**: tests pasan 50+ y queremos coverage reports HTML.

### Playwright E2E browser
- **Razón rechazo**: Cathedral admin tiene 3 users humanos. E2E browser overhead alto vs valor.
- **Re-considerar si**: portal trabajador escala >50 trabajadores con flows complejos.

### Supabase tests con `pg_prove`
- **Razón rechazo**: añade dependencia + tabla schema separado. Smoke tests cubren end-to-end suficiente.
- **Re-considerar si**: añadimos >10 RPCs nuevas con lógica fiscal compleja.

## Referencias

- ADR-0001 Arquitectura procesamiento facturas
- ADR-0008 Cutover workflow general diferido
- `docs/utilities-cathedral.md` reference completa endpoints
- `scripts/README.md` inventario scripts
