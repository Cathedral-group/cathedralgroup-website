-- ============================================================
-- SECURITY HARDENING — Cathedral Group Admin
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

-- ── 1. AUDIT LOG ──────────────────────────────────────────
-- Registra cada acción write del admin (quién, qué, cuándo, desde qué IP)

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email  text        NOT NULL,
  action      text        NOT NULL CHECK (action IN ('create','update','delete','restore','permanent_delete','login')),
  table_name  text        NOT NULL,
  record_id   text,
  ip          text,
  created_at  timestamptz DEFAULT now()
);

-- Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_audit_log_user    ON admin_audit_log (user_email);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_table   ON admin_audit_log (table_name);

-- RLS activado: solo service_role puede escribir/leer (anon no tiene acceso)
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;


-- ── 2. RLS EN TODAS LAS TABLAS DE DATOS ──────────────────
-- Con RLS activado y sin políticas: anon key = acceso cero.
-- El service_role key del admin bypasea RLS automáticamente.
-- Esto bloquea cualquier intento de consultar la DB directamente
-- con la anon key visible en el navegador.

ALTER TABLE leads               ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients             ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects            ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices            ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE flipping_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE mortgages           ENABLE ROW LEVEL SECURITY;
ALTER TABLE operation_costs     ENABLE ROW LEVEL SECURITY;

-- Tablas adicionales (ejecutar solo si existen en tu proyecto)
-- ALTER TABLE project_phases       ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE quality_coefficients ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE catalog_items        ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE communications       ENABLE ROW LEVEL SECURITY;

-- ── NOTA ──────────────────────────────────────────────────
-- Si alguna tabla ya tenía políticas RLS que usabas para
-- acceso público (ej. portal de clientes con anon key),
-- NO ejecutes ALTER TABLE para esa tabla o añade su política
-- explícita antes. En este sistema todo el acceso va por
-- service_role, así que es seguro activar en todas.
-- ──────────────────────────────────────────────────────────
