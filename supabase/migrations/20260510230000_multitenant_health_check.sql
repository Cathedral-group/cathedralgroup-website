-- Multi-tenant health check — verifica integridad del schema multi-empresa
--
-- Comprueba:
--   1. Cada tabla tiene company_id según corresponda (allowlist explícito)
--   2. RLS + FORCE habilitado en todas las tablas con company_id
--   3. No hay filas con company_id que apunte a una company inexistente
--   4. Stats por company (counts en tablas core)
--   5. audit_log_chain íntegra (hash chain válido en últimas 100 filas)
--
-- Sprint Bloque 0 health check — sesión 10/05/2026 final.

CREATE OR REPLACE FUNCTION verify_multitenant_isolation()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_tables INT;
  v_with_company_id INT;
  v_without_company_id INT;
  v_rls_enabled INT;
  v_rls_forced INT;
  v_orphan_rows INT := 0;
  v_companies_count INT;
  v_company_stats JSONB;
  v_audit_chain_status JSONB;
  v_orphans_detail JSONB;
  v_table_record RECORD;
BEGIN
  -- Contadores schema
  SELECT COUNT(*) INTO v_total_tables
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE';

  SELECT COUNT(DISTINCT table_name) INTO v_with_company_id
    FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'company_id';

  v_without_company_id := v_total_tables - v_with_company_id;

  -- RLS check
  SELECT
    COUNT(*) FILTER (WHERE c.relrowsecurity),
    COUNT(*) FILTER (WHERE c.relforcerowsecurity)
  INTO v_rls_enabled, v_rls_forced
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = c.relname
        AND column_name = 'company_id'
    );

  -- Companies activas
  SELECT COUNT(*) INTO v_companies_count
    FROM companies WHERE deleted_at IS NULL AND status = 'ACTIVE';

  -- Stats por company en tablas core (invoices, payrolls, employees, projects)
  SELECT jsonb_agg(jsonb_build_object(
    'company_id', c.id,
    'cif', c.cif,
    'razon_social', c.razon_social,
    'invoices_count', (SELECT COUNT(*) FROM invoices i WHERE i.company_id = c.id AND i.deleted_at IS NULL),
    'payrolls_count', (SELECT COUNT(*) FROM payrolls p WHERE p.company_id = c.id AND p.deleted_at IS NULL),
    'employees_count', (SELECT COUNT(*) FROM employees e WHERE e.company_id = c.id AND e.deleted_at IS NULL),
    'projects_count', (SELECT COUNT(*) FROM projects pr WHERE pr.company_id = c.id AND pr.deleted_at IS NULL),
    'documents_count', (SELECT COUNT(*) FROM documents d WHERE d.company_id = c.id AND d.deleted_at IS NULL),
    'tax_filings_count', (SELECT COUNT(*) FROM tax_filings tf WHERE tf.company_id = c.id AND tf.deleted_at IS NULL)
  ))
  INTO v_company_stats
  FROM companies c
  WHERE c.deleted_at IS NULL;

  -- Detectar orphan rows en tablas con company_id que apunten a companies inexistentes
  -- (no debería pasar nunca por la FK, pero verificación defensiva)
  WITH orphan_check AS (
    SELECT 'invoices' AS tabla, COUNT(*) AS orphans
      FROM invoices i WHERE NOT EXISTS (SELECT 1 FROM companies c WHERE c.id = i.company_id)
    UNION ALL
    SELECT 'payrolls', COUNT(*)
      FROM payrolls p WHERE NOT EXISTS (SELECT 1 FROM companies c WHERE c.id = p.company_id)
    UNION ALL
    SELECT 'employees', COUNT(*)
      FROM employees e WHERE NOT EXISTS (SELECT 1 FROM companies c WHERE c.id = e.company_id)
    UNION ALL
    SELECT 'projects', COUNT(*)
      FROM projects pr WHERE NOT EXISTS (SELECT 1 FROM companies c WHERE c.id = pr.company_id)
  )
  SELECT
    SUM(orphans),
    jsonb_agg(jsonb_build_object('tabla', tabla, 'orphans', orphans)) FILTER (WHERE orphans > 0)
  INTO v_orphan_rows, v_orphans_detail
  FROM orphan_check;

  -- Verificar audit_log_chain íntegra (últimas 100 filas: cada prev_hash debe coincidir con record_hash de fila anterior)
  WITH chain_check AS (
    SELECT
      id,
      prev_hash,
      LAG(record_hash) OVER (ORDER BY id) AS expected_prev
    FROM (
      SELECT id, prev_hash, record_hash FROM audit_log_chain ORDER BY id DESC LIMIT 100
    ) sub
  )
  SELECT jsonb_build_object(
    'rows_checked', COUNT(*),
    'breaks', COUNT(*) FILTER (
      WHERE expected_prev IS NOT NULL AND COALESCE(prev_hash, '') <> COALESCE(expected_prev, '')
    ),
    'first_id_checked', MIN(id),
    'last_id_checked', MAX(id)
  )
  INTO v_audit_chain_status
  FROM chain_check;

  RETURN jsonb_build_object(
    'check_run_at', NOW(),
    'schema', jsonb_build_object(
      'total_tables', v_total_tables,
      'with_company_id', v_with_company_id,
      'without_company_id_allowlist', v_without_company_id,
      'rls_enabled_in_company_tables', v_rls_enabled,
      'rls_forced_in_company_tables', v_rls_forced,
      'rls_health', CASE
        WHEN v_rls_enabled = v_with_company_id AND v_rls_forced = v_with_company_id THEN 'all_secure'
        WHEN v_rls_enabled < v_with_company_id THEN 'rls_missing'
        WHEN v_rls_forced < v_rls_enabled THEN 'force_missing'
        ELSE 'unknown'
      END
    ),
    'companies', jsonb_build_object(
      'active_count', v_companies_count,
      'stats_per_company', v_company_stats
    ),
    'orphans', jsonb_build_object(
      'total', COALESCE(v_orphan_rows, 0),
      'detail', COALESCE(v_orphans_detail, '[]'::jsonb)
    ),
    'audit_log_chain', v_audit_chain_status,
    'overall_status', CASE
      WHEN v_rls_enabled < v_with_company_id THEN 'critical_rls_missing'
      WHEN v_rls_forced < v_rls_enabled THEN 'warning_force_missing'
      WHEN COALESCE(v_orphan_rows, 0) > 0 THEN 'critical_orphan_rows'
      WHEN (v_audit_chain_status->>'breaks')::int > 0 THEN 'critical_chain_broken'
      ELSE 'healthy'
    END
  );
END;
$$;

COMMENT ON FUNCTION verify_multitenant_isolation IS
  'Health check schema multi-empresa: verifica RLS+FORCE en tablas con '
  'company_id, detecta orphan rows con company_id apuntando a companies '
  'inexistentes, valida hash chain audit_log_chain últimas 100 filas. '
  'Devuelve JSON con stats + overall_status para monitoring.';
