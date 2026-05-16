# Cathedral Utility Endpoints — Reference

Single source para los 5 utility endpoints internos Cathedral implementados sesión 16/05/2026 (Plan A — ADR-0001).

## Endpoints

| Endpoint | Función | Versión | Commit |
|---|---|---|---|
| `POST /api/dedup` | Dedup SHA-256 o email+filename, 3 tablas (invoices/quotes/documents) | v2 | `7bc004a` |
| `POST /api/fuzzy-supplier` | Fuzzy nombre proveedor (OCR text → `suppliers.name` pg_trgm) | v1 | anterior |
| `POST /api/fuzzy-ticket-invoice` | Fuzzy ticket → invoice/quote (NIF + importe ±0.5% + fecha ±20d) | v1 | `aa12caa` |
| `POST /api/decide-table` | Decide tabla destino + corroboración proyecto (7 tablas) | v2 | `b56bf1a` |
| `GET /api/feature-flag-check` | Consulta rollout flag para subject_id (cutover progresivo n8n) | v1 | `bf78800` |
| `POST /api/admin/feature-flag-toggle` | Activar/cambiar 1 flag curl-friendly | v1 | `40ba09f` |
| `GET /api/admin/feature-flag-list` | Listar todos los flags + estado | v1 | `19732d8` |
| `POST /api/admin/feature-flag-batch` | Activar/desactivar múltiples flags atomic (cap 20) | v1 | `cbe0d14` |
| `GET /api/health/utilities` | Health monitoring 4 utilities + flags status | v1 | `a1050c8` |

## Auth

Todos los endpoints requieren header `Authorization: Bearer ${CATHEDRAL_INTERNAL_TOKEN}` con `timingSafeEqual` constant-time comparison.

Token rotable via:
```bash
NEW=$(openssl rand -hex 32)
# 1. Actualizar Vercel env vars (production + preview + development)
# 2. Actualizar credential n8n id `xrnnrxUJLJVd6Lmb`
```

## Helper wrappers (`lib/cathedral-utility-client.ts`)

Server-side (Route Handlers, Server Actions, `after()` callbacks). Defensive (never throws), timeout 3-5s, no-store cache.

```typescript
import {
  sha256Hex,
  callDedup,
  callFuzzySupplier,
  callFuzzyTicketInvoice,
  callDecideTable,
  callFeatureFlagCheck,
} from '@/lib/cathedral-utility-client'

// SHA-256 hex 64 chars lowercase
const hash = await sha256Hex(arrayBuffer)

// Dedup
const dedup = await callDedup({ file_hash: hash })
// o
const dedup = await callDedup({
  email_message_id: 'abc123',
  filename: 'factura.pdf',
})

// Fuzzy supplier (nombre proveedor)
const match = await callFuzzySupplier('Endesa Energía', 'A81948077')

// Fuzzy ticket → invoice histórica
const candidates = await callFuzzyTicketInvoice({
  supplier_nif: 'A81948077',
  amount: 156.32,
  issue_date: '2026-04-15',
  target_table: 'invoices',
})

// Decide tabla destino
const decision = await callDecideTable({
  doc_type: 'factura',
  supplier_nif: 'A81948077',
  extracted_text: '... FLP-2025-003 ...',
})

// Rollout check (n8n cutover progresivo)
const flag = await callFeatureFlagCheck('use_dedup_endpoint', fileHash)
if (flag?.should_use) { /* usar endpoint */ }
```

## Sistema feature flags

Tabla `public.feature_flags` con UI admin `/admin/sistema/flags`.

| Flag | Función | Estado actual |
|---|---|---|
| `use_dedup_endpoint` | Cutover workflow general → `/api/dedup` | off / 0% |
| `use_fuzzy_supplier_endpoint` | Cutover workflow general → `/api/fuzzy-supplier` | off / 0% |
| `use_decide_table_endpoint` | Cutover workflow general → `/api/decide-table` | off / 0% |
| `portal_use_unified_ocr` | Portal trabajador enrich post-OCR con dedup + supplier_match | off / 0% |

Rollout determinista: `SHA-256(${flagKey}:${subjectId})[0..3] mod 100 < rollout_pct`. Mismo subject_id siempre cae igual.

## Cutover playbook workflow general n8n

Workflow productivo `FwpGF7L2GbFB84kL` ("Cathedral · Clasificador (auto)"). Cutover diferido sesión dedicada con David presente. **Drop-in posible AHORA** con feature flag.

