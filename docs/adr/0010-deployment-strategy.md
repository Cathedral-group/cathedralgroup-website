# ADR-0010: Deployment + Rollback Strategy

- **Status**: Accepted
- **Date**: 2026-05-16
- **Deciders**: David Vieco + Claude

## Contexto

Sesión 16/05 escaló Cathedral de "git push → Vercel" simple a sistema con 11 utility endpoints + cron Hetzner + feature flags + GitHub Actions CI + branch protection. Sin estrategia documentada cómo deployar nuevas features sin romper producción.

## Decisión

**4 niveles deployment según riesgo:**

### Nivel 1 — Features aisladas (cero riesgo prod)

Cambios que NO tocan endpoints existentes, schema BD, workflow n8n, libs core.

Ejemplos:
- Nuevo endpoint admin separado (e.g. `/api/admin/feature-flag-batch`)
- Script `scripts/*.mjs` nuevo
- Documentation (README, ADRs, comments)
- Tests adicionales (smoke, unit)

**Proceso**:
1. Code change local
2. `npx tsc --noEmit -p tsconfig.json` + `npm run build` ok
3. Tests offline pass: `node --test scripts/test-*.mjs`
4. `git commit` + pre-commit gitleaks
5. `git push` → pre-push CI ligero (si cambios api/lib) + GitHub Actions cloud
6. Vercel auto-deploy (~60-90s)
7. Smoke test post-deploy si tocó api: `CATHEDRAL_INTERNAL_TOKEN=$T node scripts/smoke-test-utilities.mjs`

**Tiempo total**: ~5 min code-to-prod.
**Rollback**: `git revert <commit> && git push`. Vercel re-deploya en ~90s.

### Nivel 2 — Endpoint existente modificado

Cambios que tocan endpoints productivos con consumers (workflow n8n, portal trabajador, GitHub Actions).

Ejemplos:
- Refactor `lib/api-auth.ts` consolida 7 endpoints
- Bug fix endpoint existente (e.g. dedup OR injection)
- Performance optimization (blog cache O(n²))

**Proceso** (Nivel 1 + extras):
1. Audit con `caveman:cavecrew-reviewer` (regla SUPREMA hook bloqueante)
2. doc-validator si cambia API/sintaxis pattern
3. Smoke test 40/40 pass post-deploy
4. Verificar workflow productivo n8n no afectado (ejecuciones recientes)

**Tiempo total**: ~10 min code-to-prod.
**Rollback**: git revert + push. Si endpoint roto en prod, Vercel preview branch rollback inmediato.

### Nivel 3 — Schema BD / SQL migration

Cambios a tablas Supabase (CREATE TABLE, ALTER, RPCs, GRANTS, indexes).

Ejemplos:
- Tabla `feature_flags` nueva (commit `907ec40`)
- `worker_attachments.file_hash` columna añadida (commit `7b14fd6`)
- Indexes compuestos performance (commit `7bc004a`)
- RPC `change_worker_pin` lockout fix (commit `39db874`)

**Proceso**:
1. SQL versionado en `supabase/migrations/<timestamp>_<name>.sql`
2. Aplicar primero via Supabase Mgmt API (curl POST `/v1/projects/$ref/database/query`)
3. Verificar empíricamente con SELECT post-migration
4. Commit migration file
5. Push

**Rollback SQL**: requiere DROP / ALTER inverso manual (no auto). Documentar inverso en commit message si destructivo.

**Productivo n8n riesgo**: si migration toca tablas usadas por workflow (invoices, suppliers, projects), verificar workflow no falla. Histórico: `feature_flags` + `endpoint_shadow_log` NUEVAS, no afectaron n8n.

### Nivel 4 — Workflow productivo n8n

Cambios al workflow general (`FwpGF7L2GbFB84kL`) que procesa emails Cathedral 24/7.

Ejemplos pendientes:
- Cutover Code legacy → `/api/dedup` v2 (ADR-0008)
- Cutover fuzzy + decide-table

