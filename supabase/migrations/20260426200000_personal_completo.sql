-- ════════════════════════════════════════════════════════════════
-- SISTEMA COMPLETO DE PERSONAL — cumplimiento normativo español
-- ════════════════════════════════════════════════════════════════
-- Cubre obligaciones de:
--   AEAT (modelos 111/190/145, IRPF), TGSS (RNT/RLC, NAF, CCC),
--   Inspección Trabajo (ITSS), Estatuto Trabajadores, RDL 8/2019
--   (registro jornada), PRL (Ley 31/1995), RD 902/2020 (registro
--   retributivo), LOPDGDD (audit log).
--
-- Diseño "extraer todo" (regla feedback_extraer_todo.md).
-- ════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────
-- FASE 1 · CRÍTICO
-- ────────────────────────────────────────────────────────────────

-- 1.1 Ampliar tabla employees con campos para IRPF/SS/PRL/convenio
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS ccc_asignado                   text,
  ADD COLUMN IF NOT EXISTS epigrafe_at_ep                 text,
  ADD COLUMN IF NOT EXISTS codigo_contrato_sepe           text,
  ADD COLUMN IF NOT EXISTS jornada_porcentaje             numeric,
  -- Modelo 145 / IRPF
  ADD COLUMN IF NOT EXISTS situacion_familiar             int CHECK (situacion_familiar IN (1,2,3)),
  ADD COLUMN IF NOT EXISTS nif_conyuge                    text,
  ADD COLUMN IF NOT EXISTS conyuge_rentas_superiores_1500 boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS movilidad_geografica           boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS prolongacion_actividad         boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS discapacidad_grado             int CHECK (discapacidad_grado IN (0, 33, 65)),
  ADD COLUMN IF NOT EXISTS discapacidad_movilidad_reducida boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS prestamo_vivienda_anterior_2013 boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS pension_compensatoria_conyuge  numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS anualidades_alimentos_hijos    numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS residencia_ceuta_melilla       boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS fecha_firma_modelo_145         date,
  -- PRL
  ADD COLUMN IF NOT EXISTS apto_vigilancia_salud_fecha    date,
  ADD COLUMN IF NOT EXISTS apto_vigilancia_salud_proxima  date,
  ADD COLUMN IF NOT EXISTS formacion_prl_fecha            date,
  ADD COLUMN IF NOT EXISTS formacion_prl_horas            numeric,
  ADD COLUMN IF NOT EXISTS formacion_prl_archivo_url      text,
  -- Convenio
  ADD COLUMN IF NOT EXISTS convenio_colectivo_codigo_boe  text,
  ADD COLUMN IF NOT EXISTS convenio_colectivo_nombre      text,
  ADD COLUMN IF NOT EXISTS nivel_salarial_convenio        text,
  -- GDPR
  ADD COLUMN IF NOT EXISTS clausula_informativa_firmada_fecha date,
  ADD COLUMN IF NOT EXISTS consentimientos_especificos    jsonb;

