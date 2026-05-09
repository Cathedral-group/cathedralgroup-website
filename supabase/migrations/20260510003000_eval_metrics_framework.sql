-- Sprint METRICS sesión 10/05 madrugada (auditoría profunda recomendó observabilidad).
-- "Sin métricas, todo cambio es ingeniería ciega" — auditor arquitectural 5.2/10.
--
-- Crea framework mínimo de eval STRUCTURAL (sin golden set humano):
-- - Tabla `eval_runs` con histórico de métricas operativas
-- - RPC `eval_structural_snapshot()` que calcula métricas en tiempo real

CREATE TABLE IF NOT EXISTS public.eval_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at timestamptz NOT NULL DEFAULT NOW(),
  run_type text NOT NULL CHECK (run_type IN ('structural', 'golden_set', 'manual', 'cron')),
  scope text NOT NULL DEFAULT 'invoices', -- invoices | quotes | documents
  metrics jsonb NOT NULL,
  notes text
);

CREATE INDEX IF NOT EXISTS idx_eval_runs_at ON public.eval_runs (run_at DESC);

COMMENT ON TABLE public.eval_runs IS
  'Histórico de evaluaciones del sistema clasificador IA. run_type=structural usa RPC eval_structural_snapshot(). golden_set requiere ground truth humano (futuro).';

