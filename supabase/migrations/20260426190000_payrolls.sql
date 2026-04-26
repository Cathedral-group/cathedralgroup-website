-- =====================================================
-- Sistema de NÓMINAS (Personal)
-- =====================================================
-- 3 tablas:
--   employees          → maestro de trabajadores
--   payrolls           → nómina individual (1 fila por trabajador/mes)
--   payroll_summaries  → resumen contable mensual de la gestoría
--
-- Filosofía: capturar TODOS los datos extraíbles del documento
-- (regla feedback_extraer_todo.md) — mejor 30 cols opcionales que perder info.

-- =====================================================
-- 1. EMPLOYEES (maestro de trabajadores)
-- =====================================================
CREATE TABLE IF NOT EXISTS employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identificación
  nombre               text NOT NULL,
  nif                  text NOT NULL UNIQUE,           -- DNI/NIE — único por persona
  num_afiliacion_ss    text,                            -- ej "32-10249132-85"

  -- Datos laborales actuales (los más recientes; histórico en payrolls)
  empresa_actual_cif   text,                            -- CIF de la empresa donde trabaja
  empresa_actual_nombre text,
  categoria_profesional text,                           -- ej "NIVEL VIII"
  grupo_cotizacion     int,                             -- ej 8, 10
  centro_trabajo       text,                            -- ej "PS. CASTELLANA 40"
  departamento         text,                            -- ej "Ord" (Ordinario)

  -- Antigüedad
  fecha_alta           date,                            -- alta en SS
  fecha_antiguedad     date,                            -- antigüedad reconocida
  fecha_baja           date,                            -- si causa baja

  -- Datos de contacto (opcional)
  email                text,
  telefono             text,
  direccion            text,

  -- Datos bancarios para pago de nómina
  iban                 text,
  banco                text,

  -- Tipo contrato (opcional, vendría de contratos firmados)
  tipo_contrato        text,                            -- "indefinido", "temporal", "obra"
  jornada              text,                            -- "completa", "parcial"
  horas_semanales      numeric,

  -- Auditoría
  notes                text,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now(),
  deleted_at           timestamptz
);