-- 1.2 Contratos firmados
CREATE TABLE IF NOT EXISTS employee_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id              uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  -- Datos contrato
  tipo_contrato            text NOT NULL,                 -- "indefinido","temporal","obra","practicas","formacion","relevo","fijo_discontinuo"
  codigo_clave_sepe        text,                          -- ej "100" indefinido tiempo completo
  modalidad                text,                          -- "tiempo completo","parcial","fijo discontinuo"
  jornada_horas_semanales  numeric,
  jornada_porcentaje       numeric,
  fecha_inicio             date NOT NULL,
  fecha_fin                date,                           -- NULL si indefinido
  fecha_fin_periodo_prueba date,
  duracion_meses           int,
  -- Económico
  salario_bruto_anual      numeric,
  salario_mensual          numeric,
  num_pagas                int DEFAULT 14,
  paga_extra_prorrateada   boolean DEFAULT false,
  -- Categoría/convenio (snapshot al firmar)
  categoria_profesional    text,
  grupo_cotizacion         int,
  convenio_aplicable       text,
  centro_trabajo           text,
  funciones_descripcion    text,
  -- Tramitación SEPE / SS
  fecha_comunicacion_sepe  date,
  numero_comunicacion_sepe text,
  fecha_alta_ss            date,
  -- Documentos
  pdf_contrato_url         text,
  pdf_contrato_drive_id    text,
  copia_basica_entregada_fecha date,                       -- art. 8.4 ET — a representantes
  -- Renovaciones / extinción
  prorroga_de              uuid REFERENCES employee_contracts(id),
  fecha_extincion          date,
  causa_extincion          text,                           -- "fin_obra","despido_objetivo","disciplinario","baja_voluntaria","mutuo_acuerdo","jubilacion","muerte","ineptitud"
  finiquito_id             uuid,                           -- FK a finiquitos (definida más abajo)
  -- Estado
  estado                   text DEFAULT 'vigente'
    CHECK (estado IN ('vigente','prorrogado','finalizado','rescindido','novado')),
  -- Notas/IA/auditoría
  notes                    text,
  source                   text DEFAULT 'manual',
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now(),
  deleted_at               timestamptz
);
CREATE INDEX IF NOT EXISTS idx_contracts_employee  ON employee_contracts (employee_id, fecha_inicio DESC);
CREATE INDEX IF NOT EXISTS idx_contracts_estado    ON employee_contracts (estado) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_contracts_active    ON employee_contracts (deleted_at) WHERE deleted_at IS NULL;

-- 1.3 Registro de jornada (RDL 8/2019)
CREATE TABLE IF NOT EXISTS time_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id              uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  fecha                    date NOT NULL,
  hora_entrada             time,
  hora_salida              time,
  pausas                   jsonb,                          -- [{inicio, fin, motivo}]
  horas_ordinarias         numeric,                        -- calculado
  horas_extra              numeric DEFAULT 0,
  horas_nocturnas          numeric DEFAULT 0,
  observaciones            text,
  -- Inalterabilidad (firma criptográfica para garantizar legitimidad ante ITSS)
  hash_registro            text,                           -- hash SHA-256 de los datos al insertar
  fuente                   text DEFAULT 'manual'
    CHECK (fuente IN ('manual','app_movil','biometrico','tarjeta','importado')),
  registrado_por           text,                           -- email usuario admin que registró si manual
  -- Modificación posterior (cualquier cambio queda trazado)
  modificado_motivo        text,
  modificado_at            timestamptz,
  modificado_por           text,
  -- Auditoría
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now(),
  deleted_at               timestamptz,
  -- Un único registro por empleado/día
  CONSTRAINT time_records_unique_day UNIQUE (employee_id, fecha)
);
CREATE INDEX IF NOT EXISTS idx_time_records_employee  ON time_records (employee_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_time_records_fecha     ON time_records (fecha DESC);
CREATE INDEX IF NOT EXISTS idx_time_records_active    ON time_records (deleted_at) WHERE deleted_at IS NULL;

-- 1.4 Justificantes pago de nómina (cumple obligación firma art. 29 ET)
CREATE TABLE IF NOT EXISTS payroll_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_id               uuid NOT NULL REFERENCES payrolls(id) ON DELETE CASCADE,
  employee_id              uuid REFERENCES employees(id) ON DELETE SET NULL,
  fecha_transferencia      date NOT NULL,
  importe                  numeric NOT NULL,
  iban_origen              text,
  iban_destino             text,
  banco_origen             text,
  banco_destino            text,
  referencia_bancaria      text,
  concepto_transferencia   text,
  -- Justificantes
  justificante_pdf_url     text,
  justificante_drive_id    text,
  recibo_firmado_url       text,                           -- nómina firmada por trabajador (físico/electrónico)
  metodo_firma             text,                           -- "presencial","electronica","transferencia"
  fecha_firma              date,
  -- Reconciliación con extracto bancario (futuro)
  bank_transaction_id      uuid,
  reconciliado             boolean DEFAULT false,
  -- Auditoría
  notes                    text,
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now(),
  deleted_at               timestamptz
);
CREATE INDEX IF NOT EXISTS idx_payroll_payments_payroll  ON payroll_payments (payroll_id);
CREATE INDEX IF NOT EXISTS idx_payroll_payments_employee ON payroll_payments (employee_id, fecha_transferencia DESC);
CREATE INDEX IF NOT EXISTS idx_payroll_payments_active   ON payroll_payments (deleted_at) WHERE deleted_at IS NULL;

