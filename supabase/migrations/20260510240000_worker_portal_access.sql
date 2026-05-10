-- Roadmap libro de horas trabajadores — Capa 1 (portal trabajador)
--
-- Tabla worker_portal_access: token-based auth para trabajadores que apuntan
-- partes de horas desde portal /portal/trabajador/[token]. NO usa Supabase Auth
-- (aislamiento total respecto al panel admin).
--
-- Aislamiento de seguridad:
--   - El trabajador NO obtiene sesión Supabase
--   - Sin sesión → no puede acceder a /admin/* (que requiere allow-list + AAL2)
--   - Token UUID v4 (122 bits entropía, imposible de adivinar)
--   - Rotable + revocable individualmente por admin
--   - Solo 1 token activo por empleado a la vez (índice único parcial)
--
-- Patrón consistente con portal cliente existente (quotes.portal_token).

CREATE TABLE IF NOT EXISTS worker_portal_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

  token TEXT UNIQUE NOT NULL,

  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_by_email TEXT,
  revoked_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_email TEXT,

  last_used_at TIMESTAMPTZ,
  last_used_ip TEXT,
  last_used_user_agent TEXT,
  uses_count INT NOT NULL DEFAULT 0,

  notes TEXT
);

-- Solo 1 token activo (no revocado, no expirado) por empleado
CREATE UNIQUE INDEX IF NOT EXISTS idx_worker_portal_one_active
  ON worker_portal_access (employee_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_worker_portal_token
  ON worker_portal_access (token)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_worker_portal_company
  ON worker_portal_access (company_id, employee_id);

ALTER TABLE worker_portal_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_portal_access FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE worker_portal_access IS
  'Roadmap libro_horas Capa 1 — token-based auth para portal trabajador. '
  'NO usa Supabase Auth: aislamiento total del panel admin. UUID v4, rotable, '
  'revocable. Validación por query directa en API portal.';

COMMENT ON COLUMN worker_portal_access.token IS
  'UUID v4 generado vía gen_random_uuid(). Plaintext consistente con patrón '
  'quotes.portal_token. 122 bits entropía. Solo se muestra al admin tras crear.';

-- RPC create_worker_portal_token: revoca tokens activos previos + crea nuevo
CREATE OR REPLACE FUNCTION create_worker_portal_token(
  p_employee_id UUID,
  p_company_id UUID,
  p_created_by_email TEXT,
  p_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_token TEXT;
  v_id UUID;
BEGIN
  IF p_employee_id IS NULL OR p_company_id IS NULL THEN
    RAISE EXCEPTION 'employee_id y company_id son obligatorios';
  END IF;

  -- Validar que el empleado pertenece a la company
  IF NOT EXISTS (
    SELECT 1 FROM employees
    WHERE id = p_employee_id AND company_id = p_company_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Empleado no encontrado en esta empresa';
  END IF;

  -- Revocar tokens activos previos del empleado
  UPDATE worker_portal_access
  SET revoked_at = NOW(),
      revoked_by_email = p_created_by_email,
      revoked_reason = 'Reemplazado por nuevo token'
  WHERE employee_id = p_employee_id AND revoked_at IS NULL;

  -- Generar nuevo token (UUID v4 desde gen_random_uuid)
  v_new_token := gen_random_uuid()::text;

  INSERT INTO worker_portal_access (
    company_id, employee_id, token,
    expires_at, created_by_email, notes
  ) VALUES (
    p_company_id, p_employee_id, v_new_token,
    p_expires_at, p_created_by_email, p_notes
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'id', v_id,
    'token', v_new_token,
    'employee_id', p_employee_id,
    'expires_at', p_expires_at,
    'created_at', NOW()
  );
END;
$$;

COMMENT ON FUNCTION create_worker_portal_token IS
  'Crea un nuevo token portal trabajador, revocando cualquier token activo previo '
  'del mismo empleado. Devuelve el token plaintext (solo se muestra una vez al admin).';

-- RPC revoke_worker_portal_token: revoca explícitamente
CREATE OR REPLACE FUNCTION revoke_worker_portal_token(
  p_employee_id UUID,
  p_revoked_by_email TEXT,
  p_reason TEXT DEFAULT 'Revocación manual'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_revoked_count INT;
BEGIN
  UPDATE worker_portal_access
  SET revoked_at = NOW(),
      revoked_by_email = p_revoked_by_email,
      revoked_reason = p_reason
  WHERE employee_id = p_employee_id AND revoked_at IS NULL;

  GET DIAGNOSTICS v_revoked_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'employee_id', p_employee_id,
    'revoked_count', v_revoked_count,
    'revoked_at', NOW()
  );
END;
$$;

COMMENT ON FUNCTION revoke_worker_portal_token IS
  'Revoca todos los tokens activos del empleado. Útil cuando el trabajador '
  'deja la empresa o se sospecha filtración del link.';

-- RPC validate_and_track_worker_token: valida + actualiza last_used (idempotente)
-- Usado por el portal API en cada request para validar el token y trackear uso
CREATE OR REPLACE FUNCTION validate_and_track_worker_token(
  p_token TEXT,
  p_ip TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_access RECORD;
BEGIN
  IF p_token IS NULL OR LENGTH(p_token) < 10 THEN
    RETURN jsonb_build_object('valid', FALSE, 'reason', 'token_invalid');
  END IF;

  SELECT wpa.id AS access_id, wpa.employee_id, wpa.company_id,
         e.nombre AS emp_nombre, e.nif AS emp_nif, e.email AS emp_email
  INTO v_access
  FROM worker_portal_access wpa
  JOIN employees e ON e.id = wpa.employee_id AND e.deleted_at IS NULL
  WHERE wpa.token = p_token
    AND wpa.revoked_at IS NULL
    AND (wpa.expires_at IS NULL OR wpa.expires_at > NOW())
  LIMIT 1;

  IF v_access IS NULL THEN
    RETURN jsonb_build_object('valid', FALSE, 'reason', 'not_found_or_expired');
  END IF;

  -- Actualizar tracking (last_used)
  UPDATE worker_portal_access
  SET last_used_at = NOW(),
      last_used_ip = p_ip,
      last_used_user_agent = p_user_agent,
      uses_count = uses_count + 1
  WHERE id = v_access.access_id;

  RETURN jsonb_build_object(
    'valid', TRUE,
    'employee_id', v_access.employee_id,
    'company_id', v_access.company_id,
    'employee_nombre', v_access.emp_nombre,
    'employee_nif', v_access.emp_nif,
    'employee_email', v_access.emp_email,
    'token_id', v_access.access_id
  );
END;
$$;

COMMENT ON FUNCTION validate_and_track_worker_token IS
  'Valida un token portal trabajador y actualiza last_used. Devuelve datos del '
  'empleado si válido. Llamado por API portal en cada request. Idempotente.';
