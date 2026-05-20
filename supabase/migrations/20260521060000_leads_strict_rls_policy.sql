-- ============================================================================
-- Migration: 20260521060000_leads_strict_rls_policy.sql
-- ----------------------------------------------------------------------------
-- Reemplaza policy permisiva `Allow insert for everyone` (with_check=true)
-- por validación strict que cubre cada campo. Elimina advisor WARN
-- `rls_policy_always_true` sobre public.leads.
--
-- Defensa profundidad: endpoint `/api/contact` ya valida (Turnstile +
-- honeypot + rate limit + spam keywords). Esta policy es backstop BD por si
-- alguien bypasea endpoint usando publishable key directa.
--
-- Decisión arquitectural 8/05/2026 preservada: INSERT vía anon (no
-- service_role). Solo se endurece el CHECK constraint.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS "Allow insert for everyone" ON public.leads;

CREATE POLICY "leads_anon_insert_strict"
ON public.leads
FOR INSERT
TO anon
WITH CHECK (
  -- Campos obligatorios no vacíos
  length(trim(nombre)) BETWEEN 2 AND 100
  AND length(trim(email)) BETWEEN 5 AND 200
  AND email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  AND length(trim(mensaje)) BETWEEN 5 AND 5000
  -- Opcionales con tope longitud
  AND (tipo_proyecto IS NULL OR length(tipo_proyecto) <= 50)
  AND (zona IS NULL OR length(zona) <= 100)
  AND (phone IS NULL OR length(phone) <= 30)
  AND (presupuesto_rango IS NULL OR length(presupuesto_rango) <= 30)
  AND (metros_cuadrados IS NULL OR metros_cuadrados BETWEEN 1 AND 100000)
  -- Origen forzado (anon no puede falsificar valores admin)
  AND origen IN ('cathedralgroup.es', 'cathedralhouse.es', 'cathedralgroup-website.vercel.app')
  -- Campos admin BLOQUEADOS al anon (lead_status, score, assigned_to, notes…)
  AND lead_status IS NULL
  AND lead_score IS NULL
  AND assigned_to IS NULL
  AND notes IS NULL
  AND converted_client_id IS NULL
  AND deleted_at IS NULL
);

-- Mantener policy SELECT/UPDATE/DELETE inexistente para anon (solo service_role)

COMMENT ON POLICY "leads_anon_insert_strict" ON public.leads IS
  'Validación strict campos INSERT desde formulario contacto público. Reemplaza policy permisiva 21/05/2026. Defensa profundidad backstop tras endpoint /api/contact (Turnstile + honeypot + rate limit + spam filter).';

NOTIFY pgrst, 'reload schema';

COMMIT;
