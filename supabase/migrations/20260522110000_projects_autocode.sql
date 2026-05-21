-- ============================================================================
-- Cathedral Group — Código de proyecto automático (22/05/2026)
--
-- Feedback David: "el código lo asignas tú, nosotros solo ponemos la dirección.
-- Tiene que ser el sucesivo al último."
--
-- Trigger BEFORE INSERT que, si el code viene vacío/NULL, genera PREFIJO-AÑO-NNN
-- secuencial dentro de prefijo+año. Prefijo según el tipo de proyecto.
-- Advisory lock por (prefijo+año) para que dos altas simultáneas no choquen.
-- ============================================================================

SET lock_timeout = '3s';
SET statement_timeout = '30s';

BEGIN;

CREATE OR REPLACE FUNCTION public.projects_autocode()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_prefix text;
  v_year int;
  v_seq int;
BEGIN
  -- Si ya trae código manual, respetarlo
  IF NEW.code IS NOT NULL AND NEW.code <> '' THEN
    RETURN NEW;
  END IF;

  v_prefix := CASE NEW.type
    WHEN 'obra_nueva'           THEN 'OBN'
    WHEN 'cambio_uso'           THEN 'CDU'
    WHEN 'promocion'            THEN 'PRO'
    WHEN 'desarrollo'           THEN 'PRO'
    WHEN 'compra_reforma_venta' THEN 'FLP'
    ELSE 'OBR'  -- reforma, reforma_cliente, interiorismo y cualquier otro
  END;
  v_year := EXTRACT(YEAR FROM now())::int;

  -- Serializa altas del mismo prefijo+año (evita colisión de secuencia)
  PERFORM pg_advisory_xact_lock(hashtext(v_prefix || '-' || v_year::text));

  SELECT COALESCE(MAX(SUBSTRING(code FROM '[0-9]+$')::int), 0) + 1
    INTO v_seq
    FROM public.projects
    WHERE code LIKE v_prefix || '-' || v_year || '-%';

  NEW.code := v_prefix || '-' || v_year || '-' || LPAD(v_seq::text, 3, '0');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER projects_autocode_trg
  BEFORE INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.projects_autocode();

COMMENT ON FUNCTION public.projects_autocode IS
  'Autogenera projects.code (PREFIJO-AÑO-NNN secuencial) si viene vacío. Prefijo por tipo: OBR/PRO/FLP/OBN/CDU. Advisory lock por prefijo+año. Sesión 22/05.';

COMMIT;

NOTIFY pgrst, 'reload schema';
