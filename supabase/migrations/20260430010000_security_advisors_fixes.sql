-- Security advisors fixes (sesión 30, 30/04/2026 Madrid)
--
-- Tras el Bloque 1 SCHEMA legal (sesión 29) la auditoría Supabase devolvió:
--   2 ERROR security_definer_view (project_financials, vat_quarterly)
--   4 WARN SECURITY DEFINER functions invocables por anon/authenticated
--   9 WARN function_search_path_mutable
--
-- El admin panel siempre lee con createAdminSupabaseClient() (service_role)
-- por lo que ni el cambio a security_invoker ni los REVOKE afectan al CRUD
-- existente. service_role bypassa RLS y conserva permisos.

-- 1. Views: security_invoker = true → respetan RLS de las tablas subyacentes
--    (anon/authenticated quedan bloqueados por default-deny RLS de invoices)
ALTER VIEW public.project_financials SET (security_invoker = true);
ALTER VIEW public.vat_quarterly      SET (security_invoker = true);

-- 2. Funciones SECURITY DEFINER: revocar EXECUTE de roles públicos
--    mark_overdue_invoices: solo invocable por workflow n8n (service_role)
--    rls_auto_enable: event trigger DDL interno, no debe ser RPC público
REVOKE EXECUTE ON FUNCTION public.mark_overdue_invoices() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable()       FROM anon, authenticated, PUBLIC;

-- 3. Fijar search_path en funciones (previene shadow-table hijack via search_path)
ALTER FUNCTION public.check_login_rate_limit(p_ip text, p_max_attempts integer, p_window_minutes integer)
  SET search_path = public, pg_catalog;
ALTER FUNCTION public.cleanup_old_login_attempts()
  SET search_path = public, pg_catalog;
ALTER FUNCTION public.compute_portal_token_expiry(p_quote_status text, p_project_status text, p_project_end timestamp with time zone)
  SET search_path = public, pg_catalog;
ALTER FUNCTION public.email_audit_attempts_set_updated_at()
  SET search_path = public, pg_catalog;
ALTER FUNCTION public.generate_equality_pay_register(p_anio integer)
  SET search_path = public, pg_catalog;
ALTER FUNCTION public.refresh_quote_portal_expiry()
  SET search_path = public, pg_catalog;
ALTER FUNCTION public.refresh_quotes_on_project_change()
  SET search_path = public, pg_catalog;
ALTER FUNCTION public.trigger_payroll_link_employee()
  SET search_path = public, pg_catalog;
ALTER FUNCTION public.trigger_set_updated_at()
  SET search_path = public, pg_catalog;