**Proceso** (requiere David presente + sesión dedicada ~3h):
1. **Pre-cutover**: `node scripts/golden-dataset-snapshot.mjs --limit=50`
2. **Modificar workflow** via cookie session `/rest/workflows/{id}` PATCH + POST `/rest/workflows/{id}/activate` con `{versionId}` (regla SUPREMA Cathedral, NO usar PUT API)
3. **Activar flag** rollout=10 via `cutover-step.mjs activate-10`
4. **24h espera + compare**: `cutover-step.mjs compare`
5. **Si exit 0**: activate-50 → 24h → activate-100. **Si fail**: rollback inmediato (`cutover-step.mjs rollback`).
6. **Cleanup**: eliminar nodos legacy via PATCH workflow (sesión siguiente)

**Rollback emergencia múltiple** (incidente prod):
```bash
curl -X POST .../api/admin/feature-flag-batch \
  -H "Authorization: Bearer $T" -d '{"updates":[
    {"key":"use_dedup_endpoint","enabled":false,"rollout_pct":0},
    {"key":"use_fuzzy_supplier_endpoint","enabled":false,"rollout_pct":0},
    {"key":"use_decide_table_endpoint","enabled":false,"rollout_pct":0}
  ]}'
```

`revalidateTag('feature-flags')` invalida cache 60s → workflow vuelve a Code legacy 100% inmediato.

## Monitoring post-deploy

- **GitHub Actions** `ci-utilities.yml`: trigger push main + PR + path filter api/lib. Bloquea merge si fail (branch protection `ci-full-check` required).
- **Hetzner cron** `/opt/cathedral/scripts/cathedral-health-cron.sh` `5 * * * *`:
  - GET `/api/health/utilities`
  - Si status != 'ok' 3 veces consecutivas → INSERT `system_notifications` (banner admin)
  - Recovery automático
- **Vercel logs** `vercel logs <deployment-url>`: tail últimos errors runtime.

## Branch protection main

Configurado 16/05:
- Required status check: `ci-full-check`
- `allow_force_pushes: false`
- `allow_deletions: false`
- `enforce_admins: false` (David/JM/Julián pueden bypass emergencia)
- PR review NO required (3 admins Cathedral, sin review formal)

Bypass emergencia:
```bash
git push --no-verify  # solo si pre-push hook bug
# o
git push -o ci-skip   # via repo settings allow admin bypass
```

## Secrets management

- **GitHub Actions secret** `CATHEDRAL_INTERNAL_TOKEN`: configurado via `gh secret set`.
- **Vercel env vars**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CATHEDRAL_INTERNAL_TOKEN`, etc. Setup via Vercel CLI o web UI.
- **Hetzner** `/opt/cathedral/scripts/.env-health` mode 600 con tokens.
- **Local dev** `.env.local` gitignored.
- **NUNCA hardcodear secrets**: gitleaks pre-commit bloquea.

## Rotación tokens (mensual)

```bash
NEW=$(openssl rand -hex 32)
# 1. Vercel env vars (web UI / CLI) — production + preview + development
# 2. n8n credential xrnnrxUJLJVd6Lmb (cookie session POST /rest/credentials)
# 3. GitHub secret: gh secret set CATHEDRAL_INTERNAL_TOKEN --body "$NEW"
# 4. Hetzner .env-health: sed -i + chmod 600
# Coordinación: actualizar simultáneo todos 4 sitios (sin gap).
```

## Decisiones key

- **Sin staging/preview environment**: Vercel preview deployments por PR son suficientes. Cathedral tamaño no justifica staging dedicado.
- **Sin canary deployments**: feature flags cubren el use case (rollout 10%/50%/100% controlable runtime).
- **Sin blue/green**: Vercel auto-deploy zero-downtime ya proporciona esto.
- **enforce_admins=false**: prioridad acceso emergencia > strict process. Auditoría `admin_audit_log` mitiga.

## Métricas

- Tiempo deploy Nivel 1: <5 min
- Tiempo deploy Nivel 2: <10 min
- Tiempo rollback (git revert + push): ~3 min
- Tiempo rollback flag (UI o curl): <30s
- Coste mensual deployments Vercel Hobby: 0€

## Referencias

- ADR-0008 Cutover workflow general diferido
- ADR-0009 Testing + performance strategy
- `docs/utilities-cathedral.md`
- `scripts/cutover-step.mjs`
