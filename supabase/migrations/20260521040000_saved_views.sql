-- ============================================================================
-- saved_views — Vistas guardadas por usuario admin Cathedral
-- ----------------------------------------------------------------------------
-- Patrón Linear/Notion: cada admin guarda combinaciones de filtros+ordenación
-- por contexto (documents, invoices, fiscal, etc). Compartibles dentro de la
-- misma company vía flag is_shared.
--
-- Multi-empresa: company_id NOT NULL + RLS+FORCE. user_email leído desde JWT
-- (auth.jwt()->>'email') — los endpoints admin usan service_role (bypass RLS)
-- pero las policies son belt-and-suspenders por si en el futuro algún cliente
-- llamase con sesión authenticated.
--
-- 4 acciones extendidas a admin_audit_log.action constraint para que el
-- endpoint /api/documentos/bulk pueda loggear bulk_reclassify / bulk_set_party
-- / bulk_confirm / bulk_reject / bulk_trash / bulk_restore sin violar el CHECK.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.saved_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  context TEXT NOT NULL DEFAULT 'documents',
  filters JSONB NOT NULL,
  is_shared BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT saved_views_name_len CHECK (char_length(name) BETWEEN 1 AND 100),
  CONSTRAINT saved_views_description_len CHECK (description IS NULL OR char_length(description) <= 500),
  CONSTRAINT saved_views_context_check CHECK (context IN ('documents','invoices','quotes','personal','fiscal'))
);

ALTER TABLE public.saved_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_views FORCE ROW LEVEL SECURITY;

-- RLS: solo el admin que la creó ve la suya, + cualquiera de la company si is_shared=true
DROP POLICY IF EXISTS saved_views_select ON public.saved_views;
CREATE POLICY saved_views_select ON public.saved_views FOR SELECT
  USING (
    company_id = (auth.jwt()->'app_metadata'->>'active_company_id')::uuid
    AND (user_email = (auth.jwt()->>'email') OR is_shared = true)
  );

DROP POLICY IF EXISTS saved_views_insert ON public.saved_views;
CREATE POLICY saved_views_insert ON public.saved_views FOR INSERT
  WITH CHECK (
    company_id = (auth.jwt()->'app_metadata'->>'active_company_id')::uuid
    AND user_email = (auth.jwt()->>'email')
  );

DROP POLICY IF EXISTS saved_views_update ON public.saved_views;
CREATE POLICY saved_views_update ON public.saved_views FOR UPDATE
  USING (
    company_id = (auth.jwt()->'app_metadata'->>'active_company_id')::uuid
    AND user_email = (auth.jwt()->>'email')
  );

DROP POLICY IF EXISTS saved_views_delete ON public.saved_views;
CREATE POLICY saved_views_delete ON public.saved_views FOR DELETE
  USING (
    company_id = (auth.jwt()->'app_metadata'->>'active_company_id')::uuid
    AND user_email = (auth.jwt()->>'email')
  );

GRANT ALL PRIVILEGES ON TABLE public.saved_views TO service_role, authenticated;
REVOKE ALL ON TABLE public.saved_views FROM anon;

CREATE INDEX IF NOT EXISTS idx_saved_views_user_context
  ON public.saved_views(user_email, context, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_saved_views_shared
  ON public.saved_views(company_id, context) WHERE is_shared = true;

-- Trigger updated_at automático (patrón Cathedral)
CREATE OR REPLACE FUNCTION public.saved_views_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_saved_views_updated_at ON public.saved_views;
CREATE TRIGGER trg_saved_views_updated_at
  BEFORE UPDATE ON public.saved_views
  FOR EACH ROW
  EXECUTE FUNCTION public.saved_views_touch_updated_at();

COMMENT ON TABLE public.saved_views IS
  'Vistas guardadas por usuario admin Cathedral (filtros + ordenación + columnas). Patrón Linear/Notion. Multi-empresa via company_id + RLS+FORCE. Endpoint /api/documentos/saved-views.';

-- ============================================================================
-- Extender admin_audit_log.action con códigos bulk para /api/documentos/bulk
-- ----------------------------------------------------------------------------
-- El CHECK actual no permite 'bulk_*'. Sin esto el endpoint reventará al
-- intentar loggear. Añadimos los 6 valores que el endpoint produce.
-- ============================================================================

ALTER TABLE public.admin_audit_log
  DROP CONSTRAINT IF EXISTS admin_audit_log_action_check;

ALTER TABLE public.admin_audit_log
  ADD CONSTRAINT admin_audit_log_action_check
  CHECK (action IN (
    'create',
    'update',
    'delete',
    'restore',
    'permanent_delete',
    'permanent_delete_bulk',
    'login',
    'flag_create',
    'flag_update',
    'flag_delete',
    'flag_toggle_api',
    'flag_batch_api',
    'flag_delete_api',
    'reprocess_trigger',
    'bulk_reclassify',
    'bulk_set_party',
    'bulk_confirm',
    'bulk_reject',
    'bulk_trash',
    'bulk_restore'
  ));

NOTIFY pgrst, 'reload schema';
