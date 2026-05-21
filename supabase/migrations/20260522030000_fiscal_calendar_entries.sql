-- ============================================================================
-- Cathedral Group — fiscal_calendar_entries (sesión 21/05/2026 noche)
--
-- Feedback David: "marcar en el calendario la fecha límite en la que hay que
-- presentar documentos al estado, sean cuales sean para la empresa".
--
-- Tabla materializada con TODAS las obligaciones AEAT visibles desde calendario
-- general. Cada fila = un vencimiento concreto con fecha_inicio_plazo (cuándo
-- se PUEDE empezar a presentar) y fecha_limite (último día sin recargo).
--
-- Cubre 8 modelos (303, 111, 115, 202, 390, 347, 190, 200) ejercicios 2025+2026
-- para que el calendario muestre todo lo presente y lo próximo.
--
-- Render UI:
--   - fecha_limite → rojo (deadline AEAT)
--   - fecha_inicio_plazo → amarillo (puedes empezar a presentar)
-- ============================================================================

SET lock_timeout = '3s';
SET statement_timeout = '30s';

BEGIN;

CREATE TABLE IF NOT EXISTS public.fiscal_calendar_entries (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  modelo               text NOT NULL,
  ejercicio            int  NOT NULL,
  periodo              text NOT NULL,
  fecha_inicio_plazo   date NOT NULL,
  fecha_limite         date NOT NULL,
  nombre               text NOT NULL,
  descripcion          text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fiscal_calendar_entries_unique
    UNIQUE (company_id, modelo, ejercicio, periodo)
);

CREATE INDEX IF NOT EXISTS idx_fiscal_calendar_entries_dates
  ON public.fiscal_calendar_entries (company_id, fecha_inicio_plazo, fecha_limite);

ALTER TABLE public.fiscal_calendar_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_calendar_entries FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fiscal_calendar_entries_admin ON public.fiscal_calendar_entries;
CREATE POLICY fiscal_calendar_entries_admin
  ON public.fiscal_calendar_entries
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.fiscal_calendar_entries IS
  'Vencimientos AEAT proyectados al calendario general admin. Cada fila: inicio plazo (amarillo) + fecha límite (rojo). Sesión 21/05.';

-- ─── Seed 2026 + 2027 para Cathedral House Investment SL ─────────────────
-- (cubre T4 2025 que vence 30/01/2026 hasta declaraciones ejercicio 2026 que
-- vencen en 2027)

