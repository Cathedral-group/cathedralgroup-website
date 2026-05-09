-- Sprint adicional 10/05 — Auditor 1: "Detector typo/homoglyph en nombre proveedor.
-- Levenshtein <2 ya existe para number; replicar para name evita 'ACME S.L.' vs 'ACMÉ S.L.'
-- como entidades distintas".
--
-- Crea 2 RPCs simétricas:
-- - find_similar_supplier_name(p_name, p_max_distance)
-- - find_similar_client_name(p_name, p_max_distance)
--
-- Útiles desde panel admin (sugerencias al crear nueva entidad) y desde workflow
-- Cascada Supplier (evitar crear duplicados con nombres parecidos).

CREATE OR REPLACE FUNCTION public.find_similar_supplier_name(
  p_name text,
  p_max_distance int DEFAULT 3,
  p_exclude_id uuid DEFAULT NULL,
  p_limit int DEFAULT 10
)
RETURNS TABLE(
  id uuid,
  nif text,
  name text,
  distance int,
  similarity numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized text;
BEGIN
  IF p_name IS NULL OR LENGTH(TRIM(p_name)) < 3 THEN
    RETURN;
  END IF;

  -- Normalizar: lowercase + quitar acentos + colapsar espacios
  v_normalized := LOWER(TRIM(REGEXP_REPLACE(
    UNACCENT(p_name),
    '\s+', ' ', 'g'
  )));

  RETURN QUERY
  SELECT
    suppliers.id,
    suppliers.nif,
    suppliers.name,
    levenshtein(
      v_normalized,
      LOWER(TRIM(REGEXP_REPLACE(UNACCENT(suppliers.name), '\s+', ' ', 'g')))
    ) AS distance,
    similarity(
      v_normalized,
      LOWER(TRIM(REGEXP_REPLACE(UNACCENT(suppliers.name), '\s+', ' ', 'g')))
    )::numeric AS similarity
  FROM suppliers
  WHERE suppliers.deleted_at IS NULL
    AND suppliers.name IS NOT NULL
    AND (p_exclude_id IS NULL OR suppliers.id <> p_exclude_id)
    AND levenshtein(
      v_normalized,
      LOWER(TRIM(REGEXP_REPLACE(UNACCENT(suppliers.name), '\s+', ' ', 'g')))
    ) <= p_max_distance
  ORDER BY distance ASC, similarity DESC
  LIMIT p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.find_similar_client_name(
  p_name text,
  p_max_distance int DEFAULT 3,
  p_exclude_id uuid DEFAULT NULL,
  p_limit int DEFAULT 10
)
RETURNS TABLE(
  id uuid,
  nif_cif text,
  name text,
  distance int,
  similarity numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized text;
BEGIN
  IF p_name IS NULL OR LENGTH(TRIM(p_name)) < 3 THEN
    RETURN;
  END IF;

  v_normalized := LOWER(TRIM(REGEXP_REPLACE(
    UNACCENT(p_name),
    '\s+', ' ', 'g'
  )));

  RETURN QUERY
  SELECT
    clients.id,
    clients.nif_cif,
    clients.name,
    levenshtein(
      v_normalized,
      LOWER(TRIM(REGEXP_REPLACE(UNACCENT(clients.name), '\s+', ' ', 'g')))
    ) AS distance,
    similarity(
      v_normalized,
      LOWER(TRIM(REGEXP_REPLACE(UNACCENT(clients.name), '\s+', ' ', 'g')))
    )::numeric AS similarity
  FROM clients
  WHERE clients.deleted_at IS NULL
    AND clients.name IS NOT NULL
    AND (p_exclude_id IS NULL OR clients.id <> p_exclude_id)
    AND levenshtein(
      v_normalized,
      LOWER(TRIM(REGEXP_REPLACE(UNACCENT(clients.name), '\s+', ' ', 'g')))
    ) <= p_max_distance
  ORDER BY distance ASC, similarity DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.find_similar_supplier_name(text, int, uuid, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.find_similar_client_name(text, int, uuid, int) TO service_role;

COMMENT ON FUNCTION public.find_similar_supplier_name IS
  'Detección de proveedores con nombre similar (Levenshtein + trigram similarity).
   Normaliza acentos y espacios. Útil para evitar duplicados como "ACME S.L." vs "ACMÉ S.L.".
   Sesión 10/05 — auditoría agente 1 detector typo proveedor.';