CREATE INDEX IF NOT EXISTS idx_employees_nif        ON employees (nif);
CREATE INDEX IF NOT EXISTS idx_employees_active     ON employees (deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_employees_empresa    ON employees (empresa_actual_cif);

-- =====================================================
-- 2. PAYROLLS (nómina individual)
-- =====================================================
CREATE TABLE IF NOT EXISTS payrolls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Vinculaciones
  employee_id          uuid REFERENCES employees(id) ON DELETE SET NULL,
  invoice_id           uuid REFERENCES invoices(id) ON DELETE SET NULL,  -- si vino vía invoices legacy

  -- ─── EMPRESA ───
  empresa_nombre       text NOT NULL,
  empresa_cif          text NOT NULL,
  empresa_domicilio    text,
  empresa_cp           text,
  empresa_localidad    text,
  empresa_cuenta_cotizacion_ss text,                    -- ej "28-2745463-66"

  -- ─── TRABAJADOR (snapshot del momento de la nómina) ───
  trabajador_nombre        text NOT NULL,
  trabajador_nif           text NOT NULL,
  trabajador_num_afiliacion_ss text,
  trabajador_categoria     text,                        -- "NIVEL VIII"
  trabajador_grupo_cotizacion int,
  trabajador_fecha_antiguedad date,
  trabajador_centro        text,
  trabajador_departamento  text,
  trabajador_codigo        text,                        -- código interno gestoría

  -- ─── PERÍODO ───
  periodo_desde            date NOT NULL,
  periodo_hasta            date NOT NULL,
  periodo_dias             int,
  periodo_horas            numeric,
  periodo_mes              int NOT NULL,                -- 1..12
  periodo_anio             int NOT NULL,                -- 2026
  tipo_periodo             text DEFAULT 'ordinario',    -- "ordinario","paga_extra","finiquito","atrasos"

  -- ─── DEVENGOS (lo que se ha ganado) ───
  salario_base             numeric DEFAULT 0,
  plus_actividad           numeric DEFAULT 0,
  plus_extrasalarial       numeric DEFAULT 0,
  plus_convenio            numeric DEFAULT 0,
  plus_antiguedad          numeric DEFAULT 0,
  plus_nocturnidad         numeric DEFAULT 0,
  plus_peligrosidad        numeric DEFAULT 0,
  plus_responsabilidad     numeric DEFAULT 0,
  incentivos               numeric DEFAULT 0,
  comisiones               numeric DEFAULT 0,
  horas_extra_normales     numeric DEFAULT 0,
  horas_extra_estructurales numeric DEFAULT 0,
  paga_extra_prorrata      numeric DEFAULT 0,
  paga_extra_completa      numeric DEFAULT 0,           -- en mes de paga extra
  vacaciones_no_disfrutadas numeric DEFAULT 0,
  otras_percepciones_salariales numeric DEFAULT 0,
  -- No salariales
  dietas                   numeric DEFAULT 0,
  plus_transporte          numeric DEFAULT 0,
  kilometraje              numeric DEFAULT 0,
  indemnizaciones          numeric DEFAULT 0,
  otras_percepciones_no_salariales numeric DEFAULT 0,
  -- Detalle libre (para conceptos no estandarizados)
  devengos_extra_jsonb     jsonb,                       -- [{concepto, importe}]
  total_devengado          numeric NOT NULL,            -- A. TOTAL DEVENGADO

  -- ─── DEDUCCIONES (lo que se descuenta al trabajador) ───
  -- 1. Aportación trabajador a SS
  ss_cont_comunes_base     numeric,                     -- base sobre la que se aplica %
  ss_cont_comunes_pct      numeric,                     -- 4,85
  ss_cont_comunes_importe  numeric DEFAULT 0,
  ss_desempleo_base        numeric,
  ss_desempleo_pct         numeric,                     -- 1,55
  ss_desempleo_importe     numeric DEFAULT 0,
  ss_formacion_base        numeric,
  ss_formacion_pct         numeric,                     -- 0,10
  ss_formacion_importe     numeric DEFAULT 0,
  ss_horas_extra_fuerza_mayor_pct numeric,              -- 2,00
  ss_horas_extra_fuerza_mayor_importe numeric DEFAULT 0,
  ss_horas_extra_no_estructurales_pct numeric,          -- 4,70
  ss_horas_extra_no_estructurales_importe numeric DEFAULT 0,
  ss_solidaridad_pct       numeric,
  ss_solidaridad_importe   numeric DEFAULT 0,
  ss_total_trabajador      numeric DEFAULT 0,           -- TOTAL APORTACIONES SS

  -- 2. IRPF
  irpf_base                numeric,
  irpf_porcentaje          numeric,                     -- 8,66
  irpf_importe             numeric DEFAULT 0,

  -- 3. Otras deducciones
  anticipos                numeric DEFAULT 0,
  productos_especie        numeric DEFAULT 0,
  embargo_judicial         numeric DEFAULT 0,
  cuota_sindical           numeric DEFAULT 0,
  prestamos_empresa        numeric DEFAULT 0,
  otras_deducciones        numeric DEFAULT 0,
  deducciones_extra_jsonb  jsonb,                       -- [{concepto, importe}]

  total_deducciones        numeric NOT NULL,            -- B. TOTAL A DEDUCIR
  liquido_a_percibir       numeric NOT NULL,            -- A - B

  -- ─── BASES DE COTIZACIÓN ───
  base_cont_comunes        numeric,                     -- Base CC = mensual + prorrata
  base_cont_profesionales  numeric,                     -- Base CP
  base_irpf                numeric,                     -- Base sujeta a IRPF
  importe_remuneracion_mensual numeric,                 -- (componente de base CC)
  importe_prorrata_pagas_extras numeric,                -- (componente de base CC)

  -- ─── APORTACIÓN EMPRESA A SS (coste empresa, informativo) ───
  emp_cont_comunes_pct     numeric,                     -- 24,35
  emp_cont_comunes_importe numeric DEFAULT 0,
  emp_at_ep_pct            numeric,                     -- 6,70 (Accidentes + Enf. Profesional)
  emp_at_ep_importe        numeric DEFAULT 0,
  emp_desempleo_pct        numeric,                     -- 5,50
  emp_desempleo_importe    numeric DEFAULT 0,
  emp_formacion_pct        numeric,                     -- 0,60
  emp_formacion_importe    numeric DEFAULT 0,
  emp_fogasa_pct           numeric,                     -- 0,20
  emp_fogasa_importe       numeric DEFAULT 0,
  emp_horas_extra_importe  numeric DEFAULT 0,
  emp_solidaridad_importe  numeric DEFAULT 0,
  ss_total_empresa         numeric DEFAULT 0,           -- suma aportaciones empresa

  coste_total_empresa      numeric NOT NULL,            -- TOTAL DEVENGADO + SS EMPRESA

  -- ─── PAGO ───
  payment_status           text DEFAULT 'pendiente'
    CHECK (payment_status IN ('pendiente','pagada','parcial','cancelada')),
  payment_date             date,
  payment_method           text,                        -- "transferencia", etc.
  payment_iban_destino     text,                        -- IBAN del trabajador
  payment_referencia       text,                        -- ref bancaria

  -- ─── ARCHIVO ORIGINAL ───
  drive_url                text,
  drive_file_id            text,
  drive_page_in_pdf        int,                         -- si lote PDF, página de este trabajador (1-indexed)
  original_filename        text,
  file_hash                text,

  -- ─── ORIGEN ───
  source                   text DEFAULT 'manual',       -- 'manual','email_automatico','gestoria','migracion'
  email_message_id         text,
  email_account            text,
  email_from               text,
  email_subject            text,
  email_date               timestamptz,

  -- ─── IA / REVISIÓN ───
  ai_confidence            numeric,
  ai_razones               text[],                      -- §FECHA_*, §IMPORTE_*, §CALIDAD_*, §CAMPO_DUDOSO_*
  needs_review             boolean DEFAULT false,
  review_status            text DEFAULT 'pendiente'
    CHECK (review_status IN ('pendiente','revisado','confirmado','rechazado','error')),
  reviewed_at              timestamptz,
  reviewed_by              text,

  -- ─── EXTRA / FUTURO ───
  notes                    text,                        -- anotaciones manuales
  raw_extracted_jsonb      jsonb,                       -- datos crudos extraídos por GPT (todo lo que no encaja)
  modelo_111_trimestre     text,                        -- Q1/Q2/Q3/Q4 a la que corresponde IRPF
  modelo_190_anio          int,                         -- año al que aplica para 190

  -- Timestamps
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now(),
  deleted_at               timestamptz,

  -- Una nómina única por (trabajador, periodo) — evita duplicados
  CONSTRAINT payrolls_uniq_trab_periodo UNIQUE (trabajador_nif, periodo_desde, periodo_hasta, tipo_periodo)
);

