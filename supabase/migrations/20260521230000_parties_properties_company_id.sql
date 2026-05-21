-- ============================================================================
-- Cathedral Group — Bloque 0 drift fix: parties + properties multi-SL
-- (2026-05-21 sesión Plan A continuación)
--
-- Drift Bloque 0 confirmado por agente BD inventory (sesión 21/05 tarde):
-- 6 tablas sin company_id, 2 críticas: parties + properties (entidades
-- cross-empresa que deberían aislarse por SL multi-empresa).
--
-- Estado: ambas tablas con 0 rows actualmente, momento óptimo añadir
-- company_id sin necesidad de backfill complejo.
-- ============================================================================

SET lock_timeout = '3s';
SET statement_timeout = '60s';

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- parties: ADD company_id NOT NULL FK
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.parties
  ADD COLUMN IF NOT EXISTS company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-cca7ed1a1000';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'parties_company_id_fkey'
      AND table_name = 'parties'
  ) THEN
    ALTER TABLE public.parties
      ADD CONSTRAINT parties_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_parties_company_id ON public.parties(company_id);

-- ─────────────────────────────────────────────────────────────────────────
-- properties: ADD company_id NOT NULL FK
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-cca7ed1a1000';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'properties_company_id_fkey'
      AND table_name = 'properties'
  ) THEN
    ALTER TABLE public.properties
      ADD CONSTRAINT properties_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_properties_company_id ON public.properties(company_id);

-- ─────────────────────────────────────────────────────────────────────────
-- RLS per-company (sigue patrón Bloque 0 multi-empresa F2)
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.parties     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parties     FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.properties  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties  FORCE  ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.parties     TO authenticated;
GRANT ALL ON public.parties     TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.properties  TO authenticated;
GRANT ALL ON public.properties  TO service_role;

-- Policies SELECT/INSERT/UPDATE/DELETE per company membership
DROP POLICY IF EXISTS "parties select by company" ON public.parties;
CREATE POLICY "parties select by company" ON public.parties
  FOR SELECT TO authenticated USING (
    company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid() AND cm.revoked_at IS NULL)
  );

DROP POLICY IF EXISTS "parties write by company" ON public.parties;
CREATE POLICY "parties write by company" ON public.parties
  FOR ALL TO authenticated
  USING (
    company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid() AND cm.revoked_at IS NULL)
  )
  WITH CHECK (
    company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid() AND cm.revoked_at IS NULL)
  );

DROP POLICY IF EXISTS "parties service_role all" ON public.parties;
CREATE POLICY "parties service_role all" ON public.parties
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "properties select by company" ON public.properties;
CREATE POLICY "properties select by company" ON public.properties
  FOR SELECT TO authenticated USING (
    company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid() AND cm.revoked_at IS NULL)
  );

DROP POLICY IF EXISTS "properties write by company" ON public.properties;
CREATE POLICY "properties write by company" ON public.properties
  FOR ALL TO authenticated
  USING (
    company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid() AND cm.revoked_at IS NULL)
  )
  WITH CHECK (
    company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid() AND cm.revoked_at IS NULL)
  );

DROP POLICY IF EXISTS "properties service_role all" ON public.properties;
CREATE POLICY "properties service_role all" ON public.properties
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON COLUMN public.parties.company_id     IS 'FK companies — multi-SL isolation (sesión 21/05 fix Bloque 0 drift)';
COMMENT ON COLUMN public.properties.company_id  IS 'FK companies — multi-SL isolation (sesión 21/05 fix Bloque 0 drift)';

COMMIT;

NOTIFY pgrst, 'reload schema';
