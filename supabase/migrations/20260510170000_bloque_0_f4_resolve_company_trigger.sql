-- Bloque 0 F4 — Auto-resolución de company_id por NIF receptor (vía DB trigger)
--
-- Por qué esta migración existe (alternativa elegante a tocar n8n)
--   F4 original: añadir nodo "Resolver Company por NIF" al workflow n8n general
--   LWZWxjo9O5ku7tF7 (81 nodos críticos en producción). Riesgo alto de romper
--   procesado de facturas reales.
--
--   F4 alternativo (esta migración): trigger BEFORE INSERT en invoices que
--   llama RPC resolve_company_for_nif(nif_receptor) automáticamente. Cuando
--   aparezca la 2ª SL del grupo y llegue una factura con nif_receptor=<CIF
--   2ª SL>, el trigger asigna company_id correcto sin tocar n8n.
--
--   Mientras solo hay 1 SL (Cathedral), TODAS las invoices reciben Cathedral
--   por DEFAULT (F2) y la lógica del trigger es no-op. El día que aparezca
--   Reformas SL en companies, el trigger empieza a discriminar automáticamente.
--
-- Campos relevantes en invoices
--   - direction: 'emitida' | 'recibida'
--   - nif_receptor: NIF del receptor (= CIF de la SL del grupo si direction='recibida')
--   - supplier_nif: NIF del proveedor (cuando recibida)
--
-- Lógica
--   - direction='recibida' + nif_receptor matchea companies.cif → company_id = ese
--   - direction='recibida' + nif_receptor no matchea → mantener company_id (Cathedral
--     por DEFAULT en F2) + flag needs_company_assignment=true (revisión manual)
--   - direction='emitida' → respetar company_id que venga del código admin (F3 core).
--     Si no viene, mantener DEFAULT Cathedral.
--
-- Sprint Bloque 0 F4 — sesión 10/05/2026 noche tarde, post F1+F2+F3+F5-BD.

-- ============================================================================
-- 1. Columna needs_company_assignment para flag revisión manual
-- ============================================================================
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS needs_company_assignment BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN invoices.needs_company_assignment IS
  'F4 — true si el trigger no pudo resolver company_id automáticamente desde '
  'nif_receptor. Default Cathedral (F2) pero requiere revisión humana en '
  '/admin/revision para confirmar a qué SL del grupo pertenece.';

CREATE INDEX IF NOT EXISTS idx_invoices_needs_company_assignment
  ON invoices(needs_company_assignment, created_at DESC)
  WHERE needs_company_assignment = true AND deleted_at IS NULL;

-- ============================================================================
-- 2. RPC resolve_company_for_nif — devuelve company_id si matchea, NULL si no
-- ============================================================================
CREATE OR REPLACE FUNCTION resolve_company_for_nif(p_nif TEXT)
RETURNS UUID
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
BEGIN
  IF p_nif IS NULL OR length(trim(p_nif)) = 0 THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_company_id
    FROM companies
    WHERE upper(trim(cif)) = upper(trim(p_nif))
      AND deleted_at IS NULL
      AND status = 'ACTIVE'
    LIMIT 1;

  RETURN v_company_id;
END;
$$;

COMMENT ON FUNCTION resolve_company_for_nif IS
  'F4 — busca company del grupo por CIF (case-insensitive, trim). Devuelve '
  'UUID si matchea, NULL si no. Solo considera companies activas no '
  'soft-deleted.';

