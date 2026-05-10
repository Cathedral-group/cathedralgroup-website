-- Roadmap libro de horas — Fase 5 (gastos del día + foto avance + endpoint ITSS)
--
-- Añade:
--   1. time_records.foto_avance_path (opcional foto del avance del día)
--   2. Tabla worker_expense_items: dietas, kilometraje, material consumido apuntado por trabajador
--   3. Tabla itss_access_tokens: tokens dedicados read-only para Inspección de Trabajo
--   4. Vista vw_itss_time_records (datos sanitizados que ITSS puede consultar)

-- 1. Foto avance opcional en time_records
ALTER TABLE time_records
  ADD COLUMN IF NOT EXISTS foto_avance_path TEXT,
  ADD COLUMN IF NOT EXISTS foto_avance_bucket TEXT DEFAULT 'worker-receipts';

COMMENT ON COLUMN time_records.foto_avance_path IS
  'Roadmap libro_horas Fase 5 — path en Storage de la foto del avance de obra del día. '
  'Útil para clientes y auditoría ITSS. NULL si el trabajador no la añade.';

-- 2. Gastos del día: dietas, kilometraje, material consumido
CREATE TABLE IF NOT EXISTS worker_expense_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,

  fecha DATE NOT NULL,
  tipo TEXT NOT NULL
    CHECK (tipo IN ('dieta', 'kilometraje', 'material', 'aparcamiento', 'peaje', 'otro')),

  -- Para dieta/aparcamiento/peaje/otro
  importe NUMERIC(10,2),

  -- Para kilometraje
  km_recorridos NUMERIC(8,2),
  km_origen TEXT,
  km_destino TEXT,

  -- Para material consumido
  material_descripcion TEXT,
  material_cantidad NUMERIC(8,2),
  material_unidad TEXT, -- 'sacos', 'metros', 'kg', 'litros', 'unidades', etc.

  -- Adjunto opcional (foto justificante)
  attachment_id UUID REFERENCES worker_attachments(id) ON DELETE SET NULL,

  observaciones TEXT,
  fuente TEXT NOT NULL DEFAULT 'app_movil'
    CHECK (fuente IN ('app_movil', 'manual', 'importado')),

  -- Estado de revisión por admin
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'ignored', 'reimbursed')),
  reviewed_at TIMESTAMPTZ,
  reviewed_by_email TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_worker_expense_employee
  ON worker_expense_items (employee_id, fecha DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_worker_expense_project
  ON worker_expense_items (project_id, fecha DESC) WHERE deleted_at IS NULL AND project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_worker_expense_company_status
  ON worker_expense_items (company_id, status, fecha DESC) WHERE deleted_at IS NULL;

ALTER TABLE worker_expense_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_expense_items FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE worker_expense_items IS
  'Roadmap libro_horas Fase 5 — gastos del día apuntados por el trabajador desde el portal. '
  'tipo=dieta/kilometraje/material/aparcamiento/peaje/otro. status pending → confirmed/ignored '
  'tras revisión admin. Multi-empresa con RLS+FORCE.';

-- 3. ITSS: tokens dedicados read-only para Inspección de Trabajo
-- Cumplimiento nuevo RD registro horario: ITSS debe poder consultar SIN intervención del empresario.
CREATE TABLE IF NOT EXISTS itss_access_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),

  token TEXT UNIQUE NOT NULL, -- UUID v4

  inspector_nombre TEXT,        -- nombre/identificador del inspector (declarativo)
  inspector_dni TEXT,           -- DNI del inspector si lo aporta
  inspeccion_referencia TEXT,   -- nº expediente ITSS si aplica

  scope_employee_id UUID REFERENCES employees(id), -- limitar a un trabajador específico (opcional)
  scope_desde DATE,            -- limitar rango fechas
  scope_hasta DATE,

  expires_at TIMESTAMPTZ NOT NULL, -- ITSS tokens SIEMPRE expiran (max 30 días por defecto)
  revoked_at TIMESTAMPTZ,
  revoked_by_email TEXT,
  revoked_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_email TEXT NOT NULL,

  last_used_at TIMESTAMPTZ,
  last_used_ip TEXT,
  uses_count INT NOT NULL DEFAULT 0,
  access_log JSONB DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_itss_token
  ON itss_access_tokens (token) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_itss_company
  ON itss_access_tokens (company_id, created_at DESC);

