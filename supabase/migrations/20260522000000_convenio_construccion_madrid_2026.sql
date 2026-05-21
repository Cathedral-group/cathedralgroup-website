-- ============================================================================
-- Cathedral Group — Convenio Construcción Madrid 2026 (Plan A sesión 22/05)
--
-- Fuente: BOCM nº 311 (31/12/2025), Resolución 15/12/2025 DG Trabajo Madrid
-- Código convenio: 28001055011982
-- Vigencia: 2025-01-01 → 2026-12-31
-- ============================================================================

SET lock_timeout = '3s';
SET statement_timeout = '60s';

BEGIN;

-- ─── B) Seed collective_agreements ──────────────────────────────────────
INSERT INTO public.collective_agreements (
  codigo_boe, nombre, ambito_geografico, ambito_funcional,
  vigencia_desde, vigencia_hasta, texto_convenio_url, notes
)
SELECT
  '28001055011982',
  'Convenio Colectivo del Sector de Construcción y Obras Públicas de la Comunidad de Madrid 2025-2026',
  'Comunidad de Madrid',
  'Construcción y Obras Públicas',
  '2025-01-01'::date, '2026-12-31'::date,
  'https://www.bocm.es/boletin/CM_Orden_BOCM/2025/12/31/BOCM-20251231-1.PDF',
  'BOCM nº 311 31/12/2025; jornada 2026=1736h; vacaciones=31 nat/22 lab; dieta=61,83€; media=14,50€; km=0,26€; plus extrasalarial=9,84€/día; incentivo obra=147€/mes; indemn fin contrato=7%; AT-EP muerte/IPA=47.000€, IPT=28.000€'
WHERE NOT EXISTS (
  SELECT 1 FROM public.collective_agreements WHERE codigo_boe='28001055011982'
);

-- ─── C) Tabla pluses convenio ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.convenio_construccion_madrid_pluses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collective_agreement_id UUID REFERENCES public.collective_agreements(id) ON DELETE CASCADE,
  anio INTEGER NOT NULL,
  jornada_anual_horas NUMERIC NOT NULL,
  vacaciones_dias_naturales INTEGER NOT NULL,
  vacaciones_dias_laborables INTEGER NOT NULL,
  plus_extrasalarial_dia NUMERIC,
  dieta_completa_dia NUMERIC,
  media_dieta_dia NUMERIC,
  km_locomocion NUMERIC,
  incentivo_obra_mes NUMERIC,
  prima_sab_dom_festivo NUMERIC,
  indemn_at_ep_muerte NUMERIC,
  indemn_at_ep_ipt NUMERIC,
  indemn_fin_contrato_pct NUMERIC,
  fuente_bocm TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (collective_agreement_id, anio)
);

ALTER TABLE public.convenio_construccion_madrid_pluses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.convenio_construccion_madrid_pluses FORCE  ROW LEVEL SECURITY;
GRANT SELECT ON public.convenio_construccion_madrid_pluses TO authenticated;
GRANT ALL    ON public.convenio_construccion_madrid_pluses TO service_role;
DROP POLICY IF EXISTS "convenio pluses authenticated read" ON public.convenio_construccion_madrid_pluses;
CREATE POLICY "convenio pluses authenticated read" ON public.convenio_construccion_madrid_pluses
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "convenio pluses service_role all" ON public.convenio_construccion_madrid_pluses;
CREATE POLICY "convenio pluses service_role all" ON public.convenio_construccion_madrid_pluses
  FOR ALL TO service_role USING (true) WITH CHECK (true);

INSERT INTO public.convenio_construccion_madrid_pluses (
  collective_agreement_id, anio,
  jornada_anual_horas, vacaciones_dias_naturales, vacaciones_dias_laborables,
  plus_extrasalarial_dia, dieta_completa_dia, media_dieta_dia,
  km_locomocion, incentivo_obra_mes, prima_sab_dom_festivo,
  indemn_at_ep_muerte, indemn_at_ep_ipt, indemn_fin_contrato_pct, fuente_bocm
)
SELECT
  ca.id, 2026,
  1736, 31, 22,
  9.84, 61.83, 14.50,
  0.26, 147.00, 150.00,
  47000, 28000, 7.0,
  'BOCM nº 311 31/12/2025 — Convenio Construcción Madrid 2025-2026'
FROM public.collective_agreements ca
WHERE ca.codigo_boe = '28001055011982'
ON CONFLICT (collective_agreement_id, anio) DO NOTHING;

-- ─── D) ALTER employee_contracts ─────────────────────────────────────────
ALTER TABLE public.employee_contracts
  ADD COLUMN IF NOT EXISTS dias_vacaciones_anuales NUMERIC DEFAULT 22,
  ADD COLUMN IF NOT EXISTS horas_anuales_jornada   NUMERIC DEFAULT 1736,
  ADD COLUMN IF NOT EXISTS collective_agreement_id UUID REFERENCES public.collective_agreements(id);

COMMENT ON COLUMN public.employee_contracts.dias_vacaciones_anuales IS 'Días vacaciones laborables/año (Convenio Construcción Madrid 2026 = 22)';
COMMENT ON COLUMN public.employee_contracts.horas_anuales_jornada   IS 'Horas trabajo efectivo año (Convenio Construcción Madrid 2026 = 1736)';

-- ─── E) Seed vacation_records 2026 empleados activos ────────────────────
INSERT INTO public.vacation_records (
  employee_id, anio, dias_devengados, dias_disfrutados, dias_pendientes,
  estado, company_id
)
SELECT
  e.id, 2026, 22, 0, 22, 'planificado', e.company_id
FROM public.employees e
WHERE e.deleted_at IS NULL
  AND (e.fecha_baja IS NULL OR e.fecha_baja > current_date)
ON CONFLICT DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';