-- 1.5 Registro retributivo (RD 902/2020 — OBLIGATORIO TODAS las empresas)
CREATE TABLE IF NOT EXISTS equality_pay_register (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_cif              text NOT NULL,
  empresa_nombre           text NOT NULL,
  periodo_anio             int NOT NULL,
  fecha_calculo            date DEFAULT CURRENT_DATE,
  -- Agregaciones por sexo + grupo (cumple normativa)
  grupo_profesional        text NOT NULL,                  -- categoría / nivel / puesto
  sexo                     text CHECK (sexo IN ('hombre','mujer','no_informado')),
  num_personas             int,
  -- Salario base
  salario_base_media       numeric,
  salario_base_mediana     numeric,
  -- Complementos salariales
  complementos_media       numeric,
  complementos_mediana     numeric,
  -- Percepciones extrasalariales
  extrasalariales_media    numeric,
  extrasalariales_mediana  numeric,
  -- TOTAL
  total_retribucion_media  numeric,
  total_retribucion_mediana numeric,
  -- Auditoría / publicación
  publicado_a_representantes boolean DEFAULT false,
  fecha_publicacion        date,
  documento_url            text,
  notes                    text,
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now(),
  deleted_at               timestamptz
);
CREATE INDEX IF NOT EXISTS idx_equality_pay_periodo ON equality_pay_register (empresa_cif, periodo_anio);

-- ────────────────────────────────────────────────────────────────
-- FASE 2 · ALTO
-- ────────────────────────────────────────────────────────────────

-- 2.1 Bajas IT (incapacidad temporal)
CREATE TABLE IF NOT EXISTS it_leaves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id              uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  -- Tipo
  contingencia             text NOT NULL                   -- "comun","accidente_trabajo","enfermedad_profesional","maternidad","paternidad","cuidado_menor","riesgo_embarazo","lactancia"
    CHECK (contingencia IN ('comun','accidente_trabajo','enfermedad_profesional','maternidad','paternidad','cuidado_menor','riesgo_embarazo','lactancia')),
  -- Fechas
  fecha_baja               date NOT NULL,
  fecha_alta               date,
  duracion_dias            int,                            -- calculado
  -- Documentos (3 tipos: baja, confirmaciones, alta)
  parte_baja_url           text,
  parte_baja_drive_id      text,
  partes_confirmacion      jsonb,                          -- [{fecha, url, drive_id}]
  parte_alta_url           text,
  parte_alta_drive_id      text,
  -- Diagnóstico (si lo tiene la empresa, aunque normalmente no por privacidad)
  cie10_codigo             text,
  cie10_descripcion        text,
  -- Pago durante baja
  dias_pago_empresa        int,                            -- normalmente 4-15 según contingencia
  dias_pago_mutua          int,
  importe_subsidio_diario  numeric,
  -- Tramitación SS
  fecha_envio_red          date,
  numero_expediente_ss     text,
  mutua                    text,
  -- Estado
  estado                   text DEFAULT 'activa'
    CHECK (estado IN ('activa','finalizada','prorrogada','agotada')),
  -- Auditoría
  notes                    text,
  source                   text DEFAULT 'manual',
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now(),
  deleted_at               timestamptz
);
CREATE INDEX IF NOT EXISTS idx_it_leaves_employee   ON it_leaves (employee_id, fecha_baja DESC);
CREATE INDEX IF NOT EXISTS idx_it_leaves_estado     ON it_leaves (estado) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_it_leaves_active     ON it_leaves (deleted_at) WHERE deleted_at IS NULL;

