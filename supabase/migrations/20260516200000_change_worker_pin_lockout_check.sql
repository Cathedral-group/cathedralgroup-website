-- Migration: change_worker_pin lockout check (audit 16/05/2026 noche)
--
-- Fix: RPC change_worker_pin permitía cambiar PIN cuando account locked.
-- Plus rate limit ausente en endpoint = brute-force change PIN viable
-- si attacker conocía actual (e.g. default 0000).
--
-- Endpoint /api/portal/trabajador/[token]/change-pin recibió rate limit
-- en commit 96e81ac (5/min IP+token). Esta migration añade lockout check
-- coherente con login_with_pin RPC.
--
-- Comportamiento post-fix:
--   - Si pin_locked_until > NOW() → ok:false, reason:pin_locked
--   - Cliente debe esperar hasta locked_until antes reintentar
--
-- Test empírico aplicado prod 16/05/2026 ~18:24 UTC:
--   1. UPDATE worker_portal_access SET pin_locked_until = NOW() + 5min
--   2. SELECT change_worker_pin(token, '0000', '1234')
--      → {ok:false, reason:pin_locked, locked_until:...}
--   3. Restore pin_locked_until = NULL → account desbloqueado

CREATE OR REPLACE FUNCTION public.change_worker_pin(p_token text, p_pin_actual text, p_pin_nuevo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_access RECORD;
  v_match BOOLEAN;
BEGIN
  IF p_pin_nuevo !~ '^[0-9]{4,6}$' THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'pin_format',
      'message', 'PIN debe ser 4-6 dígitos numéricos');
  END IF;
  IF p_pin_nuevo = '0000' THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'pin_default',
      'message', 'No puedes usar 0000 como PIN nuevo');
  END IF;

  SELECT id, pin_hash, pin_locked_until INTO v_access
  FROM worker_portal_access
  WHERE token = p_token AND revoked_at IS NULL
  LIMIT 1;

  IF v_access IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'token_not_found');
  END IF;

  -- Audit 16/05: NUEVO lockout check coherente con login-pin RPC.
  -- Si account locked, denegar cambio PIN aunque attacker conozca actual.
  IF v_access.pin_locked_until IS NOT NULL AND v_access.pin_locked_until > NOW() THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'pin_locked',
      'message', 'Account bloqueada temporalmente por intentos fallidos. Reintentar tras desbloqueo.',
      'locked_until', v_access.pin_locked_until);
  END IF;

  v_match := (v_access.pin_hash = crypt(p_pin_actual, v_access.pin_hash));
  IF NOT v_match THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'pin_actual_wrong',
      'message', 'PIN actual incorrecto');
  END IF;

  UPDATE worker_portal_access
  SET pin_hash = crypt(p_pin_nuevo, gen_salt('bf', 10)),
      pin_set_at = NOW(),
      pin_attempts = 0,
      pin_locked_until = NULL
  WHERE id = v_access.id;

  RETURN jsonb_build_object('ok', TRUE);
END;
$function$;
