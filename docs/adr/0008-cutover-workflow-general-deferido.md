# ADR-0008: Cutover workflow general n8n → endpoints Next.js (DEFERIDO sesión dedicada)

- **Status**: Accepted (decisión: aplazar implementación)
- **Date**: 2026-05-16
- **Deciders**: David Vieco + Claude

## Contexto

Tras crear 3 endpoints utility en Next.js Vercel (`/api/dedup`, `/api/fuzzy-supplier`, `/api/decide-table`) + sistema de feature flags (`/admin/sistema/flags` + `lib/feature-flags.ts`) + endpoint `/api/feature-flag-check` para que n8n consulte rollout, el siguiente paso natural era cutover progresivo del workflow general (ID `FwpGF7L2GbFB84kL`, "Cathedral · Clasificador (auto)", 80+ nodos) hacia los nuevos endpoints.

Se evaluaron 2 estrategias:

1. **Shadow comparison branch paralelo**: añadir 3 nodos shadow que llaman `/api/dedup` en paralelo al Code legacy y loguean divergencias en `endpoint_shadow_log`. Tras 24-48h validación → cutover.
2. **Cutover progresivo con feature flag**: añadir nodo `Check Flag` + `IF` + branch `/api/dedup` (true) o Code legacy (false). Rollout 10% → 50% → 100% controlado desde `/admin/sistema/flags`.

## Decisión

**Diferir implementación a sesión dedicada con análisis completo del flow dedup real.**

## Motivos

### 1. Topología real del dedup en workflow general

Análisis empírico completo (lectura código JS via API n8n, 16/05/2026 noche):

```
Evaluar Pre-Clasificacion
  → Check Duplicado Supabase (Code, construye dedup_query string + dedup_method)
    → Check Duplicados Unificado (Code V8 12/05/2026, EJECUTA dedup en 3 tablas)
      → ¿Es Duplicado? (IF sobre isDuplicate)
        → output[0] (true): drop duplicate
        → output[1] (false): Obtener Proyectos Activos → continúa flow main
```

**`Check Duplicado Supabase`** (id `2fb311e3-b10d-492c-96ef-04fb28adf9af`) solo construye la query string. Cuerpo:

```javascript
const fileHash = item.fileHash || '';
let dedup_query = null;
let dedup_method = null;
if (fileHash) {
  dedup_query = `file_hash=eq.${encodeURIComponent(fileHash)}&select=...`;
  dedup_method = 'file_hash';
} else if (emailMessageId) {
  dedup_query = `email_message_id=eq.${encodeURIComponent(emailMessageId)}&original_filename=eq.${encodeURIComponent(fileName)}&...`;
  dedup_method = 'email_message_id';
}
return { json: { ...item, dedup_query, dedup_method } };
```

**`Check Duplicados Unificado`** (sin id fijo, name-based) es el dedup real V8. Hace `Promise.all` 3 tablas paralelas vía `this.helpers.httpRequest`:

```javascript
const tables = ['invoices', 'quotes', 'documents'];
const results = await Promise.all(tables.map(async (table) => {
  const rows = await this.helpers.httpRequest({
    method: 'GET',
    url: `${SUPABASE_URL}/rest/v1/${table}?${dedupQuery}`,
    headers: { apikey: SUPABASE_SECRET, Authorization: `Bearer ${SUPABASE_SECRET}` },
    json: true, timeout: 10000, ignoreHttpStatusErrors: true,
  });
  return { table, found: rows.length > 0, row: rows[0] ?? null };
}));
const match = matchInv?.row || matchQuotes?.row || matchDocs?.row || null;
// ... isDuplicate, duplicateReason, linkedDocId
```

### 2. Diferencias críticas vs `/api/dedup` actual