-- 2.2 Vacaciones devengadas / disfrutadas
CREATE TABLE IF NOT EXISTS vacation_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id              uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  anio                     int NOT NULL,
  -- Devengo (mín 30 días naturales/año art. 38 ET)
  dias_devengados          numeric,                        -- prorrateado si entró/salió a mitad año
  dias_disfrutados         numeric DEFAULT 0,
  dias_pendientes          numeric,                        -- calculado
  dias_acumulados_anteriores numeric DEFAULT 0,
  -- Datos del disfrute
  fecha_inicio             date,
  fecha_fin                date,
  estado                   text DEFAULT 'planificado'
    CHECK (estado IN ('planificado','aprobado','disfrutado','rechazado','liquidado')),
  motivo_rechazo           text,
  -- Documentos
  solicitud_url            text,
  aprobacion_url           text,
  -- Auditoría
  notes                    text,
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now(),
  deleted_at               timestamptz
);
CREATE INDEX IF NOT EXISTS idx_vacations_employee_anio  ON vacation_records (employee_id, anio);
CREATE INDEX IF NOT EXISTS idx_vacations_active         ON vacation_records (deleted_at) WHERE deleted_at IS NULL;

-- 2.3 Finiquitos / liquidaciones (art. 49 ET)
CREATE TABLE IF NOT EXISTS finiquitos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id              uuid NOT NULL REFERENCES employees(id) ON DELETE SET NULL,
  contract_id              uuid REFERENCES employee_contracts(id) ON DELETE SET NULL,
  -- Causa baja (claves SEPE)
  fecha_baja               date NOT NULL,
  causa_baja_codigo        text,                           -- "51"=fin obra, "52"=fin obra/serv, "54"=despido objetivo, etc
  causa_baja_descripcion   text,
  -- Componentes liquidación
  salario_pendiente        numeric DEFAULT 0,
  vacaciones_no_disfrutadas_dias numeric DEFAULT 0,
  vacaciones_no_disfrutadas_importe numeric DEFAULT 0,
  paga_extra_prorrata      numeric DEFAULT 0,
  horas_extra_pendientes   numeric DEFAULT 0,
  indemnizacion_dias_x_anio int,                           -- 20 días/año despido objetivo, 33 improcedente, etc
  indemnizacion_importe    numeric DEFAULT 0,
  otros_conceptos          numeric DEFAULT 0,
  otros_conceptos_detalle  jsonb,                          -- [{concepto, importe}]
  total_devengado          numeric NOT NULL,
  -- Deducciones
  retencion_irpf           numeric DEFAULT 0,
  ss_trabajador            numeric DEFAULT 0,
  total_deducciones        numeric DEFAULT 0,
  liquido_a_percibir       numeric NOT NULL,
  -- Documentos
  documento_pdf_url        text,
  documento_drive_id       text,
  firmado                  boolean DEFAULT false,
  fecha_firma              date,
  no_conforme              boolean DEFAULT false,
  presencia_representante  boolean DEFAULT false,
  representante_nombre     text,
  -- Certificado empresa SEPE (Certific@2)
  certificado_empresa_url  text,
  certificado_empresa_drive_id text,
  fecha_envio_certific2    date,
  -- Pago
  fecha_pago               date,
  importe_pagado           numeric,
  iban_destino             text,
  -- Auditoría
  notes                    text,
  source                   text DEFAULT 'manual',
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now(),
  deleted_at               timestamptz
);
CREATE INDEX IF NOT EXISTS idx_finiquitos_employee ON finiquitos (employee_id, fecha_baja DESC);
CREATE INDEX IF NOT EXISTS idx_finiquitos_active   ON finiquitos (deleted_at) WHERE deleted_at IS NULL;

