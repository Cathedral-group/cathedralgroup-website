-- ============================================
-- Migration: refactor approve/reject RPCs accept p_admin_email param
-- Fecha: 17/05/2026
-- Sesión Op 2 UI admin — validator detectó bug crítico:
--   service_role client tiene auth.jwt() = NULL → is_admin_email() (lee auth.jwt) FALLA siempre
-- Fix:
--   1. Crear private.is_admin_email_for(text) que valida email pasado como param
--   2. RPCs aceptan p_admin_email + validan via is_admin_email_for()
--   3. API route Next.js extrae user.email del Supabase auth + passing param
-- Validado doc-validator (3 bugs críticos + 3 risks).
-- ============================================

-- Helper email-param validation (replica is_admin_email pero accept argument)
CREATE OR REPLACE FUNCTION private.is_admin_email_for(p_email TEXT)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(trim(coalesce(p_email, ''))) IN (
    'd.vieco@cathedralgroup.es',
    'jm.lozano@cathedralgroup.es',
    'j.rivera@cathedralgroup.es'
  )
$$;

REVOKE EXECUTE ON FUNCTION private.is_admin_email_for(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_admin_email_for(TEXT) TO authenticated, service_role;

-- DROP previous versions (1-param y 2-param)
DROP FUNCTION IF EXISTS public.approve_diagnosis(UUID);
DROP FUNCTION IF EXISTS public.reject_diagnosis(UUID, TEXT);

-- approve_diagnosis con p_admin_email param
CREATE OR REPLACE FUNCTION public.approve_diagnosis(
  p_diagnosis_id UUID,
  p_admin_email TEXT
)
RETURNS public.agent_diagnoses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.agent_diagnoses;
BEGIN
  IF NOT private.is_admin_email_for(p_admin_email) THEN
    RAISE EXCEPTION 'Forbidden: admin only (email %)', p_admin_email USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.agent_diagnoses
  SET status     = 'approved',
      applied    = TRUE,
      applied_by = COALESCE(auth.uid(), applied_by),
      applied_at = NOW(),
      updated_at = NOW(),
      trigger_context = COALESCE(trigger_context, '{}'::jsonb) || jsonb_build_object(
                          'approved_by_email', p_admin_email,
                          'approved_at', NOW()
                        )
  WHERE id = p_diagnosis_id AND status = 'pending'
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Diagnosis % not found or not in pending status', p_diagnosis_id USING ERRCODE = 'no_data_found';
  END IF;
  RETURN v_row;
END;
$$;

-- reject_diagnosis con p_admin_email param
CREATE OR REPLACE FUNCTION public.reject_diagnosis(
  p_diagnosis_id UUID,
  p_admin_email TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS public.agent_diagnoses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.agent_diagnoses;
BEGIN
  IF NOT private.is_admin_email_for(p_admin_email) THEN
    RAISE EXCEPTION 'Forbidden: admin only (email %)', p_admin_email USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.agent_diagnoses
  SET status         = 'rejected',
      applied        = FALSE,
      trigger_context = COALESCE(trigger_context, '{}'::jsonb) || jsonb_build_object(
                          'rejected_by_email', p_admin_email,
                          'rejected_at', NOW(),
                          'rejection_reason', p_reason
                        ),
      updated_at     = NOW()
  WHERE id = p_diagnosis_id AND status = 'pending'
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Diagnosis % not found or not in pending status', p_diagnosis_id USING ERRCODE = 'no_data_found';
  END IF;
  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_diagnosis(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reject_diagnosis(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_diagnosis(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reject_diagnosis(UUID, TEXT, TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION public.approve_diagnosis(UUID, TEXT) IS
  'Op 2 admin approves agent diagnosis. p_admin_email validado contra allowlist (service_role client). status=approved, applied=TRUE.';

COMMENT ON FUNCTION public.reject_diagnosis(UUID, TEXT, TEXT) IS
  'Op 2 admin rejects diagnosis. p_admin_email + p_reason. rejection_reason guardado en trigger_context JSONB.';