CREATE INDEX IF NOT EXISTS idx_payrolls_employee   ON payrolls (employee_id);
CREATE INDEX IF NOT EXISTS idx_payrolls_nif        ON payrolls (trabajador_nif, periodo_anio DESC, periodo_mes DESC);
CREATE INDEX IF NOT EXISTS idx_payrolls_periodo    ON payrolls (periodo_anio, periodo_mes);
CREATE INDEX IF NOT EXISTS idx_payrolls_empresa    ON payrolls (empresa_cif, periodo_anio, periodo_mes);
CREATE INDEX IF NOT EXISTS idx_payrolls_active     ON payrolls (deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_payrolls_pago       ON payrolls (payment_status, periodo_hasta) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_payrolls_review     ON payrolls (review_status) WHERE deleted_at IS NULL AND review_status IN ('pendiente','error');
CREATE INDEX IF NOT EXISTS idx_payrolls_email_msg  ON payrolls (email_message_id) WHERE email_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payrolls_file_hash  ON payrolls (file_hash) WHERE file_hash IS NOT NULL;

-- =====================================================
-- 3. PAYROLL_SUMMARIES (resumen contable mensual de la gestoría)
-- =====================================================
CREATE TABLE IF NOT EXISTS payroll_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ─── IDENTIFICACIÓN ───
  empresa_nombre               text NOT NULL,
  empresa_cif                  text NOT NULL,
  empresa_codigo_gestoria      text,                    -- ej "34" en el listado
  cuenta_cotizacion_ss         text,                    -- ej "28274546366"
  centro_trabajo               text,
  periodo_mes                  int NOT NULL,
  periodo_anio                 int NOT NULL,

  -- ─── TOTALES (suma de todas las nóminas de ese mes/empresa) ───
  num_trabajadores             int,
  total_dias                   int,
  total_base_cont_comunes      numeric DEFAULT 0,
  total_base_cont_profesionales numeric DEFAULT 0,
  total_base_irpf              numeric DEFAULT 0,
  total_retribuciones          numeric DEFAULT 0,       -- bruto devengado
  total_deduccion_trabajador   numeric DEFAULT 0,       -- SS trabajador
  total_costes_especie         numeric DEFAULT 0,
  total_valor_especie          numeric DEFAULT 0,
  total_costes_empresa         numeric DEFAULT 0,       -- SS empresa
  total_retencion_irpf         numeric DEFAULT 0,
  total_otras_retenciones      numeric DEFAULT 0,
  total_liquido                numeric DEFAULT 0,

  -- Deducción por Formación Continua (FLC)
  deduccion_formacion_continua numeric DEFAULT 0,
  coste_flc_periodo            numeric DEFAULT 0,
  recargo_liquidacion          numeric DEFAULT 0,

  -- ─── DETALLE TRABAJADORES (snapshot del listado) ───
  trabajadores_detalle_jsonb   jsonb,                   -- [{nif, nombre, dias, base_cc, retribucion, ...}]

  -- ─── ARCHIVO ORIGINAL ───
  drive_url                    text,
  drive_file_id                text,
  original_filename            text,
  file_hash                    text,

  -- ─── ORIGEN ───
  source                       text DEFAULT 'manual',
  email_message_id             text,
  email_account                text,
  email_from                   text,
  email_subject                text,
  email_date                   timestamptz,

  -- ─── IA / REVISIÓN ───
  ai_confidence                numeric,
  ai_razones                   text[],
  needs_review                 boolean DEFAULT false,
  review_status                text DEFAULT 'pendiente'
    CHECK (review_status IN ('pendiente','revisado','confirmado','rechazado','error')),

  -- ─── EXTRA ───
  notes                        text,
  raw_extracted_jsonb          jsonb,

  -- Timestamps
  created_at                   timestamptz DEFAULT now(),
  updated_at                   timestamptz DEFAULT now(),
  deleted_at                   timestamptz,

  -- Un resumen único por (empresa, cuenta_cotizacion, mes, año)
  CONSTRAINT payroll_summaries_uniq UNIQUE (empresa_cif, cuenta_cotizacion_ss, periodo_anio, periodo_mes)
);

CREATE INDEX IF NOT EXISTS idx_payroll_summaries_periodo ON payroll_summaries (periodo_anio, periodo_mes);
CREATE INDEX IF NOT EXISTS idx_payroll_summaries_empresa ON payroll_summaries (empresa_cif);
CREATE INDEX IF NOT EXISTS idx_payroll_summaries_active  ON payroll_summaries (deleted_at) WHERE deleted_at IS NULL;

-- =====================================================
-- 4. updated_at triggers
-- =====================================================
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at_employees         ON employees;
DROP TRIGGER IF EXISTS set_updated_at_payrolls          ON payrolls;
DROP TRIGGER IF EXISTS set_updated_at_payroll_summaries ON payroll_summaries;

CREATE TRIGGER set_updated_at_employees         BEFORE UPDATE ON employees         FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_updated_at_payrolls          BEFORE UPDATE ON payrolls          FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_updated_at_payroll_summaries BEFORE UPDATE ON payroll_summaries FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =====================================================
-- 5. Refrescar PostgREST schema cache
-- =====================================================
NOTIFY pgrst, 'reload schema';
