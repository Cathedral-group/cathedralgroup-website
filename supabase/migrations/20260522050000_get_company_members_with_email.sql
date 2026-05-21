-- ============================================================================
-- Cathedral Group — RPC socios con email (21/05/2026 noche)
--
-- Selector socios en calendario (asignar tareas/reuniones). El schema auth NO
-- está expuesto vía PostgREST, así que un SECURITY DEFINER hace el JOIN
-- company_members + auth.users y devuelve solo los socios de la empresa.
-- ============================================================================

SET lock_timeout = '3s';
SET statement_timeout = '30s';

BEGIN;

CREATE OR REPLACE FUNCTION public.get_company_members_with_email(p_company_id uuid)
RETURNS TABLE(user_id uuid, email text, role text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT cm.user_id, u.email::text, cm.role
  FROM public.company_members cm
  JOIN auth.users u ON u.id = cm.user_id
  WHERE cm.company_id = p_company_id
    AND cm.revoked_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.get_company_members_with_email(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_company_members_with_email(uuid) TO service_role;

COMMENT ON FUNCTION public.get_company_members_with_email IS
  'Socios activos de una empresa con email (JOIN auth.users). service_role only. Sesión 21/05.';

COMMIT;

NOTIFY pgrst, 'reload schema';