ALTER TABLE itss_access_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE itss_access_tokens FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE itss_access_tokens IS
  'Roadmap libro_horas Fase 5 — tokens read-only que el admin genera para que un '
  'inspector ITSS consulte el registro horario. NUEVO RD obliga acceso sin intervención '
  'del empresario. Token UUID v4, expira 30 días por defecto. Audit log completo.';

-- RPC para validar y trackear acceso ITSS
CREATE OR REPLACE FUNCTION validate_itss_token(
  p_token TEXT,
  p_ip TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token RECORD;
BEGIN
  IF p_token IS NULL OR LENGTH(p_token) < 30 THEN
    RETURN jsonb_build_object('valid', FALSE, 'reason', 'token_invalid');
  END IF;

  SELECT iat.*, c.razon_social, c.cif
  INTO v_token
  FROM itss_access_tokens iat
  JOIN companies c ON c.id = iat.company_id
  WHERE iat.token = p_token
    AND iat.revoked_at IS NULL
    AND iat.expires_at > NOW()
  LIMIT 1;

  IF v_token IS NULL THEN
    RETURN jsonb_build_object('valid', FALSE, 'reason', 'not_found_or_expired');
  END IF;

  -- Update tracking
  UPDATE itss_access_tokens
  SET last_used_at = NOW(),
      last_used_ip = p_ip,
      uses_count = uses_count + 1,
      access_log = COALESCE(access_log, '[]'::jsonb) || jsonb_build_object(
        'at', NOW(),
        'ip', p_ip
      )
  WHERE id = v_token.id;

  RETURN jsonb_build_object(
    'valid', TRUE,
    'company_id', v_token.company_id,
    'company_razon_social', v_token.razon_social,
    'company_cif', v_token.cif,
    'scope_employee_id', v_token.scope_employee_id,
    'scope_desde', v_token.scope_desde,
    'scope_hasta', v_token.scope_hasta,
    'inspector_nombre', v_token.inspector_nombre,
    'expires_at', v_token.expires_at
  );
END;
$$;

COMMENT ON FUNCTION validate_itss_token IS
  'Valida un token ITSS y actualiza access_log. Devuelve scope autorizado. '
  'Cumplimiento nuevo RD: acceso ITSS sin intervención del empresario.';

-- Vista sanitizada para ITSS (sin datos sensibles innecesarios)
CREATE OR REPLACE VIEW vw_itss_time_records AS
SELECT
  tr.id,
  tr.company_id,
  tr.employee_id,
  e.nombre AS employee_nombre,
  e.nif AS employee_nif,
  tr.fecha,
  tr.horas_ordinarias,
  tr.horas_extra,
  tr.horas_nocturnas,
  (COALESCE(tr.horas_ordinarias,0) + COALESCE(tr.horas_extra,0) + COALESCE(tr.horas_nocturnas,0)) AS horas_total,
  tr.fuente,
  tr.worker_signed_at,
  tr.hash_registro,
  tr.modificado_at,
  tr.modificado_motivo,
  tr.created_at,
  p.code AS project_code
FROM time_records tr
LEFT JOIN employees e ON e.id = tr.employee_id
LEFT JOIN projects p ON p.id = tr.project_id
WHERE tr.deleted_at IS NULL;

COMMENT ON VIEW vw_itss_time_records IS
  'Vista sanitizada para Inspección de Trabajo: solo campos relevantes para verificar '
  'cumplimiento art. 34.9 ET. Sin observaciones (privadas) ni IP.';
