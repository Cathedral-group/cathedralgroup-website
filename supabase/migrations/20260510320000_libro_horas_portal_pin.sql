-- Roadmap libro horas — PIN portal trabajador
--
-- David decide:
-- - PIN inicial '0000' universal para todos los trabajadores
-- - Trabajador puede cambiarlo desde la app
-- - Admin puede resetear a 0000 desde panel
--
-- Seguridad:
--   - bcrypt hash (pgcrypto crypt()) — NUNCA guardar plaintext
--   - Cookie httpOnly 90 días tras login (no pedir PIN cada vez en mismo móvil)
--   - Lockout tras 5 intentos fallidos durante 15 min
--   - pin_set_at NULL = nunca lo cambió (sigue siendo 0000) → mostrar aviso UI

-- 1. Asegurar pgcrypto disponible
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Columnas PIN en worker_portal_access
ALTER TABLE worker_portal_access
  ADD COLUMN IF NOT EXISTS pin_hash TEXT,
  ADD COLUMN IF NOT EXISTS pin_set_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pin_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pin_locked_until TIMESTAMPTZ;

COMMENT ON COLUMN worker_portal_access.pin_hash IS
  'Hash bcrypt del PIN (4-6 dígitos). Default 0000 al crear el token. '
  'NUNCA guardar plaintext. Trabajador puede cambiarlo desde portal.';
COMMENT ON COLUMN worker_portal_access.pin_set_at IS
  'NULL = nunca lo cambió (sigue siendo 0000 default). UI muestra aviso de cambio.';
COMMENT ON COLUMN worker_portal_access.pin_attempts IS
  'Contador intentos fallidos. Reset a 0 tras login exitoso.';
COMMENT ON COLUMN worker_portal_access.pin_locked_until IS
  'Si > NOW(): cuenta bloqueada por exceso intentos. Reset por admin o tras pasar tiempo.';

-- 3. Backfill PIN '0000' para tokens activos existentes (que no tengan pin_hash)
UPDATE worker_portal_access
SET pin_hash = crypt('0000', gen_salt('bf', 10))
WHERE pin_hash IS NULL AND revoked_at IS NULL;

-- 4. Modificar create_worker_portal_token para que asigne PIN '0000' por defecto
CREATE OR REPLACE FUNCTION create_worker_portal_token(
  p_employee_id UUID,
  p_company_id UUID,
  p_created_by_email TEXT,
  p_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_new_token TEXT;
  v_id UUID;
BEGIN
  IF p_employee_id IS NULL OR p_company_id IS NULL THEN
    RAISE EXCEPTION 'employee_id y company_id son obligatorios';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM employees
    WHERE id = p_employee_id AND company_id = p_company_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Empleado no encontrado en esta empresa';
  END IF;

  -- Revocar tokens activos previos
  UPDATE worker_portal_access
  SET revoked_at = NOW(),
      revoked_by_email = p_created_by_email,
      revoked_reason = 'Reemplazado por nuevo token'
  WHERE employee_id = p_employee_id AND revoked_at IS NULL;

  v_new_token := gen_random_uuid()::text;

  INSERT INTO worker_portal_access (
    company_id, employee_id, token,
    expires_at, created_by_email, notes,
    pin_hash
  ) VALUES (
    p_company_id, p_employee_id, v_new_token,
    p_expires_at, p_created_by_email, p_notes,
    crypt('0000', gen_salt('bf', 10))
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'id', v_id,
    'token', v_new_token,
    'employee_id', p_employee_id,
    'expires_at', p_expires_at,
    'created_at', NOW(),
    'pin_default', '0000'
  );
END;
$$;

-- 5. RPC validar PIN (con tracking intentos + lockout)
CREATE OR REPLACE FUNCTION validate_worker_pin(
  p_token TEXT,
  p_pin TEXT,
  p_ip TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_access RECORD;
  v_match BOOLEAN;
BEGIN
  IF p_token IS NULL OR p_pin IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'missing_params');
  END IF;
  IF p_pin !~ '^[0-9]{4,6}$' THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'pin_format');
  END IF;

  SELECT id, pin_hash, pin_attempts, pin_locked_until, pin_set_at
  INTO v_access
  FROM worker_portal_access
  WHERE token = p_token AND revoked_at IS NULL
  LIMIT 1;

  IF v_access IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'token_not_found');
  END IF;

  -- Lockout activo
  IF v_access.pin_locked_until IS NOT NULL AND v_access.pin_locked_until > NOW() THEN
    RETURN jsonb_build_object(
      'ok', FALSE, 'reason', 'locked',
      'locked_until', v_access.pin_locked_until
    );
  END IF;

  -- Verificar hash bcrypt
  v_match := (v_access.pin_hash = crypt(p_pin, v_access.pin_hash));

  IF v_match THEN
    UPDATE worker_portal_access
    SET pin_attempts = 0, pin_locked_until = NULL
    WHERE id = v_access.id;
    RETURN jsonb_build_object(
      'ok', TRUE,
      'pin_is_default', (v_access.pin_set_at IS NULL)
    );
  END IF;

  -- Incrementar intentos, lockear si llega a 5
  UPDATE worker_portal_access
  SET pin_attempts = pin_attempts + 1,
      pin_locked_until = CASE
        WHEN pin_attempts + 1 >= 5 THEN NOW() + INTERVAL '15 minutes'
        ELSE NULL
      END
  WHERE id = v_access.id;

  RETURN jsonb_build_object(
    'ok', FALSE,
    'reason', 'pin_wrong',
    'attempts_left', GREATEST(0, 4 - v_access.pin_attempts)
  );
END;
$$;

COMMENT ON FUNCTION validate_worker_pin IS
  'Valida PIN contra hash bcrypt. Tracking intentos: 5 fallos → lockout 15 min. '
  'Devuelve pin_is_default=true si nunca lo cambió (= sigue siendo 0000).';

-- 6. RPC cambiar PIN (verificar actual + setear nuevo)
CREATE OR REPLACE FUNCTION change_worker_pin(
  p_token TEXT,
  p_pin_actual TEXT,
  p_pin_nuevo TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
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

  SELECT id, pin_hash INTO v_access
  FROM worker_portal_access
  WHERE token = p_token AND revoked_at IS NULL
  LIMIT 1;

  IF v_access IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'token_not_found');
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
$$;

COMMENT ON FUNCTION change_worker_pin IS
  'Cambia PIN del trabajador. Verifica PIN actual + valida formato + rechaza 0000.';

-- 7. RPC reset PIN (admin only)
CREATE OR REPLACE FUNCTION reset_worker_pin(
  p_employee_id UUID,
  p_admin_email TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  UPDATE worker_portal_access
  SET pin_hash = crypt('0000', gen_salt('bf', 10)),
      pin_set_at = NULL,  -- vuelve a marcarse como default
      pin_attempts = 0,
      pin_locked_until = NULL,
      notes = COALESCE(notes, '') || E'\nPIN reset por ' || p_admin_email || ' el ' || NOW()::text
  WHERE employee_id = p_employee_id AND revoked_at IS NULL;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'pin_reset_to', '0000',
    'employee_id', p_employee_id
  );
END;
$$;

COMMENT ON FUNCTION reset_worker_pin IS
  'Admin resetea PIN trabajador a 0000 (cuando trabajador lo olvida).';
