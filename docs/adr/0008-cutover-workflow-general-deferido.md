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

### 1. El nodo "Check Duplicado Supabase" NO es el dedup decisivo

Análisis empírico (lectura código JS del nodo via API n8n):

```javascript
// Code "Check Duplicado Supabase" — solo construye query string
const fileHash = item.fileHash || '';
let dedup_query = null;
let dedup_method = null;
if (fileHash) {
  dedup_query = `file_hash=eq.${encodeURIComponent(fileHash)}&select=...`;
  dedup_method = 'file_hash';
} else if (emailMessageId) {
  dedup_query = `email_message_id=eq.${encodeURIComponent(emailMessageId)}&...`;
  dedup_method = 'email_message_id';
}
return { json: { ...item, dedup_query, dedup_method } };
```

Este nodo **NO ejecuta el dedup** — solo prepara la query. El dedup real lo hace un nodo siguiente (probablemente `Check Duplicados Unificado` que ejecuta el HTTP request a Supabase).

Sustituir solo "Check Duplicado Supabase" por `/api/dedup` **no haría nada útil** porque `/api/dedup` ya ejecuta la query completa (no devuelve un query string). El cutover correcto debe afectar al nodo que actualmente ejecuta el dedup, no al que prepara la query.

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

### Estrategia recomendada

**Cutover progresivo con feature flag** (no shadow comparison):

```
... → Evaluar Pre-Clasificacion → Check Flag Dedup (HTTP /api/feature-flag-check)
                                        ↓
                              IF should_use=true
                              │              │
                              ▼              ▼
                       /api/dedup HTTP    Check Duplicado + Check Duplicados Unificado (legacy)
                              │              │
                              └──→ Normalize Output ←──┘
                                        ↓
                              ¿Es Duplicado? → ...
```

Rollout activado via `/admin/sistema/flags`:
- `use_dedup_endpoint`: enabled=true, rollout_pct=10 (primer día)
- 24h monitor → pct=50
- 24h monitor → pct=100
- Sesión dedicada cleanup: eliminar nodos Code legacy

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