CREATE OR REPLACE FUNCTION public.eval_structural_snapshot(
  p_window_days int DEFAULT 30
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total int;
  v_metrics jsonb;
  v_since timestamptz := NOW() - (p_window_days || ' days')::interval;
BEGIN
  SELECT COUNT(*) INTO v_total
  FROM invoices
  WHERE deleted_at IS NULL AND created_at >= v_since;

  IF v_total = 0 THEN
    RETURN jsonb_build_object(
      'total', 0,
      'window_days', p_window_days,
      'note', 'No hay facturas en la ventana'
    );
  END IF;

  WITH base AS (
    SELECT * FROM invoices
    WHERE deleted_at IS NULL AND created_at >= v_since
  ),
  cobertura AS (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE supplier_nif IS NOT NULL) AS con_supplier_nif,
      COUNT(*) FILTER (WHERE number IS NOT NULL) AS con_number,
      COUNT(*) FILTER (WHERE issue_date IS NOT NULL) AS con_issue_date,
      COUNT(*) FILTER (WHERE amount_total IS NOT NULL) AS con_amount,
      COUNT(*) FILTER (WHERE direction IS NOT NULL) AS con_direction,
      COUNT(*) FILTER (WHERE supplier_id IS NOT NULL OR client_id IS NOT NULL) AS con_entity_id,
      COUNT(*) FILTER (WHERE project_id IS NOT NULL) AS con_project_id,
      COUNT(*) FILTER (WHERE drive_url IS NOT NULL) AS con_drive,
      COUNT(*) FILTER (WHERE file_hash IS NOT NULL) AS con_sha256
    FROM base
  ),
  revision AS (
    SELECT
      COUNT(*) FILTER (WHERE needs_review = true) AS needs_review_total,
      COUNT(*) FILTER (WHERE review_status = 'pendiente') AS review_pendiente,
      COUNT(*) FILTER (WHERE review_status = 'revisado') AS review_revisado,
      COUNT(*) FILTER (WHERE review_status = 'confirmado') AS review_confirmado,
      COUNT(*) FILTER (WHERE review_status = 'rechazado') AS review_rechazado,
      COUNT(*) FILTER (WHERE review_status = 'error') AS review_error,
      AVG(ai_confidence) FILTER (WHERE ai_confidence IS NOT NULL) AS confidence_avg,
      MIN(ai_confidence) FILTER (WHERE ai_confidence IS NOT NULL) AS confidence_min,
      MAX(ai_confidence) FILTER (WHERE ai_confidence IS NOT NULL) AS confidence_max
    FROM base
  ),
  providers AS (
    SELECT jsonb_object_agg(COALESCE(ai_provider, 'unknown'), n) AS dist
    FROM (
      SELECT ai_provider, COUNT(*) AS n FROM base GROUP BY ai_provider
    ) x
  ),
  doctypes AS (
    SELECT jsonb_object_agg(COALESCE(doc_type, 'unknown'), n) AS dist
    FROM (
      SELECT doc_type, COUNT(*) AS n FROM base GROUP BY doc_type
    ) x
  ),
  forensic AS (
    SELECT
      COUNT(DISTINCT b.id) FILTER (WHERE ff.id IS NOT NULL) AS con_forensic,
      AVG(ff.score) FILTER (WHERE ff.score IS NOT NULL) AS score_avg,
      MIN(ff.score) FILTER (WHERE ff.score IS NOT NULL) AS score_min,
      COUNT(*) FILTER (WHERE ff.score < 50) AS forensic_critical,
      COUNT(*) FILTER (WHERE ff.score >= 50 AND ff.score < 80) AS forensic_review,
      COUNT(*) FILTER (WHERE ff.score >= 80) AS forensic_clean
    FROM base b
    LEFT JOIN factura_forensic ff ON ff.invoice_id = b.id
  ),
  razones_top AS (
    SELECT jsonb_agg(razon ORDER BY n DESC) AS top
    FROM (
      SELECT razon, COUNT(*) AS n
      FROM base, LATERAL unnest(ai_razones) AS razon
      WHERE ai_razones IS NOT NULL AND array_length(ai_razones, 1) > 0
      GROUP BY razon
      ORDER BY n DESC
      LIMIT 10
    ) x
  )
  SELECT jsonb_build_object(
    'total', v_total,
    'window_days', p_window_days,
    'snapshot_at', NOW(),
    'cobertura_campos', jsonb_build_object(
      'supplier_nif_pct', ROUND(100.0 * c.con_supplier_nif / c.total, 1),
      'number_pct', ROUND(100.0 * c.con_number / c.total, 1),
      'issue_date_pct', ROUND(100.0 * c.con_issue_date / c.total, 1),
      'amount_pct', ROUND(100.0 * c.con_amount / c.total, 1),
      'direction_pct', ROUND(100.0 * c.con_direction / c.total, 1),
      'entity_id_pct', ROUND(100.0 * c.con_entity_id / c.total, 1),
      'project_id_pct', ROUND(100.0 * c.con_project_id / c.total, 1),
      'drive_pct', ROUND(100.0 * c.con_drive / c.total, 1),
      'sha256_pct', ROUND(100.0 * c.con_sha256 / c.total, 1)
    ),
    'revision', jsonb_build_object(
      'needs_review_pct', ROUND(100.0 * r.needs_review_total / c.total, 1),
      'pendiente', r.review_pendiente,
      'revisado', r.review_revisado,
      'confirmado', r.review_confirmado,
      'rechazado', r.review_rechazado,
      'error', r.review_error,
      'confidence_avg', ROUND(r.confidence_avg::numeric, 3),
      'confidence_min', ROUND(r.confidence_min::numeric, 3),
      'confidence_max', ROUND(r.confidence_max::numeric, 3)
    ),
    'providers', p.dist,
    'doctypes', d.dist,
    'forensic', jsonb_build_object(
      'cobertura_pct', ROUND(100.0 * f.con_forensic / c.total, 1),
      'score_avg', ROUND(f.score_avg::numeric, 1),
      'score_min', f.score_min,
      'critical_count', f.forensic_critical,
      'review_count', f.forensic_review,
      'clean_count', f.forensic_clean
    ),
    'top_ai_razones', tr.top
  ) INTO v_metrics
  FROM cobertura c, revision r, providers p, doctypes d, forensic f, razones_top tr;

  RETURN v_metrics;
END;
$$;

GRANT EXECUTE ON FUNCTION public.eval_structural_snapshot(int) TO service_role;

COMMENT ON FUNCTION public.eval_structural_snapshot IS
  'Snapshot de métricas estructurales del clasificador IA. Sin golden set humano: mide cobertura de campos, distribución revisión, providers, doc_types, forensic. Usar como baseline para detectar drift entre cambios.';
