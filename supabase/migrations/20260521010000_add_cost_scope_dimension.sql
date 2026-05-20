-- ============================================================================
-- Migration: 20260521010000_add_cost_scope_dimension.sql
-- ----------------------------------------------------------------------------
-- Añade dimensión cost_scope (ámbito imputación gasto) ortogonal a categoria_gasto.
--
-- DOS dimensiones independientes (recomendación 3 agentes + PGC RICAC 14/04/2015):
--   - categoria_gasto: QUÉ se compra (material, alquiler, gestoría, etc.)
--   - cost_scope:      A QUIÉN se imputa (proyecto_directo/indirecto, gasto_general, periodo_fiscal)
--
-- Valores cost_scope:
--   proyecto_directo    — imputable inequívoco a project_id (requiere project_id NOT NULL)
--   proyecto_indirecto  — imputable proporcional a project_id (requiere project_id NOT NULL)
--   gasto_general       — estructural empresa (project_id DEBE ser NULL)
--   periodo_fiscal      — impuestos, modelos AEAT, multas, intereses
--
-- Backfill heurístico:
--   project_id IS NOT NULL → proyecto_directo
--   project_id IS NULL     → gasto_general
--   modelos_fiscales       → periodo_fiscal (especial)
--   justificantes_pago     → gasto_general (especial)
--   escrituras/notas_simples → NULL (no aplica — ámbito inmueble, no gasto)
-- ============================================================================

-- 1. ADD COLUMN cost_scope a invoices + 12 tablas relevantes
ALTER TABLE public.invoices             ADD COLUMN IF NOT EXISTS cost_scope TEXT;
ALTER TABLE public.contratos            ADD COLUMN IF NOT EXISTS cost_scope TEXT;
ALTER TABLE public.seguros              ADD COLUMN IF NOT EXISTS cost_scope TEXT;
ALTER TABLE public.licencias            ADD COLUMN IF NOT EXISTS cost_scope TEXT;
ALTER TABLE public.certificaciones_obra ADD COLUMN IF NOT EXISTS cost_scope TEXT;
ALTER TABLE public.certificados         ADD COLUMN IF NOT EXISTS cost_scope TEXT;
ALTER TABLE public.informes             ADD COLUMN IF NOT EXISTS cost_scope TEXT;
ALTER TABLE public.modelos_fiscales     ADD COLUMN IF NOT EXISTS cost_scope TEXT;
ALTER TABLE public.justificantes_pago   ADD COLUMN IF NOT EXISTS cost_scope TEXT;
ALTER TABLE public.albaranes            ADD COLUMN IF NOT EXISTS cost_scope TEXT;
ALTER TABLE public.presupuestos         ADD COLUMN IF NOT EXISTS cost_scope TEXT;
ALTER TABLE public.documentos_otros     ADD COLUMN IF NOT EXISTS cost_scope TEXT;

-- 2. Backfill heurístico
UPDATE public.invoices SET cost_scope = CASE
  WHEN project_id IS NOT NULL THEN 'proyecto_directo'
  ELSE 'gasto_general'
END WHERE cost_scope IS NULL;

UPDATE public.contratos SET cost_scope = CASE
  WHEN project_id IS NOT NULL THEN 'proyecto_directo'
  ELSE 'gasto_general'
END WHERE cost_scope IS NULL;

UPDATE public.seguros SET cost_scope = CASE
  WHEN project_id IS NOT NULL THEN 'proyecto_directo'
  ELSE 'gasto_general'
END WHERE cost_scope IS NULL;

UPDATE public.licencias SET cost_scope = CASE
  WHEN project_id IS NOT NULL THEN 'proyecto_directo'
  ELSE 'gasto_general'
END WHERE cost_scope IS NULL;

UPDATE public.certificaciones_obra SET cost_scope = 'proyecto_directo' WHERE cost_scope IS NULL;

UPDATE public.certificados SET cost_scope = CASE
  WHEN project_id IS NOT NULL THEN 'proyecto_directo'
  ELSE 'gasto_general'
END WHERE cost_scope IS NULL;

UPDATE public.informes SET cost_scope = CASE
  WHEN project_id IS NOT NULL THEN 'proyecto_directo'
  ELSE 'gasto_general'
END WHERE cost_scope IS NULL;

UPDATE public.modelos_fiscales SET cost_scope = 'periodo_fiscal' WHERE cost_scope IS NULL;
UPDATE public.justificantes_pago SET cost_scope = 'gasto_general' WHERE cost_scope IS NULL;

UPDATE public.albaranes SET cost_scope = CASE
  WHEN project_id IS NOT NULL THEN 'proyecto_directo'
  ELSE 'gasto_general'
END WHERE cost_scope IS NULL;

