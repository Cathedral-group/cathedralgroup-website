-- Roadmap libro horas — corrección calendario laboral Sector Construcción Madrid 2026
--
-- David envía calendario oficial CCOO Hábitat:
--   - 1.736 h efectivas anuales / 176 h vacaciones (22 días × 8h)
--   - Jornada continua 7h del 13 julio al 13 agosto
--   - Festivos de convenio (FC) adicionales
--   - No laborables no recuperables (NLNR): 2-5 ene, 6 abr, 14 ago, 24-31 dic
--
-- Ajustes:
--   1. Ampliar CHECK del ámbito holidays para incluir 'convenio' y 'no_laborable'
--   2. Insertar festivos faltantes (FC + NLNR del convenio construcción)
--   3. Actualizar get_jornada_esperada_horas:
--      - Considerar nuevos ámbitos como festivos
--      - Aplicar 7h/día durante jornada continua verano (13 jul - 13 ago)

-- 1. Ampliar CHECK
ALTER TABLE holidays DROP CONSTRAINT IF EXISTS holidays_ambito_check;
ALTER TABLE holidays ADD CONSTRAINT holidays_ambito_check
  CHECK (ambito IN ('nacional', 'autonomico', 'local', 'empresa', 'convenio', 'no_laborable'));

COMMENT ON COLUMN holidays.ambito IS
  'nacional: festivo BOE; autonomico: BOCM o equivalente; local: ayuntamiento; '
  'empresa: pacto empresarial; convenio: festivo sectorial (convenio construcción); '
  'no_laborable: día no laborable no recuperable del convenio (NLNR).';

-- 2. Festivos faltantes Sector Construcción Madrid 2026 (calendario CCOO Hábitat)
INSERT INTO holidays (fecha, nombre, ambito, comunidad_autonoma, fuente)
VALUES
  -- No laborables no recuperables (NLNR)
  ('2026-01-02', 'No laborable (puente Reyes)', 'no_laborable', 'MADRID', 'Convenio Construcción Madrid 2026'),
  ('2026-04-06', 'No laborable (lunes Pascua)', 'no_laborable', 'MADRID', 'Convenio Construcción Madrid 2026'),
  ('2026-08-14', 'No laborable (puente Asunción)', 'no_laborable', 'MADRID', 'Convenio Construcción Madrid 2026'),
  ('2026-12-24', 'No laborable (Nochebuena)', 'no_laborable', 'MADRID', 'Convenio Construcción Madrid 2026'),
  ('2026-12-31', 'No laborable (Nochevieja)', 'no_laborable', 'MADRID', 'Convenio Construcción Madrid 2026'),
  -- Festivos de convenio (FC)
  ('2026-01-05', 'Festivo de convenio (puente Reyes)', 'convenio', 'MADRID', 'Convenio Construcción Madrid 2026'),
  ('2026-05-14', 'Festivo de convenio (víspera San Isidro)', 'convenio', 'MADRID', 'Convenio Construcción Madrid 2026')
ON CONFLICT DO NOTHING;

-- 3. Update función jornada esperada para incluir nuevos ámbitos + jornada verano
CREATE OR REPLACE FUNCTION get_jornada_esperada_horas(
  p_fecha DATE,
  p_company_id UUID DEFAULT NULL
) RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dow INT := EXTRACT(DOW FROM p_fecha)::int; -- 0=dom, 1=lun, ..., 6=sab
  v_es_festivo BOOLEAN;
  v_es_jornada_continua BOOLEAN;
BEGIN
  -- Sábado y domingo: 0
  IF v_dow IN (0, 6) THEN RETURN 0; END IF;

  -- Festivo (cualquier ámbito que aplique)
  SELECT EXISTS(
    SELECT 1 FROM holidays h
    WHERE h.fecha = p_fecha
      AND (
        h.ambito = 'nacional'
        OR (h.ambito = 'autonomico' AND h.comunidad_autonoma = 'MADRID')
        OR (h.ambito = 'local' AND h.municipio = 'Madrid')
        OR (h.ambito = 'convenio' AND h.comunidad_autonoma = 'MADRID')
        OR (h.ambito = 'no_laborable' AND h.comunidad_autonoma = 'MADRID')
        OR (h.ambito = 'empresa' AND h.company_id = p_company_id)
      )
  ) INTO v_es_festivo;

  IF v_es_festivo THEN RETURN 0; END IF;

  -- Jornada continua 7h: 13 julio a 13 agosto (convenio construcción Madrid)
  v_es_jornada_continua := (
    p_fecha >= make_date(EXTRACT(YEAR FROM p_fecha)::int, 7, 13)
    AND p_fecha <= make_date(EXTRACT(YEAR FROM p_fecha)::int, 8, 13)
  );

  IF v_es_jornada_continua THEN
    -- L-V durante jornada continua: 7h efectivas
    RETURN 7;
  END IF;

  -- Resto del año: viernes 4h, L-J 9h
  IF v_dow = 5 THEN RETURN 4; END IF;
  RETURN 9;
END;
$$;

COMMENT ON FUNCTION get_jornada_esperada_horas IS
  'Calendario laboral Sector Construcción Madrid 2026: '
  'L-J 9h efectivas (8-18 con 1h comer); V 4h (8-12); '
  'Jornada continua 7h del 13/07 al 13/08; '
  'Festivos nacional/autonómico/local/convenio/no_laborable Madrid → 0; '
  '1.736 h efectivas anuales totales según convenio.';