-- ============================================================================
-- 3. Trigger BEFORE INSERT en invoices — auto-resolución
-- ============================================================================
CREATE OR REPLACE FUNCTION invoices_resolve_company_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_resolved_company_id UUID;
BEGIN
  -- Solo aplica a facturas recibidas (las emitidas las controla el frontend
  -- admin via header X-Active-Company-Id en F3 core).
  IF NEW.direction <> 'recibida' THEN
    RETURN NEW;
  END IF;

  -- Si nif_receptor está vacío, mantener company_id por DEFAULT (Cathedral)
  -- y flagear para revisión.
  IF NEW.nif_receptor IS NULL OR length(trim(NEW.nif_receptor)) = 0 THEN
    NEW.needs_company_assignment := true;
    RETURN NEW;
  END IF;

  -- Resolver via RPC
  v_resolved_company_id := resolve_company_for_nif(NEW.nif_receptor);

  IF v_resolved_company_id IS NULL THEN
    -- NIF receptor no matchea ninguna company del grupo. Posibles causas:
    --   a) NIF mal extraído por IA (typo)
    --   b) Cathedral aún no registró la SL en companies (data race)
    --   c) Factura legítima dirigida a otra empresa (error proveedor)
    -- En cualquier caso: flag para revisión humana.
    NEW.needs_company_assignment := true;
    -- company_id se mantiene en DEFAULT Cathedral (F2) o el que venga del INSERT
  ELSE
    -- NIF matchea una company del grupo. Sobreescribir company_id solo si NO
    -- vino explícitamente o vino apuntando a otra cosa (priorizar el match real).
    -- Excepción: si ya viene company_id explícito Y matchea, respetar.
    IF NEW.company_id IS NULL OR NEW.company_id <> v_resolved_company_id THEN
      NEW.company_id := v_resolved_company_id;
    END IF;
    NEW.needs_company_assignment := false;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION invoices_resolve_company_id IS
  'F4 trigger BEFORE INSERT: auto-resuelve company_id desde nif_receptor para '
  'facturas recibidas. Si NIF matchea companies.cif del grupo → asigna correcto. '
  'Si no → mantiene DEFAULT (F2 Cathedral) + needs_company_assignment=true para '
  'revisión humana.';

DROP TRIGGER IF EXISTS invoices_resolve_company_trg ON invoices;
CREATE TRIGGER invoices_resolve_company_trg
BEFORE INSERT ON invoices
FOR EACH ROW EXECUTE FUNCTION invoices_resolve_company_id();

-- ============================================================================
-- 4. Backfill: marcar invoices existentes que necesitan revisión
--    Sólo flagear las recibidas con nif_receptor que NO matchea Cathedral.
-- ============================================================================
UPDATE invoices
  SET needs_company_assignment = true
  WHERE direction = 'recibida'
    AND deleted_at IS NULL
    AND nif_receptor IS NOT NULL
    AND length(trim(nif_receptor)) > 0
    AND upper(trim(nif_receptor)) <> 'B19761915'  -- Cathedral CIF
    AND needs_company_assignment = false;

-- ============================================================================
-- 5. Vista de revisión: invoices_pending_company_assignment
-- ============================================================================
CREATE OR REPLACE VIEW invoices_pending_company_assignment AS
SELECT
  i.id,
  i.created_at,
  i.direction,
  i.nif_receptor,
  i.supplier_nif,
  i.amount_total,
  i.issue_date,
  i.empresa,
  i.company_id AS current_company_id,
  c.razon_social AS current_company_name,
  i.needs_company_assignment
FROM invoices i
LEFT JOIN companies c ON c.id = i.company_id
WHERE i.needs_company_assignment = true
  AND i.deleted_at IS NULL
ORDER BY i.created_at DESC;

COMMENT ON VIEW invoices_pending_company_assignment IS
  'F4 — facturas que el trigger no pudo asignar automáticamente a una company '
  'del grupo. Requieren revisión humana en /admin/revision (panel admin lee '
  'esta vista cuando aparezca segunda SL).';

-- ============================================================================
-- 6. RPC stat para dashboard: contadores por estado de asignación
-- ============================================================================
CREATE OR REPLACE FUNCTION invoices_company_assignment_stats(p_window_days INT DEFAULT 30)
RETURNS TABLE(
  total_recent BIGINT,
  needs_assignment BIGINT,
  auto_assigned BIGINT,
  pct_auto_assigned NUMERIC
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_total BIGINT;
  v_needs BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_total
    FROM invoices
    WHERE direction = 'recibida'
      AND deleted_at IS NULL
      AND created_at >= NOW() - (p_window_days || ' days')::interval;

  SELECT COUNT(*) INTO v_needs
    FROM invoices
    WHERE direction = 'recibida'
      AND deleted_at IS NULL
      AND created_at >= NOW() - (p_window_days || ' days')::interval
      AND needs_company_assignment = true;

  RETURN QUERY SELECT
    v_total,
    v_needs,
    v_total - v_needs,
    CASE WHEN v_total = 0 THEN NULL
         ELSE ROUND(((v_total - v_needs)::numeric / v_total) * 100, 2)
    END;
END;
$$;

COMMENT ON FUNCTION invoices_company_assignment_stats IS
  'F4 — KPIs de auto-resolución: total facturas recibidas, cuántas necesitan '
  'asignación manual, % auto-resueltas. Default ventana 30 días.';
