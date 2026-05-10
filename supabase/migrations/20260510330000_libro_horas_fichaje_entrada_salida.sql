-- Roadmap libro horas — fichaje entrada/salida con geo
--
-- David: "tenemos que implementar la geolocalización al fichaje de entrada y al cierre".
--
-- Modelo: trabajador puede fichar puntualmente al llegar (entrada) y al irse (salida).
-- Cada fichaje guarda hora + geo. El sistema calcula horas_ordinarias automáticamente.
-- También sigue funcionando el modo manual de meter horas.

-- Campos para tracking geo separado por entrada y salida
ALTER TABLE time_records
  ADD COLUMN IF NOT EXISTS entrada_geo_lat NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS entrada_geo_lng NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS entrada_geo_accuracy_m INT,
  ADD COLUMN IF NOT EXISTS entrada_geofence_status TEXT
    CHECK (entrada_geofence_status IS NULL OR entrada_geofence_status IN ('within','outside','no_data','low_accuracy')),
  ADD COLUMN IF NOT EXISTS salida_geo_lat NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS salida_geo_lng NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS salida_geo_accuracy_m INT,
  ADD COLUMN IF NOT EXISTS salida_geofence_status TEXT
    CHECK (salida_geofence_status IS NULL OR salida_geofence_status IN ('within','outside','no_data','low_accuracy'));

COMMENT ON COLUMN time_records.entrada_geo_lat IS
  'Lat del fichaje de entrada (al pulsar "Iniciar jornada"). Distinto de device_geo_* que '
  'corresponde al momento de firmar el parte completo.';
