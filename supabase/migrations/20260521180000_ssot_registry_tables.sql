-- ============================================================================
-- Cathedral Group — Single Source of Truth registry (2026-05-21 sesión 21/05 tarde)
--
-- Centraliza en BD toda la configuración hoy dispersa entre:
--   - 11 listas hardcoded doc_types en Next.js (DocumentsHubView, RevisionView,
--     upload/route, verifier, classify-project, tickets, operaciones, etc)
--   - 3 prompts OCR/extracción en lib/ocr-providers/{gemini,openai,mistral}.ts
--   - 3 URLs IA hardcoded
--   - Mapas Drive subfolder en Router Carpeta Destino (workflow n8n)
--   - Builders 14 tablas en Routing Doc Type V2 (workflow n8n)
--   - CHECK constraints SQL en migrations diversas
--   - Routing logic en app/api/decide-table/route.ts
--
-- Tras esta migration:
--   - Workflow n8n carga registry al inicio (cache $workflowStaticData TTL 5min)
--   - UI Next.js consume via hook useRegistry() con react-query cache 5min
--   - Añadir doc_type nuevo = INSERT 1 row + CREATE tabla destino. Resto auto.
-- ============================================================================

SET lock_timeout = '5s';
SET statement_timeout = '90s';

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- TABLA 1: doc_types_registry
-- Catálogo central tipos documento Cathedral. Define routing BD + Drive +
-- aliases prompt IA + hints OCR + categoría + UI display.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.doc_types_registry (
  code               TEXT PRIMARY KEY,
  display_name       TEXT NOT NULL,
  display_name_plural TEXT,
  table_name         TEXT NOT NULL,
  category           TEXT,
  prompt_aliases     JSONB NOT NULL DEFAULT '[]'::jsonb,
  vision_hints       TEXT,
  extraction_hints   TEXT,
  schema_fields      JSONB NOT NULL DEFAULT '{}'::jsonb,
  drive_subfolder_map JSONB NOT NULL DEFAULT '{}'::jsonb,
  drive_admin_folder TEXT,
  drive_uploadable   BOOLEAN NOT NULL DEFAULT true,
  ui_icon            TEXT,
  ui_color           TEXT,
  display_order      INT NOT NULL DEFAULT 100,
  enabled            BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doc_types_registry_enabled ON public.doc_types_registry(enabled) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_doc_types_registry_category ON public.doc_types_registry(category);

ALTER TABLE public.doc_types_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doc_types_registry FORCE ROW LEVEL SECURITY;
GRANT SELECT ON public.doc_types_registry TO anon, authenticated;
GRANT ALL   ON public.doc_types_registry TO service_role;

DROP POLICY IF EXISTS "registry public read" ON public.doc_types_registry;
CREATE POLICY "registry public read" ON public.doc_types_registry
  FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS "registry service_role all" ON public.doc_types_registry;
CREATE POLICY "registry service_role all" ON public.doc_types_registry
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE  public.doc_types_registry IS 'SSOT catálogo tipos documento Cathedral. Cargado por workflow n8n + UI admin.';
COMMENT ON COLUMN public.doc_types_registry.code               IS 'PK lowercase snake_case. Identificador canónico (factura, contrato, nomina, ...)';
COMMENT ON COLUMN public.doc_types_registry.table_name         IS 'Tabla destino BD para INSERT del doc procesado (invoices, contratos, payrolls, ...)';
COMMENT ON COLUMN public.doc_types_registry.prompt_aliases     IS 'JSON array sinónimos para clasificador IA. Ej. ["factura","invoice","recibo"]';
COMMENT ON COLUMN public.doc_types_registry.schema_fields      IS 'JSON map columna_BD → {source:item_path, type, required, transform}. Vacío {} = builder genérico introspectivo';
COMMENT ON COLUMN public.doc_types_registry.drive_subfolder_map IS 'JSON map prefix_proyecto_code → subfolder_name. Ej. {"OBR":"02_Contratos","CDU":"04_Contratos"}';
COMMENT ON COLUMN public.doc_types_registry.drive_admin_folder IS 'Override folder admin para doc empresa (nomina→ADMINISTRACION/Laboral)';
COMMENT ON COLUMN public.doc_types_registry.drive_uploadable   IS 'Si false, doc queda solo en Supabase Storage sin subir a Drive (ej. tickets alta frecuencia)';

-- ─────────────────────────────────────────────────────────────────────────
-- TABLA 2: prompt_templates
-- Catálogo prompts IA versionados. Workflow + UI leen content runtime.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prompt_templates (
  code           TEXT PRIMARY KEY,
  display_name   TEXT NOT NULL,
  category       TEXT NOT NULL,
  content        TEXT NOT NULL,
  description    TEXT,
  version        INT NOT NULL DEFAULT 1,
  variables      JSONB DEFAULT '[]'::jsonb,
  enabled        BOOLEAN NOT NULL DEFAULT true,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prompt_templates_category ON public.prompt_templates(category) WHERE enabled = true;

ALTER TABLE public.prompt_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompt_templates FORCE ROW LEVEL SECURITY;
GRANT SELECT ON public.prompt_templates TO authenticated;
GRANT ALL    ON public.prompt_templates TO service_role;

DROP POLICY IF EXISTS "prompts authenticated read" ON public.prompt_templates;
CREATE POLICY "prompts authenticated read" ON public.prompt_templates
  FOR SELECT TO authenticated USING (enabled = true);

DROP POLICY IF EXISTS "prompts service_role all" ON public.prompt_templates;
CREATE POLICY "prompts service_role all" ON public.prompt_templates
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE  public.prompt_templates  IS 'SSOT prompts IA versionados. Workflow Construir Prompt + libs OCR providers leen runtime.';
COMMENT ON COLUMN public.prompt_templates.category IS 'vision | extraction | classify | summary';
COMMENT ON COLUMN public.prompt_templates.variables IS 'JSON array nombres placeholders soportados. Ej. ["doc_types_list","today","empresa"]';

-- ─────────────────────────────────────────────────────────────────────────
-- TABLA 3: ai_providers_registry
-- Catálogo proveedores IA (Gemini/GPT/Mistral/Claude). Workflow lee priority
-- para cascada OCR + costos para budget tracking.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_providers_registry (
  code                    TEXT PRIMARY KEY,
  display_name            TEXT NOT NULL,
  family                  TEXT NOT NULL,
  endpoint                TEXT,
  model_id                TEXT,
  use_case                TEXT NOT NULL DEFAULT 'extraction',
  priority                INT NOT NULL DEFAULT 100,
  cost_per_1k_input       NUMERIC(10,6),
  cost_per_1k_output      NUMERIC(10,6),
  max_budget_per_call_usd NUMERIC(10,4) NOT NULL DEFAULT 0.05,
  rate_limit_rpm          INT,
  enabled                 BOOLEAN NOT NULL DEFAULT true,
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_providers_priority ON public.ai_providers_registry(use_case, priority) WHERE enabled = true;

ALTER TABLE public.ai_providers_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_providers_registry FORCE ROW LEVEL SECURITY;
GRANT SELECT ON public.ai_providers_registry TO authenticated;
GRANT ALL    ON public.ai_providers_registry TO service_role;

DROP POLICY IF EXISTS "providers authenticated read" ON public.ai_providers_registry;
CREATE POLICY "providers authenticated read" ON public.ai_providers_registry
  FOR SELECT TO authenticated USING (enabled = true);

DROP POLICY IF EXISTS "providers service_role all" ON public.ai_providers_registry;
CREATE POLICY "providers service_role all" ON public.ai_providers_registry
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE  public.ai_providers_registry IS 'SSOT proveedores IA. Workflow cascada OCR + libs OCR providers leen priority + costos.';
COMMENT ON COLUMN public.ai_providers_registry.use_case IS 'extraction | vision | classify | summary';
COMMENT ON COLUMN public.ai_providers_registry.priority IS '1=primary, 2=fallback, 3=tertiary. Mismo use_case ordena cascade';

-- ─────────────────────────────────────────────────────────────────────────
-- Trigger updated_at en las 3 tablas
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_doc_types_registry_updated ON public.doc_types_registry;
CREATE TRIGGER trg_doc_types_registry_updated BEFORE UPDATE ON public.doc_types_registry
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_prompt_templates_updated ON public.prompt_templates;
CREATE TRIGGER trg_prompt_templates_updated BEFORE UPDATE ON public.prompt_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_ai_providers_updated ON public.ai_providers_registry;
CREATE TRIGGER trg_ai_providers_updated BEFORE UPDATE ON public.ai_providers_registry
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- NOTIFY mechanism para invalidación cache cross-system
-- Cuando admin UPDATE registry, dispara NOTIFY → n8n webhook trigger reset
-- workflowStaticData en próxima execution.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_registry_notify_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  payload TEXT;
BEGIN
  payload := json_build_object(
    'table', TG_TABLE_NAME,
    'op', TG_OP,
    'code', CASE
      WHEN TG_OP = 'DELETE' THEN OLD.code
      ELSE NEW.code
    END,
    'ts', extract(epoch from now())
  )::text;
  PERFORM pg_notify('cathedral_registry_change', payload);
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_doc_types_notify ON public.doc_types_registry;
CREATE TRIGGER trg_doc_types_notify AFTER INSERT OR UPDATE OR DELETE ON public.doc_types_registry
  FOR EACH ROW EXECUTE FUNCTION public.tg_registry_notify_change();

DROP TRIGGER IF EXISTS trg_prompts_notify ON public.prompt_templates;
CREATE TRIGGER trg_prompts_notify AFTER INSERT OR UPDATE OR DELETE ON public.prompt_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_registry_notify_change();

DROP TRIGGER IF EXISTS trg_providers_notify ON public.ai_providers_registry;
CREATE TRIGGER trg_providers_notify AFTER INSERT OR UPDATE OR DELETE ON public.ai_providers_registry
  FOR EACH ROW EXECUTE FUNCTION public.tg_registry_notify_change();

-- ============================================================================
-- SEED: 19 doc_types Cathedral
-- ============================================================================

INSERT INTO public.doc_types_registry (code, display_name, display_name_plural, table_name, category, prompt_aliases, vision_hints, extraction_hints, drive_subfolder_map, drive_admin_folder, drive_uploadable, ui_icon, ui_color, display_order) VALUES

('factura', 'Factura', 'Facturas', 'invoices', 'gasto',
  '["factura","invoice","recibo","facture","rechnung","fattura"]'::jsonb,
  'Documento con cabecera proveedor + CIF/NIF + número factura + desglose IVA + total. Suele incluir IBAN y forma de pago.',
  'Extrae: número, fecha emisión, fecha vencimiento, proveedor (nombre/NIF/IBAN), receptor (nombre/NIF), base imponible, IVA (% e importe), total, retención IRPF si aplica.',
  '{"OBR":"03_Facturas","CDU":"05_Facturas","OBN":"07_Facturas","PRO":"07_Facturas","FLP":"04_Reforma"}'::jsonb,
  NULL, true, 'Receipt', 'emerald', 10),

('ticket', 'Ticket', 'Tickets', 'invoices', 'gasto',
  '["ticket","tique","ticket de compra","recibo simplificado","factura simplificada"]'::jsonb,
  'Recibo corto sin desglose proveedor completo. Suele tener fecha + total + IVA simplificado.',
  'Extrae: fecha, comercio, importe total, IVA si aparece. Si no hay NIF receptor, marca como gasto general no deducible IVA.',
  '{"OBR":"03_Facturas","CDU":"05_Facturas","OBN":"07_Facturas","PRO":"07_Facturas","FLP":"04_Reforma"}'::jsonb,
  NULL, true, 'ScrollText', 'lime', 20),

('rectificativa', 'Factura rectificativa', 'Facturas rectificativas', 'invoices', 'gasto',
  '["rectificativa","abono","credit note","nota de credito","factura rectificativa"]'::jsonb,
  'Factura con signo negativo o referencia a "factura original que rectifica".',
  'Extrae además: número factura original, fecha factura original, motivo rectificación (devolución/error/descuento).',
  '{"OBR":"03_Facturas","CDU":"05_Facturas","OBN":"07_Facturas","PRO":"07_Facturas","FLP":"04_Reforma"}'::jsonb,
  NULL, true, 'FileMinus', 'red', 30),

('proforma', 'Factura proforma', 'Proformas', 'invoices', 'gasto',
  '["proforma","factura proforma","pro forma"]'::jsonb,
  'Documento similar a factura pero etiquetado "PROFORMA" o "PRESUPUESTO". No es factura final.',
  'Extrae como factura pero marca como NO DEDUCIBLE hasta convertirse en factura definitiva.',
  '{"OBR":"04_Proformas","CDU":"06_Proformas","OBN":"08_Proformas","PRO":"08_Proformas","FLP":"04_Reforma"}'::jsonb,
  NULL, true, 'FileClock', 'amber', 40),

('albaran', 'Albarán', 'Albaranes', 'albaranes', 'logistica',
  '["albaran","albarán","delivery note","despatch note","nota de entrega"]'::jsonb,
  'Documento de entrega sin importes finales o con importes sin IVA. Lista cantidades entregadas + dirección entrega.',
  'Extrae: número albarán, fecha entrega, dirección entrega, proveedor, cliente, líneas con cantidades, importes sin IVA.',
  '{"OBR":"05_Albaranes","CDU":"07_Albaranes","OBN":"09_Albaranes","PRO":"09_Albaranes","FLP":"04_Reforma"}'::jsonb,
  NULL, true, 'Truck', 'blue', 50),

('presupuesto', 'Presupuesto', 'Presupuestos', 'presupuestos', 'comercial',
  '["presupuesto","cotizacion","cotización","quote","quotation","oferta","proposal"]'::jsonb,
  'Documento con desglose de partidas, importes orientativos y fecha validez. NO es factura ni proforma.',
  'Extrae: número presupuesto, fecha emisión, fecha validez, emisor, destinatario, partidas, base, IVA, total, condiciones.',
  '{"OBR":"01_Presupuestos","CDU":"09_Presupuestos","OBN":"11_Presupuestos","PRO":"11_Presupuestos","FLP":"04_Reforma"}'::jsonb,
  NULL, true, 'Calculator', 'sky', 60),

('contrato', 'Contrato', 'Contratos', 'contratos', 'juridico',
  '["contrato","contract","acuerdo","agreement","arrendamiento","alquiler","colaboración"]'::jsonb,
  'Documento jurídico con cláusulas, partes contratantes y firmas. Suele tener "REUNIDOS"/"CLÁUSULAS"/"OBJETO".',
  'Extrae: tipo (arrendamiento/colaboración/servicios), número, partes (nombre/NIF), objeto, fechas firma/inicio/fin, importes, fianza, periodicidad, prórroga.',
  '{"OBR":"02_Contratos","CDU":"04_Contratos","OBN":"06_Contratos","PRO":"06_Contratos","FLP":"02_Compra"}'::jsonb,
  NULL, true, 'FileSignature', 'violet', 70),

('escritura', 'Escritura', 'Escrituras', 'escrituras', 'juridico',
  '["escritura","deed","compraventa","hipoteca","escritura publica","escritura notarial"]'::jsonb,
  'Documento notarial con número protocolo, notario, partes, finca registral y referencia catastral.',
  'Extrae: número protocolo, notario (nombre/NIF/municipio), fecha otorgamiento, tipo (compraventa/hipoteca), importes (principal/ITP/AJD/IVA/honorarios), finca registral, referencia catastral.',
  '{"OBR":"02_Contratos","CDU":"13_Registro_propiedad","OBN":"01_Suelo","PRO":"01_Suelo","FLP":"02_Compra"}'::jsonb,
  NULL, true, 'Stamp', 'purple', 80),

('nota_simple', 'Nota simple registral', 'Notas simples', 'notas_simples', 'juridico',
  '["nota simple","nota simple informativa","nota registral","land registry note"]'::jsonb,
  'Documento del Registro de la Propiedad con descripción finca + cargas + titulares.',
  'Extrae: registro, número finca, tomo/libro/folio, IDUFIR, referencia catastral, descripción, superficies, titulares, cargas, fecha expedición.',
  '{"OBR":"02_Contratos","CDU":"13_Registro_propiedad","OBN":"01_Suelo","PRO":"01_Suelo","FLP":"02_Compra"}'::jsonb,
  NULL, true, 'BookOpen', 'indigo', 90),

('licencia', 'Licencia urbanística', 'Licencias', 'licencias', 'juridico',
  '["licencia","licencia urbanistica","licencia de obras","licencia de actividad","building permit","planning permission"]'::jsonb,
  'Documento administrativo emitido por ayuntamiento. Tiene número expediente + fecha solicitud/concesión.',
  'Extrae: organismo, número expediente, número licencia, tipo (obras/actividad/cambio uso), fechas solicitud/concesión/caducidad, tasa ICIO, objeto.',
  '{"OBR":"08_Licencias_permisos","CDU":"03_Licencias_permisos","OBN":"04_Licencias_permisos","PRO":"04_Licencias_permisos","FLP":"04_Reforma"}'::jsonb,
  NULL, true, 'ShieldCheck', 'teal', 100),

('seguro', 'Póliza de seguro', 'Seguros', 'seguros', 'juridico',
  '["seguro","poliza","póliza","insurance","insurance policy","insurance certificate"]'::jsonb,
  'Documento de aseguradora con número póliza + tomador + asegurado + coberturas + primas.',
  'Extrae: número póliza, aseguradora (nombre/NIF), tipo (decenal/responsabilidad civil/multirriesgo), fechas efecto/vencimiento, primas (neta/total), capital asegurado, coberturas.',
  '{"OBR":"09_Seguros","CDU":"10_Seguros","OBN":"13_Seguros","PRO":"13_Seguros","FLP":"05_Gastos_tenencia"}'::jsonb,
  'ADMINISTRACION/Seguros', true, 'ShieldHalf', 'cyan', 110),

('certificado', 'Certificado técnico', 'Certificados', 'certificados', 'tecnico',
  '["certificado","certificate","cee","certificado energetico","cedula habitabilidad","boletin","CE"]'::jsonb,
  'Documento técnico con número certificado, organismo/técnico emisor, NIF técnico, fecha.',
  'Extrae: tipo (energético/habitabilidad/instalaciones), número, organismo o técnico, NIF, colegiado, fecha emisión, fecha caducidad, calificación energética si aplica.',
  '{"OBR":"06_Certificados","CDU":"08_Certificados","OBN":"10_Certificados","PRO":"10_Certificados","FLP":"04_Reforma"}'::jsonb,
  NULL, true, 'BadgeCheck', 'green', 120),

('certificacion', 'Certificación de obra', 'Certificaciones de obra', 'certificaciones_obra', 'tecnico',
  '["certificacion","certificación","certificacion obra","construction certificate","valoración mensual"]'::jsonb,
  'Documento periodico de obra con importe origen + anterior + actual + porcentaje ejecución.',
  'Extrae: número certificación, periodo desde/hasta, importe origen/anterior/actual, % ejecución, retención, contratista, promotor, director obra.',
  '{"OBR":"06_Certificados","CDU":"08_Certificados","OBN":"10_Certificados","PRO":"10_Certificados","FLP":"04_Reforma"}'::jsonb,
  NULL, true, 'ClipboardCheck', 'green', 125),

('informe', 'Informe técnico', 'Informes', 'informes', 'tecnico',
  '["informe","report","tasacion","tasación","appraisal","valuation","peritaje"]'::jsonb,
  'Documento extenso con conclusiones, metodología y firma técnica.',
  'Extrae: tipo (tasación/peritaje/diagnóstico), número, emisor, técnico (nombre/colegiado), fecha emisión/visita, valores (mercado/hipotecario/construcción), método valoración, conclusiones.',
  '{"OBR":"07_Documentacion_tecnica","CDU":"02_Proyecto_tecnico","OBN":"03_Proyecto_tecnico","PRO":"03_Proyecto_tecnico","FLP":"04_Reforma"}'::jsonb,
  NULL, true, 'FileText', 'slate', 130),

('modelo_fiscal', 'Modelo fiscal AEAT', 'Modelos fiscales', 'modelos_fiscales', 'fiscal',
  '["modelo","aeat","hacienda","modelo 303","modelo 111","modelo 190","modelo 347","modelo 200","modelo 130"]'::jsonb,
  'Documento AEAT con código modelo (303/111/190/347/200/130) + ejercicio + periodo + CSV.',
  'Extrae: modelo, ejercicio, periodo (trimestre/mes), fecha presentación, fecha devengo, CSV AEAT, importe resultado, número justificante.',
  '{"OBR":null,"CDU":"16_Cierre_fiscal","OBN":"21_Cierre_fiscal","PRO":"23_Cierre_fiscal","FLP":null}'::jsonb,
  'ADMINISTRACION/Fiscal', true, 'Landmark', 'orange', 140),

('nomina', 'Nómina', 'Nóminas', 'payrolls', 'laboral',
  '["nomina","nómina","payslip","payroll","recibo salarial"]'::jsonb,
  'Documento mensual con empresa + trabajador + devengos + deducciones + líquido.',
  'Extrae: empresa (nombre/CIF), trabajador (nombre/NIF/categoría), periodo (mes/año), devengos (salario base/pluses/extras), deducciones SS (CCC/desempleo/formación), IRPF, líquido a percibir, coste empresa.',
  '{}'::jsonb,
  'ADMINISTRACION/Laboral', true, 'Users', 'pink', 150),

('justificante_pago', 'Justificante de pago', 'Justificantes de pago', 'justificantes_pago', 'gasto',
  '["justificante","justificante pago","payment receipt","transfer receipt","bizum","transferencia","comprobante","talon"]'::jsonb,
  'Recibo bancario o capturar de transferencia con IBAN origen/destino + importe + concepto.',
  'Extrae: tipo (transferencia/bizum/talón/efectivo), banco emisor, IBAN ordenante, IBAN beneficiario, beneficiario nombre/NIF, importe, fecha operación, concepto, referencia.',
  '{"OBR":"03_Facturas","CDU":"05_Facturas","OBN":"07_Facturas","PRO":"07_Facturas","FLP":"04_Reforma"}'::jsonb,
  NULL, false, 'CreditCard', 'amber', 160),

('otro', 'Otro documento', 'Otros', 'documents', 'otros',
  '["otro","other","misc","varios"]'::jsonb,
  'Documento no clasificable en categorías anteriores. Se guarda en tabla genérica documents.',
  'Extrae lo máximo posible: título, partes implicadas, fechas, importes si aparecen, resumen.',
  '{"OBR":null,"CDU":null,"OBN":null,"PRO":null,"FLP":null}'::jsonb,
  '_PENDIENTE_CLASIFICAR/Documentos_varios', false, 'File', 'gray', 999),

('no_legible', 'No legible / dudoso', 'No legibles', 'documents', 'otros',
  '["ilegible","dudoso","no clasificable","blurry","unreadable"]'::jsonb,
  'Documento con OCR fallido o calidad insuficiente para extracción confiable.',
  'NO extraer. Marcar como no_legible para revisión manual humana.',
  '{}'::jsonb,
  '_PENDIENTE_CLASIFICAR/No_legibles', false, 'AlertTriangle', 'red', 990)

ON CONFLICT (code) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  table_name = EXCLUDED.table_name,
  prompt_aliases = EXCLUDED.prompt_aliases,
  vision_hints = EXCLUDED.vision_hints,
  extraction_hints = EXCLUDED.extraction_hints,
  drive_subfolder_map = EXCLUDED.drive_subfolder_map,
  drive_admin_folder = EXCLUDED.drive_admin_folder,
  drive_uploadable = EXCLUDED.drive_uploadable,
  ui_icon = EXCLUDED.ui_icon,
  ui_color = EXCLUDED.ui_color,
  display_order = EXCLUDED.display_order;

-- ============================================================================
-- SEED: 3 prompts canónicos
-- ============================================================================

INSERT INTO public.prompt_templates (code, display_name, category, content, description, variables, version, notes) VALUES

('classify_doc_type', 'Clasificación tipo documento', 'classify',
$prompt$Eres un asistente especializado en clasificación documental para Cathedral Group, empresa española de arquitectura, reformas e inmobiliaria. Analiza el documento adjunto y clasifícalo en uno de los siguientes tipos:

{{doc_types_list}}

Devuelve estrictamente JSON con la estructura:
{
  "doc_type": "<code del tipo>",
  "confidence": <number 0..1>,
  "aliases_matched": ["<sinónimos detectados>"],
  "razones": "<por qué clasificaste así, 1-2 frases>",
  "uncertain": <true si confidence < 0.7>
}

Reglas:
- Si NO puedes leer el documento o está borroso, devuelve doc_type="no_legible", confidence=0.
- Si parece factura pero falta NIF emisor o número, sigue siendo "factura" con confidence ajustada.
- Albaranes NO tienen IVA desglosado; facturas SÍ.
- Tickets son recibos sin desglose proveedor completo.
- Proformas dicen explícitamente "PROFORMA" o "PROPUESTA".
- Una nómina es de UN trabajador en UN mes, NO confundir con resumen multi-empleado.
- En caso de duda entre 2 tipos, elige el de mayor display_order numérico menor (más específico).$prompt$,
  'Prompt clasificador documento → uno de 19 doc_types Cathedral. Renderiza placeholder {{doc_types_list}} con código + aliases + display_name de cada tipo enabled.',
  '["doc_types_list"]'::jsonb, 1,
  'Migration inicial 21/05. Mejorar con ejemplos few-shot cuando hayamos visto suficientes casos clasificados incorrectamente.'),

('universal_extraction', 'Extracción universal datos documento', 'extraction',
$prompt$Eres un asistente experto en contabilidad y administración de Cathedral Group (CIF B19761915), empresa española de arquitectura/reformas/inmobiliaria. Analiza el documento adjunto y extrae los datos relevantes.

Tipo documento previamente clasificado: {{doc_type_display}}
Hint extracción: {{extraction_hint}}

Devuelve JSON estricto conforme al schema del tipo. Para campos no presentes en el documento, devuelve null (NO inventes valores).

Reglas generales:
- Fechas formato ISO 8601 (YYYY-MM-DD).
- Importes en EUR como números (no strings con €).
- NIF/CIF español formato 8 dígitos + letra o letra + 8 dígitos.
- IBAN sin espacios.
- Confianza global del 0.0 al 1.0 considerando legibilidad + datos críticos presentes.

Si Cathedral aparece como receptor (NIF B19761915), marca direction="recibida" en facturas.
Si Cathedral aparece como emisor, marca direction="emitida".

Hoy es {{today}}.$prompt$,
  'Prompt extracción universal datos. Recibe doc_type clasificado + extraction_hint del registry. Funciona para los 19 tipos.',
  '["doc_type_display","extraction_hint","today"]'::jsonb, 1,
  'Migration inicial 21/05. Aliases por tipo viven en doc_types_registry.extraction_hints.'),

('vision_ocr', 'OCR Vision (Gemini/GPT cascade)', 'vision',
$prompt$Eres un sistema OCR experto para documentos contables y administrativos españoles de Cathedral Group.

Tarea: extrae TODO el texto visible del documento adjunto + estructura datos clave.

Devuelve JSON con:
{
  "texto_completo": "<texto OCR completo>",
  "doc_type_sugerido": "<código tipo entre los listados>",
  "confidence_ocr": <0..1>,
  "campos_detectados": {
    "fecha": "<si detectada>",
    "importes": [<lista importes>],
    "nifs": [<lista NIFs>],
    "nombres_organizaciones": [<lista>],
    "numeros_documento": [<lista>]
  },
  "es_legible": <true si OCR confiable, false si borroso/incompleto>,
  "idioma_detectado": "<es/en/...>",
  "observaciones": "<notas sobre calidad o ambigüedades>"
}

Tipos posibles: {{doc_types_list}}

Si el documento tiene varias páginas, OCR cada una y concatena texto_completo. Si es una factura escaneada de baja calidad, prioriza extraer NIF emisor + importe total + fecha + número.$prompt$,
  'Prompt OCR Vision usado por Gemini 2.5 Pro + GPT-4o cascada. Detecta texto + sugiere doc_type + extrae campos clave.',
  '["doc_types_list"]'::jsonb, 1,
  'Migration inicial 21/05. Usado en lib/ocr-providers/{gemini,openai}.ts + workflow Llamar Gemini Visión.')

ON CONFLICT (code) DO UPDATE SET
  content = EXCLUDED.content,
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  variables = EXCLUDED.variables,
  version = public.prompt_templates.version + 1,
  notes = EXCLUDED.notes;

-- ============================================================================
-- SEED: 3 providers IA actuales
-- ============================================================================

INSERT INTO public.ai_providers_registry (code, display_name, family, endpoint, model_id, use_case, priority, cost_per_1k_input, cost_per_1k_output, max_budget_per_call_usd, rate_limit_rpm, notes) VALUES

('gemini-2.5-pro', 'Gemini 2.5 Pro (Vertex AI)', 'gemini',
  'https://aiplatform.googleapis.com/v1/projects/{project}/locations/{location}/publishers/google/models/gemini-2.5-pro:generateContent',
  'gemini-2.5-pro', 'vision', 1,
  0.00125, 0.005, 0.05, 100,
  'Provider primario para OCR Vision. Reemplazó Gemini Studio API tras migración 11/05/2026 a Vertex AI. Cuenta cathedral-ai.'),

('gpt-4o-mini', 'GPT-4o mini (texto)', 'gpt',
  'https://api.openai.com/v1/chat/completions',
  'gpt-4o-mini', 'extraction', 1,
  0.00015, 0.0006, 0.02, 500,
  'Provider primario extracción texto (PDFs born-digital). Coste $0.001/factura vs Vision $0.04 (40× ahorro). Sesión 19-20/05 lo hizo OPERATIVO producción.'),

('gpt-4o', 'GPT-4o (vision fallback)', 'gpt',
  'https://api.openai.com/v1/chat/completions',
  'gpt-4o', 'vision', 2,
  0.0025, 0.01, 0.05, 500,
  'Provider fallback Vision si Gemini falla.'),

('mistral-large', 'Mistral Large (extracción fallback)', 'mistral',
  'https://api.mistral.ai/v1/chat/completions',
  'mistral-large-latest', 'extraction', 3,
  0.002, 0.006, 0.05, 200,
  'Provider tercer nivel cascada extracción.'),

('claude-haiku-4-5', 'Claude Haiku 4.5 (clasificación + agentes)', 'claude',
  'https://api.anthropic.com/v1/messages',
  'claude-haiku-4-5-20251001', 'classify', 1,
  0.001, 0.005, 0.02, 200,
  'Usado por agentes diagnose + health monitor (sesión 17/05). Apto para clasificación rápida documentos.')

ON CONFLICT (code) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  endpoint = EXCLUDED.endpoint,
  model_id = EXCLUDED.model_id,
  use_case = EXCLUDED.use_case,
  priority = EXCLUDED.priority,
  cost_per_1k_input = EXCLUDED.cost_per_1k_input,
  cost_per_1k_output = EXCLUDED.cost_per_1k_output,
  notes = EXCLUDED.notes;

COMMIT;

-- PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
