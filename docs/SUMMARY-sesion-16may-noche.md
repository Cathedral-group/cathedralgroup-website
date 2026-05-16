# Sesión 16/05/2026 noche — Plan A wrap-up

35 commits desplegados Vercel. 0 regresiones productivas. Workflow general n8n intacto.

## Resultados

**Plan A ~93% completo:**

- 5 utility endpoints internos Cathedral + health monitoring + toggle admin + list admin
- Sistema feature flags completo (tabla + lib + Server Actions + UI admin + 4 seeds)
- Portal trabajador unificado (SHA-256 file_hash + dedup + supplier_match flag-gated)
- 5 scripts pre/post cutover (smoke, golden snapshot+compare, backfill, cutover-step, ci-full-check, hetzner-cron)
- 8 ADRs documentados (0001-0008)
- 8 rondas auditoría seguridad caveman:cavecrew-reviewer
- 11 bugs reales fixed
- 1 refactor consolidación (lib/api-auth.ts, -91 líneas boilerplate)
- README.md + docs/utilities-cathedral.md + SUMMARY documentación

## 11 bugs reales fixed (sesión 16/05 noche)

| # | Severidad | Bug | Commit |
|---|---|---|---|
| 1 | 🔴 | IDOR bulk delete `/api/db/papelera` sin company_id | `b177bbe` |
| 2 | 🔴 | `decide-table` `.or()` filter injection | `eb3c20a` |
| 3 | 🔴 | OCR openai fetch sin timeout (cost leak) | `6b313e0` |
| 4 | 🔴 | OCR mistral fetch sin timeout (cost leak) | `6b313e0` |
| 5 | 🟠 | `fuzzy-ticket-invoice` `Number(undefined)=0` silente | `eb3c20a` |
| 6 | 🟡 | DoS bulk delete unlimited items | `b177bbe` |
| 7 | 🟡 | `portal/[token]` expiry boundary off-by-one | `b177bbe` |
| 8 | 🟡 | UUID case-insensitive normalize | `62a2438` |
| 9 | 🟡 | `isInRollout` guards (empty subjectId + NaN pct) | `708aa20` |
| 10 | 🟡 | SEPA pain.001 CtrlSum + NbOfTxs pre-validation | `64785b2` |
| 11 | 🟡 | Blog `getAllPosts` O(n²) → O(n) cache in-memory | `5b5ac23` |

## Endpoints utility (`/api/*`)

| Endpoint | Función | Commit |
|---|---|---|
| `POST /api/dedup` v2 | Dedup SHA-256 + email+filename, 3 tablas | `7bc004a` |
| `POST /api/fuzzy-supplier` v1 | Fuzzy nombre proveedor pg_trgm | `f650acb` |
| `POST /api/fuzzy-ticket-invoice` v1 | Fuzzy ticket → invoice (NIF+importe+fecha) | `aa12caa` |
| `POST /api/decide-table` v2 | 7 tablas + regex hipoteca | `b56bf1a` |
| `GET /api/feature-flag-check` v1 | Rollout check determinista | `bf78800` |
| `POST /api/admin/feature-flag-toggle` v1 | Toggle curl-friendly | `40ba09f` |
| `GET /api/admin/feature-flag-list` v1 | Listar todos los flags | `19732d8` |
| `GET /api/health/utilities` v1 | Health monitoring | `a1050c8` |

## Scripts

| Script | Para qué |
|---|---|
| `smoke-test-utilities.mjs` | 26 tests integración 4 endpoints prod |
| `test-feature-flags-rollout.mjs` | 8 tests determinismo SHA-256 |
| `golden-dataset-snapshot.mjs` | Baseline 50 facturas |
| `golden-dataset-compare.mjs` | Comparator regresión BD |
| `backfill-worker-attachments-file-hash.mjs` | Backfill SHA-256 (6/6 aplicado) |
| `cutover-step.mjs` | Automatización rollout step-by-step |
| `ci-full-check.mjs` | Runner unificado pre-deploy (4/4 pass ~8s) |
| `hetzner-cron-health-check.sh` | Cron monitoring Hetzner (ready-to-deploy) |

## ADRs

- 0001 Arquitectura procesamiento facturas
- 0002 Hosting endpoint Vercel Hobby + Fluid Compute
- 0003 Verifactu emisión Q3-Q4 2026 + cert FNMT
- 0004 Refactor solo + anti-burnout
- 0005 Migración SDK @google/genai
- 0006 XML detector Facturae + Factur-X
- 0007 Cloudflare Workers diferido Q4 2026/Q1 2027
- 0008 Cutover workflow general diferido + plan 5 pasos

## Schema BD cambios sesión

- `public.feature_flags` (RLS+FORCE + 4 seeds)
- `public.endpoint_shadow_log` (preparado shadow comparison futuro)
- `public.worker_attachments.file_hash` + partial index
- `idx_invoices_supplier_nif_issue_date` partial composite
- `idx_quotes_supplier_nif_issue_date` partial composite
- RPC `fuzzy_match_supplier` + `normalize_supplier_name` IMMUTABLE
- GIN trigram `idx_suppliers_name_trgm`

## Refactor

`lib/api-auth.ts` consolida 7 `checkAuth` duplicados en endpoints utility:
- `/api/dedup`, `/api/fuzzy-supplier`, `/api/fuzzy-ticket-invoice`, `/api/decide-table`
- `/api/feature-flag-check`, `/api/admin/feature-flag-toggle`
- `/api/health/utilities`

-91 líneas boilerplate eliminadas. Single point of change futuro (JWT, IP allowlist, key rotation).

## Estado workflow general n8n

`FwpGF7L2GbFB84kL` ("Cathedral · Clasificador (auto)") **INTACTO**.

Drop-in cutover posible AHORA con feature flag (ADR-0008 plan 5 pasos).

Pendiente próxima sesión dedicada con David presente:

1. Ampliar `/api/dedup` v2 ya hecho ✅
2. Cutover progresivo workflow general con flag `use_dedup_endpoint`
3. Rollout 10% → 50% → 100% via `/admin/sistema/flags` o `cutover-step.mjs`
4. Cleanup nodos legacy
5. Repetir patrón para `/api/fuzzy-ticket-invoice` + `/api/decide-table`

## Próxima sesión cutover (comandos exactos)

```bash
# Pre-cutover
node scripts/ci-full-check.mjs
node scripts/golden-dataset-snapshot.mjs --limit=50

# Activar 10%
node scripts/cutover-step.mjs use_dedup_endpoint activate-10

# 24h después
node scripts/cutover-step.mjs use_dedup_endpoint compare
# Si exit 0:
node scripts/cutover-step.mjs use_dedup_endpoint activate-50

# 24h después
node scripts/cutover-step.mjs use_dedup_endpoint compare
node scripts/cutover-step.mjs use_dedup_endpoint activate-100

# Si fail cualquier compare:
node scripts/cutover-step.mjs use_dedup_endpoint rollback
```

## Tests pasados al cerrar sesión

- 8/8 rollout determinism (`test-feature-flags-rollout.mjs`)
- 26/26 smoke integration (`smoke-test-utilities.mjs`)
- 4/4 CI full check (`ci-full-check.mjs`)
- 0 critical diffs golden dataset baseline vs current
- Build Next.js OK
- TypeScript clean
- 0 secrets detectados (gitleaks)
