# cathedralgroup-website

Website + admin panel + utility endpoints internos Cathedral Group.

Stack: Next.js 15.5.14 App Router + React 19 + Tailwind v4 + Supabase Postgres + Vercel Hobby Fluid Compute.

## Quick links

- **Web pública**: `app/(public)/*` — landing, blog, contacto, servicios, zonas, presupuesto
- **Admin panel**: `app/admin/*` — gestión facturas, proyectos, personal, fiscal (CIF B19761915)
- **Portal trabajador**: `app/portal/trabajador/[token]/*` — fichaje, tickets, calendario, ausencias
- **Portal cliente**: `app/portal/[token]/*` — visualizar presupuesto + estado proyecto

## Utility endpoints internos (`/api/*`)

Microservicio Cathedral para tareas comunes facturación. Auth Bearer `CATHEDRAL_INTERNAL_TOKEN`.

| Endpoint | Función |
|---|---|
| `POST /api/dedup` | Dedup SHA-256 o email+filename, 3 tablas (invoices/quotes/documents) |
| `POST /api/fuzzy-supplier` | Fuzzy nombre proveedor → `suppliers.name` pg_trgm |
| `POST /api/fuzzy-ticket-invoice` | Fuzzy ticket → invoice histórica (NIF + importe ±0.5% + fecha ±20d) |
| `POST /api/decide-table` | Decide tabla destino + corroboración proyecto (7 tablas) |
| `GET /api/feature-flag-check` | Consulta rollout flag (cutover progresivo n8n) |
| `POST /api/admin/feature-flag-toggle` | Activar/cambiar 1 flag via curl |
| `GET /api/admin/feature-flag-list` | Listar todos los flags + estado |
| `POST /api/admin/feature-flag-batch` | Activar/desactivar múltiples flags atomic (rollback masivo) |
| `GET /api/health/utilities` | Health check Supabase + flags |

Reference completa: [docs/utilities-cathedral.md](docs/utilities-cathedral.md)

## Sistema feature flags

UI admin: `/admin/sistema/flags` (toggle + rollout slider 0-100%).

Rollout determinista: SHA-256(`${flagKey}:${subjectId}`)[0..3] mod 100. Mismo subject siempre mismo bucket.

Flags activos:
- `use_dedup_endpoint` — cutover workflow general → `/api/dedup`
- `use_fuzzy_supplier_endpoint` — cutover → `/api/fuzzy-supplier`
- `use_decide_table_endpoint` — cutover → `/api/decide-table`
- `portal_use_unified_ocr` — portal trabajador enrich post-OCR

## Scripts

| Script | Para qué |
|---|---|
| `node scripts/smoke-test-utilities.mjs` | 26 tests integración 4 endpoints prod |
| `node --test scripts/test-feature-flags-rollout.mjs` | 8 tests determinismo SHA-256 |
| `node scripts/golden-dataset-snapshot.mjs` | Baseline 50 facturas pre-cutover |
| `node scripts/golden-dataset-compare.mjs <baseline>` | Comparator regresión BD |
| `node scripts/backfill-worker-attachments-file-hash.mjs` | Backfill SHA-256 |
| `node scripts/cutover-step.mjs <flag> <action>` | Automatización cutover progresivo |
| `node scripts/ci-full-check.mjs` | Runner unificado 4 checks pre-deploy |
| `scripts/hetzner-cron-health-check.sh` | Cron monitoring Hetzner (deploy futuro) |

## Develop

```bash
npm install
npm run dev   # http://localhost:3000
```

Variables env requeridas: ver `cathedral-credentials.md` (memoria privada Claude).

## ADRs

Decisiones arquitectura en [docs/adr/](docs/adr/):

- ADR-0001 Arquitectura procesamiento facturas (n8n thin + Next.js)
- ADR-0002 Hosting endpoint Vercel Hobby + Fluid Compute
- ADR-0003 Verifactu emisión Q3-Q4 2026 + cert FNMT
- ADR-0004 Refactor solo vs outsource
- ADR-0005 Migración SDK @google/genai
- ADR-0006 XML detector Facturae + Factur-X
- ADR-0007 Cloudflare Workers diferido Q4 2026/Q1 2027
- ADR-0008 Cutover workflow general diferido + plan 5 pasos

## Deploy

Auto-deploy desde GitHub `main` branch a Vercel production. CI pre-deploy ejecuta:

```bash
node scripts/ci-full-check.mjs
```

Esperar exit 0 antes de merge.

## Diagnóstico rápido

```bash
# Status endpoints utilities
curl -H "Authorization: Bearer $CATHEDRAL_INTERNAL_TOKEN" \
  https://cathedralgroup-website.vercel.app/api/health/utilities

# Smoke test 26 endpoints
CATHEDRAL_INTERNAL_TOKEN=$TOKEN node scripts/smoke-test-utilities.mjs

# Logs Vercel
vercel logs <deployment-url> | tail -50

# Rollback 1 flag
node scripts/cutover-step.mjs <flag-key> rollback

# Rollback masivo todos flags (1 call atomic)
curl -X POST https://cathedralgroup-website.vercel.app/api/admin/feature-flag-batch \
  -H "Authorization: Bearer $CATHEDRAL_INTERNAL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"updates":[
    {"key":"use_dedup_endpoint","enabled":false,"rollout_pct":0},
    {"key":"use_fuzzy_supplier_endpoint","enabled":false,"rollout_pct":0},
    {"key":"use_decide_table_endpoint","enabled":false,"rollout_pct":0},
    {"key":"portal_use_unified_ocr","enabled":false,"rollout_pct":0}
  ]}'
```
