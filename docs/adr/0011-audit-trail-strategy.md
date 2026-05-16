# ADR-0011: Audit Trail Strategy Cathedral

- **Status**: Accepted
- **Date**: 2026-05-16
- **Deciders**: David Vieco + Claude

## Contexto

Sesión 16/05 introdujo cambios mutables al sistema via 3 vectores:

1. **Server Actions** (`app/actions/feature-flags.ts`) — admin web UI `/admin/sistema/flags` con auth Supabase + email allow-list.
2. **API endpoints admin** (`/api/admin/feature-flag-toggle|batch|delete`) — auth Bearer `CATHEDRAL_INTERNAL_TOKEN` (scripts/CI/curl/Hetzner cron).
3. **Cron Hetzner** (`hetzner-cron-health-check.sh`) — service account propietario `system_notifications`.

Sin audit log unificado, queda ambigüedad post-incidente: ¿quién cambió flag X cuando producción rompió?

## Decisión

**Tabla compartida `admin_audit_log`** (preexistente sesión 28 abril) extendida con CHECK constraint que acepta valores para los 3 vectores.

### Schema

```sql
admin_audit_log (
  id uuid PK,
  user_email text NOT NULL,
  action text NOT NULL CHECK (action IN (
    -- Vectores preexistentes (admin web manual + login)
    'create', 'update', 'delete', 'restore', 'permanent_delete', 'login',
    -- Server Actions (web UI + Supabase Auth)
    'flag_create', 'flag_update', 'flag_delete',
    -- API endpoints admin (Bearer token)
    'flag_toggle_api', 'flag_batch_api', 'flag_delete_api'
  )),
  table_name text NOT NULL,
  record_id text NOT NULL,
  ip text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
)
```

### Identificación origen

| Vector | `user_email` | Distinción visible |
|---|---|---|
| Web UI admin (Server Actions) | email real allow-list (`d.vieco@...`) | acción `flag_create/update/delete` (sin `_api`) |
| curl / scripts / CI | placeholder `api:cathedral-internal-token` | acción `flag_*_api` |
| Hetzner cron (futuro) | placeholder `cron:hetzner-cathedral-n8n` | acciones cron-specific |

`ip` extraído de `x-forwarded-for` (Vercel garantiza primer IP real, no falsificable).

### Patrón implementación

#### Server Actions

```typescript
// app/actions/feature-flags.ts
async function auditAction(email: string, action: string, key: string) {
  try {
    const supabase = createAdminSupabaseClient()
    await supabase.from('admin_audit_log').insert({
      user_email: email,
      action,
      table_name: 'feature_flags',
      record_id: key,
      ip: null, // Server Action no expone req.ip directo
    })
  } catch (err) {
    console.warn('[audit] failed (non-blocking):', err)
  }
}
```

#### API endpoints

```typescript
// app/api/admin/feature-flag-toggle/route.ts
try {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
  await supabase.from('admin_audit_log').insert({
    user_email: 'api:cathedral-internal-token',
    action: 'flag_toggle_api',
    table_name: 'feature_flags',
    record_id: key,
    ip,
  })
} catch (err) {
  console.warn('[flag-toggle] audit failed (non-blocking):', err)
}
```

### Garantías

1. **Non-blocking**: try/catch silencioso. Si audit INSERT falla, acción usuario sigue completándose. Audit trail es "best effort" — diseño consciente para no degradar UX.

2. **Eventual consistency**: `await` interno garantiza Next.js no cierre contexto antes INSERT completar (verificado doc-validator). Post-fix CHECK constraint, INSERT siempre persiste si BD viva.

3. **CHECK constraint extensible**: futuros vectores audit añaden valor al constraint via migration. Patrón ya verificado sesión 16/05.

4. **No PII sensible**: solo `user_email` + `record_id` + `ip`. Cambios concretos (qué `rollout_pct` se puso) NO loggeados en `admin_audit_log` — solo "alguien modificó X" + "quién". Detalle delta consultable via tabla destino (`feature_flags.updated_at` + `updated_by`).

### Visibility

Endpoint `GET /api/admin/audit-log-recent?table=X&limit=N` lista entries.

CLI helper `scripts/cutover-step.mjs <flag> audit` filtra por flag específico:

```bash
node scripts/cutover-step.mjs use_dedup_endpoint audit
# === AUDIT LOG 'use_dedup_endpoint' (últimos 20) ===
#   Total: 7 entries
#   2026-05-16 19:13:18  flag_toggle_api  api:cathedral-internal-token  ip=20.169.74.16
#   2026-05-16 19:12:42  flag_toggle_api  api:cathedral-internal-token  ip=87.124.249.35
```

### Bug crítico detectado + fix

`72b8247` Server Actions audit log fallaba **silentemente** durante ~1h porque CHECK constraint original (`'create','update','delete','restore','permanent_delete','login'`) NO aceptaba `'flag_create'` etc. → INSERT lanzaba 23514 → caught try/catch → console.warn → audit no persistía.

Detectado por `doc-validator` agente durante audit ronda 13. Fix migration `20260516210000_audit_log_action_check_extend.sql` aplicada producción + verificado empíricamente INSERT real funciona post-fix.

**Lección**: try/catch silencioso es bueno para no degradar UX, malo para detectar bugs constraint. Mitigación: tests E2E (commit `f55909b` smoke E2E audit) que verifican audit row aparece tras action.

## Alternativas descartadas

### Tabla audit log separada por vector
- **Razón rechazo**: fragmentación queries cross-vector ("¿cualquier cambio flag X últimas 24h?"). Sin valor diferenciador.

### Trigger BD audit log
- **Razón rechazo**: trigger no captura `user_email` ni `ip` (info viene from request HTTP, no SQL context). Application-level audit es necesario.

### Inmutable audit log signed (estilo blockchain / Verifactu hash chain)
- **Razón rechazo**: complejidad alta (gen_salt, signing key rotation, verify chain integrity). Cathedral 3 admins humanos confianza alta — overhead injustified. Re-considerar si compliance fiscal Verifactu requiere chain integrity propio (ADR-0003 lo aborda en Q3-Q4 2026).

### Persistir delta cambios (old_value → new_value) en `metadata jsonb`
- **Razón rechazo**: schema actual no tiene `metadata`. Añadir column requiere migration + cambiar todos consumers audit. `feature_flags.updated_at + updated_by` ya provee delta consultable via JOIN cuando necesario.

## Coste mantenimiento

- Añadir nuevo audit action: 1 línea CHECK constraint extension migration + 1 línea action handler INSERT
- Storage admin_audit_log: ~200 bytes/row × ~10 rows/día Cathedral = ~2 MB/año (negligible)
- Cleanup retention: futuro cron DELETE rows > 1 año (no urgente)

## Referencias

- ADR-0009 Testing + performance strategy
- ADR-0010 Deployment + rollback strategy
- `app/actions/feature-flags.ts`
- `app/api/admin/feature-flag-toggle|batch|delete/route.ts`
- `supabase/migrations/20260516210000_audit_log_action_check_extend.sql`
- `scripts/cutover-step.mjs audit` action