-- FK pendiente desde employee_contracts
ALTER TABLE employee_contracts
  ADD CONSTRAINT IF NOT EXISTS employee_contracts_finiquito_fkey
  FOREIGN KEY (finiquito_id) REFERENCES finiquitos(id) ON DELETE SET NULL;

-- 2.4 Modelos fiscales presentados (AEAT)
CREATE TABLE IF NOT EXISTS tax_filings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_cif              text NOT NULL,
  empresa_nombre           text,
  modelo                   text NOT NULL                   -- "111","190","216","296","303","390","347","349","115","180"
    CHECK (modelo IN ('111','190','216','296','303','390','347','349','115','180','100','200','202')),
  ejercicio                int NOT NULL,
  periodo                  text,                           -- "Q1","Q2","Q3","Q4","M01"..."M12","ANUAL"
  fecha_presentacion       date,
  fecha_limite             date,
  -- Importes
  importe_a_ingresar       numeric DEFAULT 0,
  importe_a_devolver       numeric DEFAULT 0,
  base_total               numeric,
  retencion_total          numeric,
  -- Documentos
  modelo_pdf_url           text,
  modelo_drive_id          text,
  justificante_aeat_url    text,
  csv_aeat                 text,                           -- código verificación sede AEAT
  -- Estado
  estado                   text DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente','presentado','complementario','sustitutivo','sancionado')),
  -- Auditoría
  notes                    text,
  source                   text DEFAULT 'manual',
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now(),
  deleted_at               timestamptz,
  CONSTRAINT tax_filings_uniq UNIQUE (empresa_cif, modelo, ejercicio, periodo)
);
CREATE INDEX IF NOT EXISTS idx_tax_filings_empresa  ON tax_filings (empresa_cif, ejercicio, periodo);
CREATE INDEX IF NOT EXISTS idx_tax_filings_modelo   ON tax_filings (modelo, ejercicio);
CREATE INDEX IF NOT EXISTS idx_tax_filings_active   ON tax_filings (deleted_at) WHERE deleted_at IS NULL;

-- 2.5 Liquidaciones SS presentadas (RNT/RLC mensuales)
CREATE TABLE IF NOT EXISTS ss_filings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_cif              text NOT NULL,
  cuenta_cotizacion        text NOT NULL,
  ejercicio                int NOT NULL,
  mes                      int NOT NULL CHECK (mes BETWEEN 1 AND 12),
  fecha_presentacion       date,
  fecha_cargo              date,
  -- Documentos
  rnt_url                  text,                           -- Relación Nominal Trabajadores
  rnt_drive_id             text,
  rlc_url                  text,                           -- Recibo Liquidación Cotizaciones
  rlc_drive_id             text,
  fdi_url                  text,                           -- Fichero Datos Informe (bajas IT)
  -- Importes
  importe_total            numeric,
  bonificaciones           numeric DEFAULT 0,
  recargos                 numeric DEFAULT 0,
  -- Estado
  estado                   text DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente','presentada','cargada','aplazada','sancionada')),
  -- Auditoría
  notes                    text,
  source                   text DEFAULT 'manual',
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now(),
  deleted_at               timestamptz,
  CONSTRAINT ss_filings_uniq UNIQUE (cuenta_cotizacion, ejercicio, mes)
);
CREATE INDEX IF NOT EXISTS idx_ss_filings_empresa ON ss_filings (empresa_cif, ejercicio, mes);
CREATE INDEX IF NOT EXISTS idx_ss_filings_active  ON ss_filings (deleted_at) WHERE deleted_at IS NULL;