### Pre-cutover (1 sesión)

```bash
cd cathedralgroup-website

# 1. Snapshot baseline 50 facturas
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  node scripts/golden-dataset-snapshot.mjs --limit=50

# 2. Verificar utilities OK
CATHEDRAL_INTERNAL_TOKEN=... node scripts/smoke-test-utilities.mjs
# Esperado: 19/19 pass

# 3. Verificar health
curl -H "Authorization: Bearer $CATHEDRAL_INTERNAL_TOKEN" \
  https://cathedralgroup-website.vercel.app/api/health/utilities
# Esperado: status:"ok", flags_status 4 keys present
```

### Cutover progresivo (rollout)

Para cada flag (`use_dedup_endpoint` primero, después fuzzy + decide):

1. **Subir rollout_pct = 10** desde `/admin/sistema/flags` (slider).
2. **24h espera** (suficiente tráfico para validar).
3. **Comparar golden dataset**:
   ```bash
   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
     node scripts/golden-dataset-compare.mjs scripts/golden-dataset-baseline-YYYY-MM-DD.json
   ```
   - Exit 0 → seguro continuar
   - Exit 1 → bajar rollout_pct=0 desde admin UI (rollback <2min) + investigar diff
4. **Subir 50** → 24h → compare.
5. **Subir 100** → 24h → compare.
6. **Cleanup** (sesión dedicada cuando 100% estable): eliminar Code legacy del workflow general n8n.

### Workflow n8n modificación (futuro paso 2)

Añadir 3 nodos nuevos antes del nodo legacy:

```
Evaluar Pre-Clasificacion
  → Check Flag Dedup (HTTP /api/feature-flag-check?key=use_dedup_endpoint&subject_id={file_hash})
    → ¿Should Use Endpoint? (IF should_use=true)
      ├─ true:  HTTP /api/dedup v2 (con include_deleted=true para paridad)
      │           → Set Normalize Dedup Output (mapear response v2 → shape legacy)
      │             → continúa flow normal
      └─ false: Check Duplicado Supabase (legacy intacto)
                → Check Duplicados Unificado (legacy intacto)
                  → continúa flow normal
```

Patrón se repite para `/api/fuzzy-ticket-invoice` (paridad `Buscar Fuzzy Match V2`) y `/api/decide-table` (paridad `Decidir Tabla Destino`).

## Diferencias importantes entre endpoints

### `/api/fuzzy-supplier` ≠ `/api/fuzzy-ticket-invoice`

| Aspecto | `/api/fuzzy-supplier` | `/api/fuzzy-ticket-invoice` |
|---|---|---|
| Input | nombre proveedor (OCR) + nif opcional | NIF + importe + fecha + target_table |
| Lógica | pg_trgm sobre `suppliers.name` | range query `(supplier_nif, amount±0.5%, date±20d)` en invoices/quotes |
| Propósito | Asignar `supplier_id` a factura nueva | Detectar duplicado ticket↔invoice histórica |

**Funcionalmente diferentes.** El workflow n8n usa ambos conceptos en flujos separados.

### `/api/dedup` v2 vs n8n legacy

`/api/dedup` v2 amplió backward-compatible:
- Body OR lookup `{file_hash}` O `{email_message_id + filename}` (v1 solo aceptaba file_hash)
- 3 tablas paralelas (v1 solo invoices + documents — añadido `quotes`)
- `include_deleted` flag (default `false` para no romper portal trabajador; n8n cutover enviará `true`)
- Response shape extiende v1 sin breaking (consumers v1 ven superconjunto)
- SELECT condicional para `documents` (sin columna `number`)

## Scripts

| Script | Comando | Para qué |
|---|---|---|
| `smoke-test-utilities.mjs` | `CATHEDRAL_INTERNAL_TOKEN=... node scripts/smoke-test-utilities.mjs` | 19 tests integración los 4 endpoints |
| `test-feature-flags-rollout.mjs` | `node --test scripts/test-feature-flags-rollout.mjs` | 8 tests determinismo SHA-256 rollout |
| `golden-dataset-snapshot.mjs` | `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/golden-dataset-snapshot.mjs --limit=50` | Baseline 50 facturas pre-cutover |
| `golden-dataset-compare.mjs` | `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/golden-dataset-compare.mjs <baseline.json>` | Comparator post-cutover (exit 0/1) |
| `backfill-worker-attachments-file-hash.mjs` | `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-worker-attachments-file-hash.mjs [--dry-run]` | Backfill SHA-256 rows existentes |

