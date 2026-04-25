-- Portal token expiration based on quote/project lifecycle.
-- Approved by David 2026-04-25. Reasoning in security_audit_2026-04-25.md.
--
-- Rules:
--   quote.status = 'borrador' / 'enviado'                                 → NULL (no expiration)
--   quote.status = 'aceptado' + project.status NOT 'finalizado/cancelado' → NULL (work in progress)
--   quote.status = 'rechazado'                                            → NOW() + 30 days
--   project.status = 'cancelado'                                          → NOW() + 30 days
--   project.status = 'finalizado' AND end_date_real IS NOT NULL           → end_date_real + 2 years
--   project.status = 'finalizado' AND end_date_real IS NULL               → NOW() + 2 years
--
-- 2-year window post-finalización covers:
--   - Vicios ocultos CC art. 1591: 1 year
--   - LOE acabados: 1 year
--   - LOE habitabilidad: 3 years (note: portal expires before, but client has PDF + can request renewal)
--   - Commercial post-sale review window
--
-- For long-tail post-2-years requests, an admin can manually rotate token (future feature).

-- ============================================================================
-- 1. Add column (default NULL = no expiration, current behavior preserved)
-- ============================================================================
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS portal_token_expires_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN quotes.portal_token_expires_at IS
  'When the portal_token expires (NULL = no expiration). Auto-computed by trigger based on quote/project status.';

-- ============================================================================
-- 2. Helper function: compute expiration for a given context
-- ============================================================================
CREATE OR REPLACE FUNCTION compute_portal_token_expiry(
  p_quote_status   TEXT,
  p_project_status TEXT,
  p_project_end    TIMESTAMPTZ
) RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- Quote rejected → 30 days from now
  IF p_quote_status = 'rechazado' THEN
    RETURN NOW() + INTERVAL '30 days';
  END IF;

  -- Project cancelled → 30 days from now
  IF p_project_status = 'cancelado' THEN
    RETURN NOW() + INTERVAL '30 days';
  END IF;

  -- Project finalized → 2 years from end_date_real (or now if missing)
  IF p_project_status = 'finalizado' THEN
    IF p_project_end IS NOT NULL THEN
      RETURN p_project_end + INTERVAL '2 years';
    ELSE
      RETURN NOW() + INTERVAL '2 years';
    END IF;
  END IF;

  -- Active business state (borrador, enviado, aceptado in-progress) → no expiration
  RETURN NULL;
END;
$$;

-- ============================================================================
-- 3. Trigger on quotes: recompute when quote.status or project_id changes
-- ============================================================================
CREATE OR REPLACE FUNCTION refresh_quote_portal_expiry() RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_project_status TEXT;
  v_project_end    TIMESTAMPTZ;
BEGIN
  -- Only act if portal_token is set
  IF NEW.portal_token IS NULL THEN
    NEW.portal_token_expires_at := NULL;
    RETURN NEW;
  END IF;

  -- Fetch related project
  IF NEW.project_id IS NOT NULL THEN
    SELECT status, end_date_real INTO v_project_status, v_project_end
    FROM projects WHERE id = NEW.project_id;
  END IF;

  NEW.portal_token_expires_at := compute_portal_token_expiry(
    NEW.status,
    v_project_status,
    v_project_end
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quotes_portal_expiry ON quotes;
CREATE TRIGGER trg_quotes_portal_expiry
  BEFORE INSERT OR UPDATE OF status, project_id, portal_token ON quotes
  FOR EACH ROW EXECUTE FUNCTION refresh_quote_portal_expiry();

-- ============================================================================
-- 4. Trigger on projects: recompute expiry of all child quotes when project
--    status or end_date_real changes
-- ============================================================================
CREATE OR REPLACE FUNCTION refresh_quotes_on_project_change() RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only act when relevant fields change
  IF (NEW.status IS DISTINCT FROM OLD.status) OR
     (NEW.end_date_real IS DISTINCT FROM OLD.end_date_real) THEN
    UPDATE quotes
    SET portal_token_expires_at = compute_portal_token_expiry(
      status,
      NEW.status,
      NEW.end_date_real
    )
    WHERE project_id = NEW.id AND portal_token IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_projects_refresh_quote_expiry ON projects;
CREATE TRIGGER trg_projects_refresh_quote_expiry
  AFTER UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION refresh_quotes_on_project_change();

-- ============================================================================
-- 5. Backfill: apply rules to existing quotes
-- ============================================================================
UPDATE quotes q
SET portal_token_expires_at = compute_portal_token_expiry(
  q.status,
  p.status,
  p.end_date_real
)
FROM projects p
WHERE q.project_id = p.id
  AND q.portal_token IS NOT NULL;

-- Update quotes without project_id too
UPDATE quotes
SET portal_token_expires_at = compute_portal_token_expiry(status, NULL, NULL)
WHERE project_id IS NULL AND portal_token IS NOT NULL;
