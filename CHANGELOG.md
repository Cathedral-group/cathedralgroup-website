# Changelog

Cambios notables `cathedralgroup-website`. Formato basado en [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

## [2026-05-16] Plan A — Utility endpoints + cutover infrastructure

Sesión maratoniana ~17h. 67 commits desplegados Vercel + 4 SQL migrations Supabase. 19 bugs reales fixed (13 rondas auditoría caveman:cavecrew-reviewer + doc-validator).

### Added

#### 12 utility endpoints internos (`/api/*`)

- `POST /api/dedup` v2 (3 tablas + OR lookup file_hash o email+filename)
- `POST /api/fuzzy-supplier` v1 (pg_trgm RPC)
- `POST /api/fuzzy-ticket-invoice` v1 (NIF + importe ±0.5% + fecha ±20d)
- `POST /api/decide-table` v2 (7 tablas + regex hipoteca)
- `GET /api/feature-flag-check` v1 (rollout determinista SHA-256)
- `POST /api/admin/feature-flag-toggle` v1 (1 flag curl-friendly)
- `GET /api/admin/feature-flag-list` v1 (read-only listar todos)
- `POST /api/admin/feature-flag-batch` v1 (múltiples atomic, cap 20)
- `POST /api/admin/feature-flag-delete` v1 (cleanup con safety confirm)
- `GET /api/admin/feature-flag-snapshot` v1 (backup completo + metadata)
- `GET /api/admin/audit-log-recent` v1 (inspect audit trail)
- `GET /api/health/utilities` v1 (monitoring Supabase + flags)

#### Sistema feature flags + UI admin

- Tabla `feature_flags` (PK key snake_case + CHECK regex + RLS+FORCE)
- `lib/feature-flags.ts` (unstable_cache 60s + isInRollout SHA-256 determinista)
- `app/actions/feature-flags.ts` (Server Actions update/create/delete con re-auth + audit log)
- `/admin/sistema/flags` RSC + Client useOptimistic + useTransition
- 4 seeds iniciales: `use_dedup_endpoint`, `use_fuzzy_supplier_endpoint`, `use_decide_table_endpoint`, `portal_use_unified_ocr`

#### Portal trabajador unificado

- `worker_attachments.file_hash` columna + partial index
- `lib/cathedral-utility-client.ts` wrappers (sha256Hex, callDedup, callFuzzySupplier, callFuzzyTicketInvoice, callDecideTable, callFeatureFlagCheck)
- Refactor `upload-receipt/route.ts`: SHA-256 paralelo upload Storage, flag-gated enrichment dedup + supplier_match en `extracted_data`
- Backfill 6/6 rows existentes con file_hash

#### 13 scripts (`scripts/`)

- `smoke-test-utilities.mjs` (43 tests integración vs prod)
- `test-feature-flags-rollout.mjs` (8 tests determinismo SHA-256)
- `test-cathedral-utility-client.mjs` (10 tests unit wrappers mock fetch)
- `golden-dataset-snapshot.mjs` + `golden-dataset-compare.mjs` (baseline + comparator)
- `cutover-step.mjs` (automatización rollout status/preview/activate-N/rollback/compare/audit)
- `backfill-worker-attachments-file-hash.mjs`
- `perf-bench-utilities.mjs` (latencia p50/p95/p99 + SLA check)
- `ci-full-check.mjs` (runner unificado 5 steps)
- `install-git-hooks.sh` (bootstrap pre-push hook)
- `hetzner-cron-health-check.sh` (deployed prod `5 * * * *`)
- 6 scripts legacy preexistentes

#### 11 ADRs

- 0001 Arquitectura procesamiento facturas
- 0002 Hosting endpoint Vercel Hobby + Fluid Compute
- 0003 Verifactu emisión Q3-Q4 2026 + cert FNMT
- 0004 Refactor solo vs outsource
- 0005 Migración SDK @google/genai
- 0006 XML detector Facturae + Factur-X
- 0007 Cloudflare Workers diferido Q4 2026/Q1 2027
- 0008 Cutover workflow general n8n diferido (plan 5 pasos)
- 0009 Testing + performance strategy
- 0010 Deployment + rollback strategy 4 niveles

#### Infrastructure

- GitHub Actions `ci-utilities.yml` (push main + PR + path filter api/lib)
- Branch protection main (required `ci-full-check` status)
- Secret `CATHEDRAL_INTERNAL_TOKEN` configurado repo
- Pre-commit gitleaks (existente) + pre-push CI ligero (nuevo)
- Hetzner cron `cathedral-health-cron.sh` horario con alerting `system_notifications`
- Audit log persistente `admin_audit_log` Server Actions + API endpoints

### Fixed

19 bugs reales detectados via 13 rondas auditoría:

#### 🔴 Critical

- IDOR `/api/db/papelera` bulk delete sin company_id filter
- `decide-table` `.or(supplierFilter)` injection vulnerability
- OCR openai + mistral fetch sin timeout (cost leak)
- `admin_audit_log.action` CHECK constraint no aceptaba `flag_*` (audit fallaba silente)

#### 🟠 High

- `fuzzy-ticket-invoice` `Number(undefined)=0` falso positivo match
- `change-pin` sin rate limit + token UUID regex faltante (brute-force PIN default)
- RPC `change_worker_pin` sin lockout check (brute-force change PIN)
- `fichaje` race salida UPDATE concurrent overwrite

#### 🟡 Medium

- DoS papelera bulk cap items unlimited
- `portal/[token]` expiry boundary off-by-one (`<` → `<=`)
- UUID case-insensitive normalize header X-Active-Company-Id
- `isInRollout` guards empty subjectId + NaN pct
- SEPA pain.001 CtrlSum + NbOfTxs pre-validation
- blog `getAllPosts` O(n²) → O(n) cache in-memory
- `parte` NaN bypass validation Number.isFinite
- `ausencias` date format weak regex YYYY-MM-DD strict
- `parte` UPSERT race try-INSERT + catch 23505 → UPDATE
- `verify-turnstile` defensive error handling Cloudflare API
- `system-status` dead code cleanup (-1 SELECT Supabase per request)

### Changed

- `lib/api-auth.ts` consolida `checkAuth` 7 endpoints utility (-91 líneas boilerplate)
- `lib/feature-flags.ts` `getAllFlags` Map → Record (JSON-serializable unstable_cache fix)
- README.md proyecto principal expandido (2 líneas → 117)

### Schema BD

- `public.feature_flags` (RLS+FORCE + 4 seeds)
- `public.endpoint_shadow_log` (preparada shadow comparison futuro)
- `public.worker_attachments.file_hash` column + partial index
- `idx_invoices_supplier_nif_issue_date` + `idx_quotes_supplier_nif_issue_date` (composite partial)
- RPC `fuzzy_match_supplier` + `normalize_supplier_name` IMMUTABLE
- GIN trigram `idx_suppliers_name_trgm`
- RPC `change_worker_pin` lockout check
- `admin_audit_log.action` CHECK constraint extendido (6 valores nuevos)

### Workflow n8n productivo

`FwpGF7L2GbFB84kL` ("Cathedral · Clasificador (auto)") **INTACTO**. 0 regresiones. Cutover real diferido sesión dedicada con David presente (ADR-0008 plan 5 pasos).

### Tests cobertura

- 8 rollout determinism (node:test offline)
- 10 utility-client unit (mock fetch)
- 43 smoke integration vs prod (incluye E2E audit log)
- **61 tests automatizados** + 1 CI runner unificado 5 steps + 1 health check runtime + 1 golden dataset comparator manual

### Performance baseline (16/05 noche, N=20 warmed)

| Endpoint | p50 | p95 |
|---|---|---|
| `/api/decide-table` (factura) | 136ms | 144ms |
| `/api/feature-flag-check` | 140ms | 294ms |
| `/api/health/utilities` | 249ms | 474ms |
| `/api/admin/feature-flag-list` | 252ms | 324ms |
| `/api/fuzzy-supplier` (no match) | 263ms | 371ms |
| `/api/fuzzy-ticket-invoice` (no match) | 305ms | 331ms |
| `/api/dedup` (no match) | 303ms | 509ms |

SLA p95 warmed < 800ms — todos cumplen.