## Schema BD nueva (sesión 16/05/2026)

```sql
-- Tabla feature flags
CREATE TABLE public.feature_flags (
  key TEXT PRIMARY KEY CHECK (key ~ '^[a-z0-9_]+$'),
  enabled BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  rollout_pct INTEGER NOT NULL DEFAULT 0 CHECK (rollout_pct BETWEEN 0 AND 100),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
);
-- RLS+FORCE + GRANT SELECT anon/auth + ALL service_role
-- Trigger updated_at automático

-- Shadow log (preparado para shadow comparison futuro, no usado hoy)
CREATE TABLE public.endpoint_shadow_log (
  id BIGSERIAL PRIMARY KEY,
  flag_key TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  endpoint_result JSONB NOT NULL,
  legacy_result JSONB NOT NULL,
  diverged BOOLEAN NOT NULL,
  divergence_fields TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Columna nueva worker_attachments
ALTER TABLE public.worker_attachments ADD COLUMN file_hash TEXT;
CREATE INDEX idx_worker_attachments_file_hash
  ON public.worker_attachments(file_hash)
  WHERE file_hash IS NOT NULL AND deleted_at IS NULL;

-- Indexes compuestos performance fuzzy-ticket-invoice
CREATE INDEX idx_invoices_supplier_nif_issue_date
  ON public.invoices(supplier_nif, issue_date)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_quotes_supplier_nif_issue_date
  ON public.quotes(supplier_nif, issue_date)
  WHERE deleted_at IS NULL;

-- RPC fuzzy_match_supplier (existente desde sesión 16/05 mañana)
-- Implementa NIF exact + pg_trgm similarity sobre suppliers.name normalizado
```

## ADRs relacionadas

- ADR-0001 — Arquitectura procesamiento facturas (n8n thin + lógica Next.js)
- ADR-0002 — Hosting endpoint Vercel Hobby + Fluid Compute
- ADR-0005 — Migración SDK @google/genai
- ADR-0007 — Cloudflare Workers diferido Q4 2026/Q1 2027
- ADR-0008 — Cutover workflow general diferido + plan 5 pasos

## Diagnóstico rápido (si algo falla)

```bash
# 1. ¿Endpoint vivo?
curl -sI https://cathedralgroup-website.vercel.app/api/health/utilities

# 2. ¿Auth OK?
curl -s -H "Authorization: Bearer $CATHEDRAL_INTERNAL_TOKEN" \
  https://cathedralgroup-website.vercel.app/api/health/utilities

# 3. ¿Smoke test 4 endpoints?
CATHEDRAL_INTERNAL_TOKEN=$TOKEN node scripts/smoke-test-utilities.mjs

# 4. ¿Logs Vercel últimos errores?
vercel logs <deployment-url> 2>&1 | tail -50

# 5. ¿Flag activo no esperado? Bajar rollout_pct=0 desde /admin/sistema/flags
```

## Próximos pasos pendientes

1. ✅ Activar `portal_use_unified_ocr` rollout=10 HECHO 16/05 (validación end-to-end Rafael futuro)
2. ❌ Cutover workflow general n8n (3 utilities secuencial — ADR-0008 plan 5 pasos) — David presente sesión dedicada
3. ✅ Cron Hetzner llamando `/api/health/utilities` HECHO 16/05 (`5 * * * *` + alerting `system_notifications`)
4. ✅ GitHub Actions CI + branch protection HECHO 16/05 (`ci-utilities.yml` + status check required)

## Rollback emergencia (curl)

Bajar todos los flags a 0% en una sola call (útil incidente producción):

```bash
TOKEN=<CATHEDRAL_INTERNAL_TOKEN>
curl -X POST https://cathedralgroup-website.vercel.app/api/admin/feature-flag-batch \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"updates":[
    {"key":"use_dedup_endpoint","enabled":false,"rollout_pct":0},
    {"key":"use_fuzzy_supplier_endpoint","enabled":false,"rollout_pct":0},
    {"key":"use_decide_table_endpoint","enabled":false,"rollout_pct":0},
    {"key":"portal_use_unified_ocr","enabled":false,"rollout_pct":0}
  ]}'
```

Tras rollback: workflow general n8n vuelve a Code legacy 100% inmediato (revalidateTag invalida cache 60s instantáneo).
