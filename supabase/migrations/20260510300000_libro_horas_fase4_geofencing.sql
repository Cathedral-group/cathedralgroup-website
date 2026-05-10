-- Roadmap libro de horas — Fase 4 (geofencing + cuadrante extendido)
--
-- David: "Las ubicaciones muchas veces en el centro de Madrid pueden irse de 100m a más.
-- Tal vez debería ser un poquito más de rango."
--
-- Diseño:
--   - Default 300m por proyecto (configurable, mayoría obras Cathedral en Madrid centro)
--   - Aviso informativo, NO bloqueante (siempre puede haber caso legítimo)
--   - GPS multipath en edificios altos puede dar 30-200m de error sin culpa del trabajador

-- 1. Coordenadas + radio por proyecto (project_locations)
CREATE TABLE IF NOT EXISTS project_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  lat NUMERIC(10,7) NOT NULL,
  lng NUMERIC(10,7) NOT NULL,
  radio_m INT NOT NULL DEFAULT 300 CHECK (radio_m BETWEEN 50 AND 2000),
  direccion TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_email TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  CONSTRAINT project_locations_unique_active UNIQUE (project_id)
);

CREATE INDEX IF NOT EXISTS idx_project_locations_project
  ON project_locations (project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_project_locations_company
  ON project_locations (company_id) WHERE deleted_at IS NULL;

ALTER TABLE project_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_locations FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE project_locations IS
  'Roadmap libro_horas Fase 4 — geofencing por proyecto. Radio default 300m '
  '(Madrid centro tiene GPS multipath, no se puede exigir más precisión). '
  'Validación cliente+server al fichar, AVISO no bloqueante.';

COMMENT ON COLUMN project_locations.radio_m IS
  'Radio del geofence en metros. Default 300 (Madrid centro). Min 50, max 2000.';

-- 2. Función Haversine para distancia entre puntos (metros)
CREATE OR REPLACE FUNCTION haversine_distance_m(
  lat1 NUMERIC, lng1 NUMERIC, lat2 NUMERIC, lng2 NUMERIC
) RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_R CONSTANT NUMERIC := 6371000; -- radio Tierra en metros
  v_phi1 NUMERIC; v_phi2 NUMERIC; v_dphi NUMERIC; v_dlam NUMERIC;
  v_a NUMERIC; v_c NUMERIC;
BEGIN
  IF lat1 IS NULL OR lng1 IS NULL OR lat2 IS NULL OR lng2 IS NULL THEN
    RETURN NULL;
  END IF;
  v_phi1 := RADIANS(lat1);
  v_phi2 := RADIANS(lat2);
  v_dphi := RADIANS(lat2 - lat1);
  v_dlam := RADIANS(lng2 - lng1);
  v_a := SIN(v_dphi/2)^2 + COS(v_phi1) * COS(v_phi2) * SIN(v_dlam/2)^2;
  v_c := 2 * ATAN2(SQRT(v_a), SQRT(1 - v_a));
  RETURN v_R * v_c;
END;
$$;

COMMENT ON FUNCTION haversine_distance_m IS
  'Distancia entre dos coordenadas GPS en metros (fórmula Haversine, Tierra esférica).';

-- 3. Añadir geofence_check al time_record (registro de la posición al fichar)
ALTER TABLE time_records
  ADD COLUMN IF NOT EXISTS device_geo_lat NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS device_geo_lng NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS device_geo_accuracy_m INT,
  ADD COLUMN IF NOT EXISTS geofence_distance_m NUMERIC,
  ADD COLUMN IF NOT EXISTS geofence_status TEXT
    CHECK (geofence_status IS NULL OR geofence_status IN ('within', 'outside', 'no_data', 'low_accuracy'));

COMMENT ON COLUMN time_records.geofence_status IS
  'Resultado check geofence al guardar el parte: within (dentro radio), outside (fuera), '
  'no_data (proyecto sin coords o trabajador sin GPS), low_accuracy (GPS imprecisión > radio). '
  'Solo informativo, NO bloquea el guardado.';

-- 4. RPC para validar geofence al apuntar parte
CREATE OR REPLACE FUNCTION check_geofence(
  p_project_id UUID,
  p_lat NUMERIC,
  p_lng NUMERIC,
  p_accuracy_m INT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_loc RECORD;
  v_distance NUMERIC;
  v_status TEXT;
BEGIN
  IF p_project_id IS NULL OR p_lat IS NULL OR p_lng IS NULL THEN
    RETURN jsonb_build_object('status', 'no_data', 'distance_m', NULL);
  END IF;

  SELECT lat, lng, radio_m, direccion
  INTO v_loc
  FROM project_locations
  WHERE project_id = p_project_id AND deleted_at IS NULL
  LIMIT 1;

  IF v_loc IS NULL THEN
    RETURN jsonb_build_object('status', 'no_data', 'distance_m', NULL,
      'reason', 'Proyecto sin coordenadas configuradas');
  END IF;

  v_distance := haversine_distance_m(v_loc.lat, v_loc.lng, p_lat, p_lng);

  -- Si el GPS del móvil es menos preciso que el radio, no podemos saber si está dentro
  IF p_accuracy_m IS NOT NULL AND p_accuracy_m > v_loc.radio_m THEN
    v_status := 'low_accuracy';
  ELSIF v_distance <= v_loc.radio_m THEN
    v_status := 'within';
  ELSE
    v_status := 'outside';
  END IF;

  RETURN jsonb_build_object(
    'status', v_status,
    'distance_m', ROUND(v_distance),
    'radio_m', v_loc.radio_m,
    'accuracy_m', p_accuracy_m,
    'project_lat', v_loc.lat,
    'project_lng', v_loc.lng,
    'direccion', v_loc.direccion
  );
END;
$$;

COMMENT ON FUNCTION check_geofence IS
  'Comprueba si una posición GPS está dentro del geofence de un proyecto. '
  'Devuelve status (within/outside/low_accuracy/no_data) + distancia. '
  'NUNCA bloquea: sólo informa para audit/UX.';