-- 2.6 Documentos PRL (Ley 31/1995)
CREATE TABLE IF NOT EXISTS prl_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Tipo de documento
  tipo                     text NOT NULL                   -- "plan_prevencion","evaluacion_riesgos","planificacion_actividad","formacion","vigilancia_salud","accidente","investigacion_accidente","concierto_spa","memoria_anual","auditoria"
    CHECK (tipo IN ('plan_prevencion','evaluacion_riesgos','planificacion_actividad','formacion','vigilancia_salud','accidente','investigacion_accidente','concierto_spa','memoria_anual','auditoria','otros')),
  -- Vinculación (puede ser empresa-wide o por empleado)
  employee_id              uuid REFERENCES employees(id) ON DELETE SET NULL,
  empresa_cif              text,
  centro_trabajo           text,
  -- Datos
  titulo                   text NOT NULL,
  fecha_documento          date NOT NULL,
  vigencia_hasta           date,
  realizado_por            text,                           -- "interno","SPA Quirónprevención", etc
  -- Documento
  archivo_url              text,
  archivo_drive_id         text,
  archivo_filename         text,
  -- Vigilancia salud — extras
  apto                     boolean,                        -- si es vigilancia salud
  restricciones            text,
  -- Accidentes — extras
  fecha_accidente          date,
  baja_resultante          boolean,
  delta_t                  text,                           -- "leve","grave","muy_grave","mortal"
  parte_accidente_url      text,
  -- Auditoría
  notes                    text,
  source                   text DEFAULT 'manual',
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now(),
  deleted_at               timestamptz
);
CREATE INDEX IF NOT EXISTS idx_prl_employee  ON prl_documents (employee_id) WHERE employee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prl_tipo      ON prl_documents (tipo, fecha_documento DESC);
CREATE INDEX IF NOT EXISTS idx_prl_active    ON prl_documents (deleted_at) WHERE deleted_at IS NULL;

-- 2.7 Modelo 145 histórico (cambios situación familiar trabajador)
CREATE TABLE IF NOT EXISTS employee_family_situation_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id              uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  fecha_efecto             date NOT NULL,
  -- Snapshot completo modelo 145
  situacion_familiar       int CHECK (situacion_familiar IN (1,2,3)),
  nif_conyuge              text,
  conyuge_rentas_superiores_1500 boolean,
  movilidad_geografica     boolean,
  prolongacion_actividad   boolean,
  discapacidad_grado       int,
  discapacidad_movilidad_reducida boolean,
  prestamo_vivienda_anterior_2013 boolean,
  pension_compensatoria_conyuge numeric,
  anualidades_alimentos_hijos numeric,
  residencia_ceuta_melilla boolean,
  -- Hijos / ascendientes (snapshot)
  hijos_jsonb              jsonb,                          -- [{nif, nombre, fecha_nacimiento, discapacidad, computa}]
  ascendientes_jsonb       jsonb,                          -- [{nif, nombre, fecha_nacimiento, discapacidad, conviviente}]
  -- Documento firmado
  modelo_145_pdf_url       text,
  modelo_145_drive_id      text,
  fecha_firma              date,
  -- Auditoría
  notes                    text,
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now(),
  deleted_at               timestamptz
);
CREATE INDEX IF NOT EXISTS idx_family_history_employee ON employee_family_situation_history (employee_id, fecha_efecto DESC);

-- ────────────────────────────────────────────────────────────────
-- FASE 3 · MEDIO
-- ────────────────────────────────────────────────────────────────

-- 3.1 Permisos retribuidos (art. 37 ET, ampliados RDL 5/2023)
CREATE TABLE IF NOT EXISTS leave_permits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id              uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  tipo                     text NOT NULL                   -- "matrimonio","fallecimiento_familiar","accidente_familiar","cuidado_familiar","mudanza","examen","sufragio","lactancia","cuidado_menor_grave_enfermedad","fuerza_mayor"
    CHECK (tipo IN ('matrimonio','fallecimiento_familiar','accidente_familiar','cuidado_familiar','mudanza','examen','sufragio','lactancia','cuidado_menor_grave_enfermedad','fuerza_mayor','otros')),
  fecha_inicio             date NOT NULL,
  fecha_fin                date NOT NULL,
  dias_naturales           int,
  dias_laborables          int,
  retribuido               boolean DEFAULT true,
  motivo_descripcion       text,
  parentesco               text,                           -- si aplica
  -- Documentos
  solicitud_url            text,
  justificante_url         text,
  justificante_drive_id    text,
  estado                   text DEFAULT 'aprobado'
    CHECK (estado IN ('solicitado','aprobado','rechazado','disfrutado')),
  -- Auditoría
  notes                    text,
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now(),
  deleted_at               timestamptz
);
CREATE INDEX IF NOT EXISTS idx_leave_permits_employee ON leave_permits (employee_id, fecha_inicio DESC);
CREATE INDEX IF NOT EXISTS idx_leave_permits_active   ON leave_permits (deleted_at) WHERE deleted_at IS NULL;

