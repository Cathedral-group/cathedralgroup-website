-- ============================================
-- Migration: Bug Diagnose Agent — spike detector pg_cron
-- Fecha: 17/05/2026
-- Sesión Op 2 primer caso uso real producción
-- Validado general-purpose agent: schema verificado, threshold calibrado realidad
-- (baseline 1 err/24h actual), pg_cron query 8ms en 52k rows
-- ============================================

-- Función spike detector
CREATE OR REPLACE FUNCTION public.bug_spike_check()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_total INT;
  v_cluster_n INT;
  v_cluster_src TEXT;
  v_cluster_guess TEXT;
  v_samples JSONB;
  v_severity TEXT;
  v_dedup_hash TEXT;
BEGIN
  -- Total unresolved errors last 1h
  SELECT COUNT(*) INTO v_total
  FROM exceptions_log
  WHERE created_at > NOW() - INTERVAL '1 hour' AND resolved = FALSE;

  -- Top cluster (source + ai_guess)
  SELECT source, ai_guess, COUNT(*)
    INTO v_cluster_src, v_cluster_guess, v_cluster_n
  FROM exceptions_log
  WHERE created_at > NOW() - INTERVAL '1 hour' AND resolved = FALSE
  GROUP BY source, ai_guess
  ORDER BY COUNT(*) DESC
  LIMIT 1;

  -- Threshold: total >= 5 OR cluster >= 3 (calibrado baseline 1/24h)
  IF v_total < 5 AND COALESCE(v_cluster_n, 0) < 3 THEN
    RETURN;
  END IF;

  -- Sample 5 más recientes
  SELECT jsonb_agg(jsonb_build_object(
    'source', source,
    'ai_guess', ai_guess,
    'filename', filename,
    'raw_excerpt', LEFT(COALESCE(raw_content, ''), 500),
    'at', created_at
  ))
  INTO v_samples
  FROM (
    SELECT source, ai_guess, filename, raw_content, created_at
    FROM exceptions_log
    WHERE created_at > NOW() - INTERVAL '1 hour' AND resolved = FALSE
    ORDER BY created_at DESC
    LIMIT 5
  ) s;

  -- Severity
  v_severity := CASE
    WHEN v_total > 30 OR v_cluster_n > 10 THEN 'critical'
    WHEN v_total > 15 OR v_cluster_n > 5 THEN 'medium'
    ELSE 'low'
  END;

  -- Dedup hash: cluster pattern + hora UTC
  v_dedup_hash := 'bug_spike_'
    || md5(COALESCE(v_cluster_src, '') || COALESCE(v_cluster_guess, ''))
    || '_'
    || to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD-HH24');

  INSERT INTO agent_dispatch_queue (
    agent_name, event_type, severity, trigger_payload, dedup_key, max_budget_usd
  ) VALUES (
    'bug_diagnose',
    'errors_spike_1h',
    v_severity,
    jsonb_build_object(
      'total_1h', v_total,
      'top_cluster', jsonb_build_object(
        'source', v_cluster_src,
        'ai_guess', v_cluster_guess,
        'count', v_cluster_n
      ),
      'samples', v_samples
    ),
    v_dedup_hash,
    0.05
  )
  ON CONFLICT (dedup_key) DO NOTHING;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bug_spike_check() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bug_spike_check() TO postgres, service_role;

-- pg_cron schedule */15
SELECT cron.schedule(
  'cathedral-bug-spike-check',
  '*/15 * * * *',
  $$SELECT public.bug_spike_check();$$
);

COMMENT ON FUNCTION public.bug_spike_check() IS
  'Op 2 Bug Diagnose Agent trigger. pg_cron */15 detecta spike exceptions_log (total>=5 OR cluster source+ai_guess>=3). INSERT agent_dispatch_queue → trigger pg_net → n8n workflow → Haiku diagnose.';
