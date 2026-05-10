-- Sprint 10/05 — Cost tracking IA real (no estimación).
-- Hasta ahora solo había `ai_provider` por factura. Ahora registramos tokens reales
-- por llamada para calcular coste exacto mes a mes.

CREATE TABLE IF NOT EXISTS public.ai_usage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  -- También permitir log de pre-clasificador (sin invoice_id) y otros usos
  context text NOT NULL DEFAULT 'extraction',  -- 'preclassif' | 'extraction' | 'reconcile' | 'forensic' | 'other'
  provider text NOT NULL,                       -- 'gemini', 'gpt-4o', 'gpt-4o-mini', 'mistral-ocr', 'claude-sonnet-4-5'
  model text,                                   -- nombre exacto del modelo usado (ej. 'gemini-2.5-pro')
  tokens_input integer NOT NULL DEFAULT 0,
  tokens_output integer NOT NULL DEFAULT 0,
  tokens_total integer GENERATED ALWAYS AS (tokens_input + tokens_output) STORED,
  cost_eur numeric(10, 6),                      -- calculado en ingesta o post-hoc
  duration_ms integer,                          -- latencia de la llamada
  status text NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'error', 'timeout', 'fallback')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_invoice ON public.ai_usage_log (invoice_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created_at ON public.ai_usage_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_provider ON public.ai_usage_log (provider, created_at DESC);

COMMENT ON TABLE public.ai_usage_log IS
  'Registro de cada llamada a un provider IA. Permite calcular coste real mensual
   por provider/contexto. Sesión 10/05 — auditoría observabilidad.';

-- RPC: resumen de coste agrupado por mes y provider
CREATE OR REPLACE FUNCTION public.cost_summary_by_month_provider(
  p_months int DEFAULT 6
)
RETURNS TABLE(
  month text,
  provider text,
  call_count bigint,
  tokens_input_total bigint,
  tokens_output_total bigint,
  tokens_total_total bigint,
  cost_eur_total numeric,
  avg_duration_ms numeric,
  error_count bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    TO_CHAR(date_trunc('month', a.created_at), 'YYYY-MM') AS month,
    a.provider,
    COUNT(*) AS call_count,
    COALESCE(SUM(a.tokens_input), 0)::bigint AS tokens_input_total,
    COALESCE(SUM(a.tokens_output), 0)::bigint AS tokens_output_total,
    COALESCE(SUM(a.tokens_total), 0)::bigint AS tokens_total_total,
    ROUND(COALESCE(SUM(a.cost_eur), 0)::numeric, 4) AS cost_eur_total,
    ROUND(AVG(a.duration_ms)::numeric, 0) AS avg_duration_ms,
    COUNT(*) FILTER (WHERE a.status <> 'success')::bigint AS error_count
  FROM ai_usage_log a
  WHERE a.created_at >= NOW() - (p_months || ' months')::interval
  GROUP BY 1, 2
  ORDER BY 1 DESC, cost_eur_total DESC;
END;
$$;

-- RPC: resumen agregado del mes actual
CREATE OR REPLACE FUNCTION public.cost_summary_current_month()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_start timestamptz := date_trunc('month', NOW());
BEGIN
  WITH stats AS (
    SELECT
      COUNT(*) AS total_calls,
      COUNT(DISTINCT invoice_id) FILTER (WHERE invoice_id IS NOT NULL) AS distinct_invoices,
      COALESCE(SUM(tokens_input), 0) AS tokens_in,
      COALESCE(SUM(tokens_output), 0) AS tokens_out,
      COALESCE(SUM(cost_eur), 0) AS cost_total,
      AVG(duration_ms) AS avg_duration,
      COUNT(*) FILTER (WHERE status <> 'success') AS errors
    FROM ai_usage_log
    WHERE created_at >= v_start
  ),
  by_provider AS (
    SELECT jsonb_object_agg(provider, jsonb_build_object(
      'calls', n,
      'cost_eur', cost,
      'tokens', tokens
    )) AS dist
    FROM (
      SELECT
        provider,
        COUNT(*) AS n,
        ROUND(COALESCE(SUM(cost_eur), 0)::numeric, 4) AS cost,
        COALESCE(SUM(tokens_total), 0) AS tokens
      FROM ai_usage_log
      WHERE created_at >= v_start
      GROUP BY provider
    ) x
  ),
  by_context AS (
    SELECT jsonb_object_agg(context, jsonb_build_object(
      'calls', n,
      'cost_eur', cost
    )) AS dist
    FROM (
      SELECT
        context,
        COUNT(*) AS n,
        ROUND(COALESCE(SUM(cost_eur), 0)::numeric, 4) AS cost
      FROM ai_usage_log
      WHERE created_at >= v_start
      GROUP BY context
    ) x
  )
  SELECT jsonb_build_object(
    'month_start', v_start,
    'total_calls', s.total_calls,
    'distinct_invoices', s.distinct_invoices,
    'tokens_input_total', s.tokens_in,
    'tokens_output_total', s.tokens_out,
    'cost_eur_total', ROUND(s.cost_total::numeric, 4),
    'avg_duration_ms', ROUND(s.avg_duration::numeric, 0),
    'errors_count', s.errors,
    'by_provider', COALESCE(p.dist, '{}'::jsonb),
    'by_context', COALESCE(c.dist, '{}'::jsonb),
    -- Estimación coste/factura (si hay invoices distintas)
    'avg_cost_per_invoice', CASE
      WHEN s.distinct_invoices > 0 THEN ROUND((s.cost_total / s.distinct_invoices)::numeric, 4)
      ELSE 0
    END
  ) INTO v_result
  FROM stats s, by_provider p, by_context c;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cost_summary_by_month_provider(int) TO service_role;
GRANT EXECUTE ON FUNCTION public.cost_summary_current_month() TO service_role;

COMMENT ON FUNCTION public.cost_summary_by_month_provider IS
  'Coste agregado mes/provider últimos N meses. Útil para gráfica trend.';
COMMENT ON FUNCTION public.cost_summary_current_month IS
  'Resumen rápido del mes actual: total calls, tokens, coste, distribución por provider/context.';

-- Pricing helper (opcional — para calcular cost_eur en INSERT si no viene calculado)
-- Tabla con precios públicos por provider/model (USD por 1M tokens, convertido a EUR ~0.92)
CREATE TABLE IF NOT EXISTS public.ai_pricing_table (
  provider text NOT NULL,
  model text NOT NULL,
  price_input_per_1m_eur numeric(10, 6) NOT NULL,
  price_output_per_1m_eur numeric(10, 6) NOT NULL,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  PRIMARY KEY (provider, model, effective_from)
);

INSERT INTO public.ai_pricing_table (provider, model, price_input_per_1m_eur, price_output_per_1m_eur, notes) VALUES
  ('gemini', 'gemini-2.5-pro', 1.15, 9.20, 'USD 1.25/$10 → EUR a 0.92'),
  ('gemini', 'gemini-2.5-flash', 0.28, 2.30, 'USD 0.30/$2.50'),
  ('gpt-4o', 'gpt-4o', 2.30, 9.20, 'USD 2.50/$10'),
  ('gpt-4o', 'gpt-4o-mini', 0.14, 0.55, 'USD 0.15/$0.60'),
  ('mistral-ocr', 'mistral-ocr-2512', 0.92, 0.00, 'USD 0.001/página, asumir input solamente')
ON CONFLICT (provider, model, effective_from) DO NOTHING;

COMMENT ON TABLE public.ai_pricing_table IS
  'Pricing pública por provider/model. Usar para calcular cost_eur en post-procesado.
   Precios USD convertidos a EUR a 0.92 (10/05/2026). Actualizar manualmente cuando cambien.';

-- Helper para calcular coste post-hoc
CREATE OR REPLACE FUNCTION public.recalculate_ai_costs()
RETURNS TABLE(updated_count bigint, total_cost_eur numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count bigint;
  v_total numeric;
BEGIN
  WITH updates AS (
    UPDATE ai_usage_log a
    SET cost_eur = ROUND(
      (a.tokens_input::numeric / 1000000.0 * p.price_input_per_1m_eur +
       a.tokens_output::numeric / 1000000.0 * p.price_output_per_1m_eur)::numeric,
      6
    )
    FROM ai_pricing_table p
    WHERE a.provider = p.provider
      AND (a.model = p.model OR (a.model IS NULL AND p.model = a.provider))
      AND a.cost_eur IS NULL
      AND a.tokens_total > 0
    RETURNING a.cost_eur
  )
  SELECT COUNT(*), COALESCE(SUM(cost_eur), 0)
  INTO v_count, v_total
  FROM updates;

  RETURN QUERY SELECT v_count, ROUND(v_total::numeric, 4);
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalculate_ai_costs() TO service_role;

COMMENT ON FUNCTION public.recalculate_ai_costs IS
  'Recalcula cost_eur de filas con cost_eur=NULL usando ai_pricing_table.
   Llamar diariamente desde cron eval, o manualmente si se actualiza pricing.';