| Aspecto | n8n `Check Duplicados Unificado` | `/api/dedup` Next.js |
|---|---|---|
| Input | `dedup_query` string (file_hash OR email_message_id+filename) | `{file_hash}` solo |
| Tablas | 3: invoices + quotes + documents | 2: invoices + documents |
| Soft-deleted | Devuelve `deleted_at` informativo (no filtra) | Filtra `is.null` (no devuelve) |
| Response | `{isDuplicate, duplicateReason, linkedDocId, isOwnDocument, isUpdatedVersion}` | `{is_duplicate, existing_id, table, created_at, source}` |
| Auth | `$env.SUPABASE_SECRET_KEY` | Bearer `CATHEDRAL_INTERNAL_TOKEN` |
| Timeout | 10s por tabla | sin timeout explícito (default fetch) |

**Cutover drop-in NO es posible hoy.** Requiere ampliar `/api/dedup`:

1. Body acepta `{file_hash?, email_message_id?, filename?}` con OR lookup
2. Buscar en 3 tablas (añadir `quotes`)
3. Devolver shape compatible: `{is_duplicate, duplicate_reason, linked_doc_id, table, dedup_method}`
4. Política soft-deleted: devolver con flag `was_deleted` (cliente decide)

### 2. Validador encontró 2 refutaciones críticas al diseño shadow

Auditoría con `n8n-doc-validator` agente especializado devolvió:

- **GitHub issue #18197 (n8n)**: `$('Check Duplicado Supabase').first().json` puede fallar cuando se accede desde branch paralelo no descendiente directo. Regresión documentada en n8n 2.20.
- **Bug en código JS shadow**: usar `$input.first().json` en modo `runOnceForEachItem` devuelve siempre item[0] en vez del item actual. Bug silencioso que habría loggeado N veces los mismos datos.

Plus complicaciones:
- HTTP Request por defecto reemplaza `$json` con response → pérdida de contexto legacy
- Code nodes NO pueden acceder credentials n8n (token Bearer requeriría hardcodear o env var en Docker n8n)
- Workarounds (Set node intermedio + modificar `/api/dedup` para echo-back) añaden fragilidad

### 3. Workflow productivo crítico

`FwpGF7L2GbFB84kL` procesa 100% de emails Cathedral (3 cuentas Gmail) cada 5 min. Cualquier regresión bloquea entrada de datos al sistema fiscal (facturas, presupuestos, modelos 303/111). Histórico:

- 14/05/2026: workflow general bloqueado 7 días silente (incidente ENOSPC) → 55GB liberados, watchdog 3 capas
- 15/05/2026: IF malformado ruteaba todo a GPT-4o (10× más caro) 24h sin detectar
- 15/05/2026: draft/active n8n perdió 47 min al no entender modelo de versiones

Estos incidentes demuestran que tocar el workflow productivo sin análisis exhaustivo del flow completo y plan de rollback genera regresiones costosas.

## Plan diferido (próxima sesión dedicada)

### Prerequisitos antes de la sesión

1. **Análisis completo del flow dedup actual** en `FwpGF7L2GbFB84kL`:
   - Identificar TODOS los nodos involucrados: "Check Duplicado Supabase" → "Check Duplicados Unificado" → "¿Es Duplicado?" → ramas
   - Mapear inputs/outputs exactos de cada uno
   - Detectar nodos con `dedup_query`, `dedup_method`, `is_duplicate`, `existing_id` en sus payloads
2. **Dataset golden 50 facturas**:
   - Snapshot estado actual de cada factura (file_hash, supplier_match, project assignment, table destination)
   - Reprocesar las 50 después del cutover y comparar diffs
3. **Plan rollback explícito**:
   - Snapshot completo del workflow JSON antes de cualquier PATCH
   - Comando exacto para restaurar (`POST /rest/workflows/{id}/activate` con versionId previo)
   - Tiempo objetivo de rollback: <2 minutos

### Pasos pre-cutover (próxima sesión)

**Paso 1 — Ampliar `/api/dedup` a paridad funcional**:

