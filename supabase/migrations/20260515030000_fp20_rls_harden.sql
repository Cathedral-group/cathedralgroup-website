-- FP20 fix (15/05/2026): endurecer RLS policies always-true.
--
-- Antes:
--   project_phases.Allow all for authenticated (USING true, CHECK true) — cualquier user auth podía modificar
--   quotes.quotes_auth (USING true, CHECK true) — idem
--
-- Hoy NO hay endpoint browser que use client authenticated directamente
-- sobre estas tablas (todo va via service_role en route handlers). Aún así,
-- defense-in-depth: las policies ahora solo permiten authenticated si el
-- JWT contiene un email del allow-list Cathedral.
--
-- service_role NO se ve afectado (bypass RLS por design).

-- ============================================================
-- project_phases
-- ============================================================
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.project_phases;

CREATE POLICY "admin_authenticated_or_service_role" ON public.project_phases
  FOR ALL
  TO authenticated, service_role
  USING (
    (auth.jwt() ->> 'email') IN (
      'd.vieco@cathedralgroup.es',
      'jm.lozano@cathedralgroup.es',
      'j.rivera@cathedralgroup.es'
    )
  )
  WITH CHECK (
    (auth.jwt() ->> 'email') IN (
      'd.vieco@cathedralgroup.es',
      'jm.lozano@cathedralgroup.es',
      'j.rivera@cathedralgroup.es'
    )
  );

-- ============================================================
-- quotes
-- ============================================================
DROP POLICY IF EXISTS "quotes_auth" ON public.quotes;

CREATE POLICY "quotes_admin_authenticated_or_service_role" ON public.quotes
  FOR ALL
  TO authenticated, service_role
  USING (
    (auth.jwt() ->> 'email') IN (
      'd.vieco@cathedralgroup.es',
      'jm.lozano@cathedralgroup.es',
      'j.rivera@cathedralgroup.es'
    )
  )
  WITH CHECK (
    (auth.jwt() ->> 'email') IN (
      'd.vieco@cathedralgroup.es',
      'jm.lozano@cathedralgroup.es',
      'j.rivera@cathedralgroup.es'
    )
  );

-- ============================================================
-- Verificación: ninguna policy con qual=true sin role service_role
-- ============================================================
SELECT count(*) AS leaked_policies
FROM pg_policies
WHERE schemaname='public'
  AND tablename IN ('project_phases','quotes')
  AND (qual='true' OR with_check='true')
  AND NOT (roles::text[] @> ARRAY['service_role']);
