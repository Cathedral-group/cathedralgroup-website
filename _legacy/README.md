# `_legacy/`

Material histórico que se conserva para trazabilidad pero **no es operativo**.

Si llegas aquí buscando algo activo, casi seguro estás en el sitio equivocado:
mira en la raíz del repo o en las migraciones canónicas (`supabase/migrations/`).

## `supabase-migrations/`

Migraciones SQL muy tempranas (marzo 2026, sin fecha en el nombre) usadas
antes de que el repo adoptase el patrón canónico `supabase/migrations/<YYYYMMDDHHMMSS>_<nombre>.sql`.
Conservadas como historial de la fase inicial del schema. **NO se ejecutan**:
toda la BD activa pasa por `supabase/migrations/`.

Movidas a `_legacy/` el 2026-04-30 (sesión 31, Y13 punch-list).