UPDATE public.presupuestos SET cost_scope = CASE
  WHEN project_id IS NOT NULL THEN 'proyecto_directo'
  ELSE 'gasto_general'
END WHERE cost_scope IS NULL;

UPDATE public.documentos_otros SET cost_scope = CASE
  WHEN project_id IS NOT NULL THEN 'proyecto_directo'
  ELSE 'gasto_general'
END WHERE cost_scope IS NULL;

-- 3. CHECK constraint cost_scope (4 valores válidos + NULL para tablas que no aplica)
ALTER TABLE public.invoices             ADD CONSTRAINT invoices_cost_scope_check             CHECK (cost_scope IS NULL OR cost_scope IN ('proyecto_directo','proyecto_indirecto','gasto_general','periodo_fiscal'));
ALTER TABLE public.contratos            ADD CONSTRAINT contratos_cost_scope_check            CHECK (cost_scope IS NULL OR cost_scope IN ('proyecto_directo','proyecto_indirecto','gasto_general','periodo_fiscal'));
ALTER TABLE public.seguros              ADD CONSTRAINT seguros_cost_scope_check              CHECK (cost_scope IS NULL OR cost_scope IN ('proyecto_directo','proyecto_indirecto','gasto_general','periodo_fiscal'));
ALTER TABLE public.licencias            ADD CONSTRAINT licencias_cost_scope_check            CHECK (cost_scope IS NULL OR cost_scope IN ('proyecto_directo','proyecto_indirecto','gasto_general','periodo_fiscal'));
ALTER TABLE public.certificaciones_obra ADD CONSTRAINT certificaciones_obra_cost_scope_check CHECK (cost_scope IS NULL OR cost_scope IN ('proyecto_directo','proyecto_indirecto','gasto_general','periodo_fiscal'));
ALTER TABLE public.certificados         ADD CONSTRAINT certificados_cost_scope_check         CHECK (cost_scope IS NULL OR cost_scope IN ('proyecto_directo','proyecto_indirecto','gasto_general','periodo_fiscal'));
ALTER TABLE public.informes             ADD CONSTRAINT informes_cost_scope_check             CHECK (cost_scope IS NULL OR cost_scope IN ('proyecto_directo','proyecto_indirecto','gasto_general','periodo_fiscal'));
ALTER TABLE public.modelos_fiscales     ADD CONSTRAINT modelos_fiscales_cost_scope_check     CHECK (cost_scope IS NULL OR cost_scope IN ('proyecto_directo','proyecto_indirecto','gasto_general','periodo_fiscal'));
ALTER TABLE public.justificantes_pago   ADD CONSTRAINT justificantes_pago_cost_scope_check   CHECK (cost_scope IS NULL OR cost_scope IN ('proyecto_directo','proyecto_indirecto','gasto_general','periodo_fiscal'));
ALTER TABLE public.albaranes            ADD CONSTRAINT albaranes_cost_scope_check            CHECK (cost_scope IS NULL OR cost_scope IN ('proyecto_directo','proyecto_indirecto','gasto_general','periodo_fiscal'));
ALTER TABLE public.presupuestos         ADD CONSTRAINT presupuestos_cost_scope_check         CHECK (cost_scope IS NULL OR cost_scope IN ('proyecto_directo','proyecto_indirecto','gasto_general','periodo_fiscal'));
ALTER TABLE public.documentos_otros     ADD CONSTRAINT documentos_otros_cost_scope_check     CHECK (cost_scope IS NULL OR cost_scope IN ('proyecto_directo','proyecto_indirecto','gasto_general','periodo_fiscal'));

-- 4. Coherencia scope ↔ project_id (solo invoices por ahora; el resto puede tener
--    project_id opcional). Si scope=proyecto_directo|indirecto → project_id REQUIRED.
ALTER TABLE public.invoices ADD CONSTRAINT invoices_scope_project_coherence CHECK (
  cost_scope IS NULL
  OR (cost_scope IN ('proyecto_directo','proyecto_indirecto') AND project_id IS NOT NULL)
  OR (cost_scope IN ('gasto_general','periodo_fiscal'))
);

-- 5. Indexes para reportes margen
CREATE INDEX IF NOT EXISTS idx_invoices_scope_company ON public.invoices(company_id, cost_scope) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_project_scope ON public.invoices(project_id, cost_scope) WHERE project_id IS NOT NULL AND deleted_at IS NULL;

-- 6. Schema cache reload PostgREST
NOTIFY pgrst, 'reload schema';

-- 7. Comments
COMMENT ON COLUMN public.invoices.cost_scope IS 'Ámbito imputación: proyecto_directo|proyecto_indirecto|gasto_general|periodo_fiscal. Ortogonal a categoria_gasto. Determina si gasto entra en margen obra (directo/indirecto) o solo en cuenta resultados global (general/periodo).';