WITH cathedral AS (
  SELECT '00000000-0000-0000-0000-cca7ed1a1000'::uuid AS company_id
),
deadlines AS (
  -- 303 IVA trimestral
  SELECT '303' modelo, 2025 ejercicio, 'T4' periodo, DATE '2026-01-01' inicio, DATE '2026-01-30' limite,
         'IVA T4 2025 (303)' nombre, 'Autoliquidación IVA cuarto trimestre 2025' descripcion UNION ALL
  SELECT '303', 2026, 'T1', DATE '2026-04-01', DATE '2026-04-20', 'IVA T1 2026 (303)', 'Autoliquidación IVA primer trimestre 2026' UNION ALL
  SELECT '303', 2026, 'T2', DATE '2026-07-01', DATE '2026-07-20', 'IVA T2 2026 (303)', 'Autoliquidación IVA segundo trimestre 2026' UNION ALL
  SELECT '303', 2026, 'T3', DATE '2026-10-01', DATE '2026-10-20', 'IVA T3 2026 (303)', 'Autoliquidación IVA tercer trimestre 2026' UNION ALL
  SELECT '303', 2026, 'T4', DATE '2027-01-01', DATE '2027-01-30', 'IVA T4 2026 (303)', 'Autoliquidación IVA cuarto trimestre 2026' UNION ALL

  -- 111 IRPF retenciones trabajadores y profesionales
  SELECT '111', 2025, 'T4', DATE '2026-01-01', DATE '2026-01-30', 'IRPF retenciones T4 2025 (111)', 'Retenciones trabajadores y profesionales T4 2025' UNION ALL
  SELECT '111', 2026, 'T1', DATE '2026-04-01', DATE '2026-04-20', 'IRPF retenciones T1 2026 (111)', 'Retenciones trabajadores y profesionales T1 2026' UNION ALL
  SELECT '111', 2026, 'T2', DATE '2026-07-01', DATE '2026-07-20', 'IRPF retenciones T2 2026 (111)', 'Retenciones trabajadores y profesionales T2 2026' UNION ALL
  SELECT '111', 2026, 'T3', DATE '2026-10-01', DATE '2026-10-20', 'IRPF retenciones T3 2026 (111)', 'Retenciones trabajadores y profesionales T3 2026' UNION ALL
  SELECT '111', 2026, 'T4', DATE '2027-01-01', DATE '2027-01-30', 'IRPF retenciones T4 2026 (111)', 'Retenciones trabajadores y profesionales T4 2026' UNION ALL

  -- 115 IRPF retenciones alquileres
  SELECT '115', 2025, 'T4', DATE '2026-01-01', DATE '2026-01-30', 'IRPF alquileres T4 2025 (115)', 'Retenciones arrendamientos urbanos T4 2025' UNION ALL
  SELECT '115', 2026, 'T1', DATE '2026-04-01', DATE '2026-04-20', 'IRPF alquileres T1 2026 (115)', 'Retenciones arrendamientos urbanos T1 2026' UNION ALL
  SELECT '115', 2026, 'T2', DATE '2026-07-01', DATE '2026-07-20', 'IRPF alquileres T2 2026 (115)', 'Retenciones arrendamientos urbanos T2 2026' UNION ALL
  SELECT '115', 2026, 'T3', DATE '2026-10-01', DATE '2026-10-20', 'IRPF alquileres T3 2026 (115)', 'Retenciones arrendamientos urbanos T3 2026' UNION ALL
  SELECT '115', 2026, 'T4', DATE '2027-01-01', DATE '2027-01-30', 'IRPF alquileres T4 2026 (115)', 'Retenciones arrendamientos urbanos T4 2026' UNION ALL

  -- 202 Pagos fraccionados Sociedades (3 plazos al año)
  SELECT '202', 2026, '1P', DATE '2026-04-01', DATE '2026-04-20', 'Pago fraccionado IS 1P 2026 (202)', 'Primer pago a cuenta Impuesto Sociedades 2026' UNION ALL
  SELECT '202', 2026, '2P', DATE '2026-10-01', DATE '2026-10-20', 'Pago fraccionado IS 2P 2026 (202)', 'Segundo pago a cuenta Impuesto Sociedades 2026' UNION ALL
  SELECT '202', 2026, '3P', DATE '2026-12-01', DATE '2026-12-20', 'Pago fraccionado IS 3P 2026 (202)', 'Tercer pago a cuenta Impuesto Sociedades 2026' UNION ALL

  -- 390 IVA resumen anual
  SELECT '390', 2025, 'A',  DATE '2026-01-01', DATE '2026-01-30', 'IVA resumen anual 2025 (390)', 'Resumen anual IVA ejercicio 2025' UNION ALL

  -- 347 Operaciones >3.000€ con terceros
  SELECT '347', 2025, 'A',  DATE '2026-02-01', DATE '2026-02-28', 'Operaciones terceros 2025 (347)', 'Declaración informativa clientes/proveedores >3.000€ ejercicio 2025' UNION ALL

  -- 190 Resumen anual retenciones IRPF
  SELECT '190', 2025, 'A',  DATE '2026-01-01', DATE '2026-01-31', 'Retenciones anuales 2025 (190)', 'Resumen anual retenciones IRPF trabajadores y profesionales 2025' UNION ALL

  -- 200 Impuesto Sociedades
  SELECT '200', 2025, 'A',  DATE '2026-07-01', DATE '2026-07-25', 'Impuesto Sociedades 2025 (200)', 'Liquidación anual Impuesto Sociedades ejercicio 2025'
)
INSERT INTO public.fiscal_calendar_entries
  (company_id, modelo, ejercicio, periodo, fecha_inicio_plazo, fecha_limite, nombre, descripcion)
SELECT c.company_id, d.modelo, d.ejercicio, d.periodo, d.inicio, d.limite, d.nombre, d.descripcion
FROM cathedral c CROSS JOIN deadlines d
ON CONFLICT (company_id, modelo, ejercicio, periodo) DO UPDATE SET
  fecha_inicio_plazo = EXCLUDED.fecha_inicio_plazo,
  fecha_limite       = EXCLUDED.fecha_limite,
  nombre             = EXCLUDED.nombre,
  descripcion        = EXCLUDED.descripcion;

COMMIT;

NOTIFY pgrst, 'reload schema';