```typescript
// app/api/dedup/route.ts (refactor)
const BodySchema = z.object({
  file_hash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  email_message_id: z.string().max(200).optional(),
  filename: z.string().max(500).optional(),
}).refine(d => d.file_hash || (d.email_message_id && d.filename), {
  message: 'Requiere file_hash O (email_message_id + filename)'
})

// Buscar en 3 tablas paralelas (añadir quotes)
const [invoicesRes, quotesRes, documentsRes] = await Promise.all([...])

// Response shape compatible n8n legacy
return Response.json({
  is_duplicate: bool,
  duplicate_reason: string | null,
  linked_doc_id: string | null,
  table: 'invoices' | 'quotes' | 'documents' | null,
  was_deleted: bool,        // soft-deleted flag (cliente decide)
  dedup_method: 'file_hash' | 'email_message_id',
  source: 'cathedral-dedup-v2',  // bump version
})
```

**Paso 2 — Cutover progresivo con feature flag**:

```
... → Evaluar Pre-Clasificacion → Check Duplicado Supabase (legacy, intacto, construye query)
                                        ↓
                              Check Flag Dedup (HTTP /api/feature-flag-check?key=use_dedup_endpoint&subject_id={file_hash})
                                        ↓
                              IF should_use=true
                              │              │
                              ▼              ▼
                       HTTP /api/dedup v2   Check Duplicados Unificado (legacy)
                              │              │
                              └──→ Normalize Output (Set) ←──┘
                                        ↓
                              ¿Es Duplicado? → ...
```

**Paso 3 — Rollout activado via `/admin/sistema/flags`**:
- `use_dedup_endpoint`: enabled=true, rollout_pct=10 (primer día)
- 24h monitor: comparar tasa duplicados detectados vs baseline
- pct=50 (segundo día)
- pct=100 (tercer día)

**Paso 4 — Cleanup**:
- Sesión dedicada: eliminar nodos `Check Flag Dedup` + IF + branch legacy
- Reconectar `Check Duplicado Supabase → HTTP /api/dedup v2` directo
- Eliminar `Check Duplicados Unificado` Code legacy

**Paso 5 — Mismo patrón para `/api/fuzzy-supplier` y `/api/decide-table`**:
- Cada uno requiere análisis empírico topología legacy (Nodo "Buscar Fuzzy Match", "Decidir Tabla Destino")
- Repetir pasos 1-4 secuencialmente, no en paralelo
- 1 utility cutover = 1 sesión dedicada estimada (~3-5h)

### Por qué no shadow comparison

Para endpoints SIMPLES (2 queries Supabase indexadas, sin lógica fuzzy), shadow comparison añade complejidad sin valor proporcional. Si el endpoint tiene bug, lo detectamos cuando el ratio de duplicados detectados cambia anormalmente vs baseline (alertable desde `/admin/sistema`). Bajar `rollout_pct` a 0 desde la UI = rollback en segundos.

Para endpoints COMPLEJOS (fuzzy matching, decide-table con reglas corroboración) sí evaluar shadow comparison antes de cutover, porque las divergencias son más sutiles.

## Consecuencias

### Positivas

- Infraestructura lista para cutover (endpoints + flags + UI admin + endpoint feature-flag-check)
- ADR documenta análisis correcto del flow dedup actual
- Próxima sesión arranca con prerequisitos claros, no análisis from-scratch
- Sin riesgo a workflow productivo hoy

### Negativas

- Migración no completa hoy
- El sistema sigue usando Code nodes legacy para dedup, fuzzy supplier, decide-table
- Coste: latencia n8n→Supabase directa actual vs proxy via Vercel (sin diferencia significativa para 1-5 emails/h)

## Referencias

- ADR-0001 Arquitectura procesamiento facturas
- ADR-0002 Hosting endpoint Vercel Hobby + Fluid Compute
- `cathedral-incidente-disco-14maig.md` (incidente ENOSPC)
- `cathedral-sesion-15maig-handoff.md` (IF malformado + draft/active)
- GitHub n8n issue #18197 (referencia cross-branch)
- n8n docs `runOnceForEachItem` vs `runOnceForAllItems`