-- 3.2 Registro horas extra (art. 35.5 ET — comunicación mensual)
CREATE TABLE IF NOT EXISTS overtime_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id              uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  ejercicio                int NOT NULL,
  mes                      int NOT NULL CHECK (mes BETWEEN 1 AND 12),
  -- Totales mes
  total_horas_extra        numeric,
  total_horas_estructurales numeric,
  total_horas_fuerza_mayor numeric,
  importe_total            numeric,
  -- Comunicaciones obligatorias
  comunicacion_trabajador_url text,
  comunicacion_trabajador_fecha date,
  comunicacion_representantes_url text,
  comunicacion_representantes_fecha date,
  -- Auditoría
  notes                    text,
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now(),
  deleted_at               timestamptz,
  CONSTRAINT overtime_uniq UNIQUE (employee_id, ejercicio, mes)
);
CREATE INDEX IF NOT EXISTS idx_overtime_employee ON overtime_records (employee_id, ejercicio DESC, mes DESC);

-- 3.3 Convenios colectivos aplicables
CREATE TABLE IF NOT EXISTS collective_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_boe               text UNIQUE,                    -- ej "9908635"
  nombre                   text NOT NULL,
  ambito_geografico        text,                           -- "Estatal","Madrid","provincial",...
  ambito_funcional         text,                           -- "Construcción","Inmobiliarias",...
  vigencia_desde           date,
  vigencia_hasta           date,
  -- Tabla salarial
  tabla_salarial_url       text,
  tabla_salarial_drive_id  text,
  categorias_jsonb         jsonb,                          -- [{nombre, grupo_cotizacion, salario_base_anual, plus_convenio, antigüedad_pct}]
  -- Documento completo
  texto_convenio_url       text,
  -- Auditoría
  notes                    text,
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now(),
  deleted_at               timestamptz
);
CREATE INDEX IF NOT EXISTS idx_agreements_active ON collective_agreements (deleted_at) WHERE deleted_at IS NULL;

-- 3.4 Familiares a cargo (alternativa relacional al jsonb)
CREATE TABLE IF NOT EXISTS employee_dependents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id              uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  tipo                     text NOT NULL CHECK (tipo IN ('hijo','ascendiente','conyuge','otros')),
  nombre                   text,
  nif                      text,
  fecha_nacimiento         date,
  parentesco               text,
  -- Para IRPF
  discapacidad_grado       int CHECK (discapacidad_grado IN (0,33,65)),
  discapacidad_movilidad_reducida boolean DEFAULT false,
  conviviente              boolean DEFAULT true,
  rentas_anuales           numeric,                        -- para evaluar si computa para mínimo
  computa_irpf             boolean DEFAULT true,
  -- Histórico
  fecha_alta_dependencia   date,
  fecha_baja_dependencia   date,
  -- Auditoría
  notes                    text,
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now(),
  deleted_at               timestamptz
);
CREATE INDEX IF NOT EXISTS idx_dependents_employee ON employee_dependents (employee_id);
CREATE INDEX IF NOT EXISTS idx_dependents_active   ON employee_dependents (deleted_at) WHERE deleted_at IS NULL;

