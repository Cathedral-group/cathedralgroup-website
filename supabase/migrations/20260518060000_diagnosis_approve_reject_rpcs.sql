-- ============================================
-- Migration: RPCs approve/reject agent_diagnoses
-- Fecha: 17/05/2026
-- Sesión Op 2 UI admin — David revisa diagnóstico agente + decide apply/reject
-- Validación doc-validator: 3 correcciones aplicadas:
--   1. auth.uid() NO email lookup (race condition + canonical Cathedral pattern)
--   2. reject NO tocar applied_by/applied_at (semántica errónea). Usar trigger_context JSONB
--   3. NO usar revert_plan para rejection_reason. Usar trigger_context JSONB
-- CHECK status agent_diagnoses ya incluye 'approved'+'rejected' (verificado empíricamente).
-- ============================================

CREATE OR REPLACE FUNCTION public.approve_diagnosis(p_diagnosis_id UUID)
RETURNS public.agent_diagnoses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.agent_diagnoses;
BEGIN
  IF NOT private.is_admin_email() THEN
    RAISE EXCEPTION 'Forbidden: admin only' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.agent_diagnoses
  SET status     = 'approved',
      applied    = TRUE,
      applied_by = auth.uid(),
      applied_at = NOW(),
      updated_at = NOW()
  WHERE id = p_diagnosis_id AND status = 'pending'
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Diagnosis % not found or not in pending status', p_diagnosis_id USING ERRCODE = 'no_data_found';
  END IF;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_diagnosis(
  p_diagnosis_id UUID,
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
  IF NOT private.is_admin_email() THEN
    RAISE EXCEPTION 'Forbidden: admin only' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.agent_diagnoses
  SET status         = 'rejected',
      applied        = FALSE,
      trigger_context = COALESCE(trigger_context, '{}'::jsonb) || jsonb_build_object(
                          'rejected_by', auth.uid(),
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

REVOKE EXECUTE ON FUNCTION public.approve_diagnosis(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reject_diagnosis(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_diagnosis(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reject_diagnosis(UUID, TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION public.approve_diagnosis(UUID) IS
  'Op 2 admin approves agent diagnosis. status=approved, applied=TRUE (semántica: admin aprobó, NO fix aplicado en repo). RPC PostgREST single row return.';

COMMENT ON FUNCTION public.reject_diagnosis(UUID, TEXT) IS
  'Op 2 admin rejects agent diagnosis. status=rejected, applied=FALSE. rejection_reason stored in trigger_context JSONB.';

COMMENT ON COLUMN public.agent_diagnoses.applied IS
  'TRUE = admin approved action via approve_diagnosis(). DOES NOT IMPLY fix deployed to repo. UI label: "Aprobado para aplicar".';