-- 3.5 Audit log GDPR
CREATE TABLE IF NOT EXISTS gdpr_processing_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id              uuid REFERENCES employees(id) ON DELETE SET NULL,
  evento                   text NOT NULL                   -- "alta","acceso","modificacion","exportacion","supresion","derecho_acceso","derecho_rectificacion","derecho_oposicion"
    CHECK (evento IN ('alta','acceso','modificacion','exportacion','supresion','derecho_acceso','derecho_rectificacion','derecho_oposicion','derecho_portabilidad','consentimiento','revocacion_consentimiento')),
  fecha                    timestamptz DEFAULT now(),
  base_legal               text,                           -- "ejecucion_contrato","obligacion_legal","consentimiento","interes_legitimo"
  finalidad                text,
  campos_afectados         text[],
  realizado_por            text,                           -- email del admin
  ip_origen                text,
  detalle                  text,
  -- Auditoría auto
  created_at               timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gdpr_employee ON gdpr_processing_log (employee_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_gdpr_evento   ON gdpr_processing_log (evento, fecha DESC);

-- ────────────────────────────────────────────────────────────────
-- TRIGGERS updated_at en todas las tablas nuevas
-- ────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'employee_contracts','time_records','payroll_payments','equality_pay_register',
    'it_leaves','vacation_records','finiquitos','tax_filings','ss_filings',
    'prl_documents','employee_family_situation_history','leave_permits',
    'overtime_records','collective_agreements','employee_dependents'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at_%I ON %I', t, t);
    EXECUTE format(
      'CREATE TRIGGER set_updated_at_%I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at()',
      t, t
    );
  END LOOP;
END $$;

-- ────────────────────────────────────────────────────────────────
-- FUNCIÓN AUXILIAR: registro retributivo desde payrolls
-- ────────────────────────────────────────────────────────────────
-- Calcula media/mediana por grupo profesional y sexo desde las nóminas del año.
-- Llamar manualmente al cierre de año o cuando se quiera regenerar.
CREATE OR REPLACE FUNCTION generate_equality_pay_register(p_anio int)
RETURNS void AS $$
BEGIN
  -- Limpia el registro del año
  DELETE FROM equality_pay_register WHERE periodo_anio = p_anio;

  -- Inserta datos agregados desde payrolls + employees
  INSERT INTO equality_pay_register (
    empresa_cif, empresa_nombre, periodo_anio,
    grupo_profesional, sexo, num_personas,
    salario_base_media, salario_base_mediana,
    complementos_media, complementos_mediana,
    extrasalariales_media, extrasalariales_mediana,
    total_retribucion_media, total_retribucion_mediana
  )
  SELECT
    p.empresa_cif,
    MIN(p.empresa_nombre),
    p_anio,
    COALESCE(p.trabajador_categoria, 'Sin categoría') AS grupo_profesional,
    'no_informado'::text AS sexo,    -- placeholder, employees aún no tiene sexo
    COUNT(DISTINCT p.trabajador_nif)::int,
    AVG(p.salario_base + p.plus_convenio + p.plus_antiguedad)::numeric(10,2),
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY p.salario_base + p.plus_convenio + p.plus_antiguedad)::numeric(10,2),
    AVG(p.plus_actividad + p.plus_extrasalarial + p.incentivos + p.comisiones)::numeric(10,2),
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY p.plus_actividad + p.plus_extrasalarial + p.incentivos + p.comisiones)::numeric(10,2),
    AVG(p.dietas + p.plus_transporte + p.kilometraje)::numeric(10,2),
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY p.dietas + p.plus_transporte + p.kilometraje)::numeric(10,2),
    AVG(p.total_devengado)::numeric(10,2),
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY p.total_devengado)::numeric(10,2)
  FROM payrolls p
  WHERE p.deleted_at IS NULL
    AND p.periodo_anio = p_anio
  GROUP BY p.empresa_cif, COALESCE(p.trabajador_categoria, 'Sin categoría');
END;
$$ LANGUAGE plpgsql;

-- ────────────────────────────────────────────────────────────────
-- Refrescar PostgREST schema cache
-- ────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
