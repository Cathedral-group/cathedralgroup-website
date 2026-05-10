-- Sprint A Backup Robusto — tabla backup_runs + RPCs alarma + record
--
-- Por qué esta migración existe
--   Cathedral tiene backups (GitHub Actions schedule + cron Hetzner) pero
--   nadie verifica que se ejecutan ni si triunfan. Patrón que tumbó a GitLab
--   2017 (5 técnicas de backup, 0 funcionando cuando hizo falta) y motiva la
--   regla `feedback_sistema_infalible.md` (sin "puede fallar"). Esta tabla
--   registra cada ejecución para:
--     1. Alarma automática si último backup_runs.status='success' >26h
--     2. Auditoría ante AEPD (art. 5.1.f RGPD integridad+disponibilidad)
--     3. Trazabilidad SHA-256 + ubicaciones (Drive + R2 cuando se active)
--     4. Verificación de restore drills documentados
--
-- Sprint A — sesión 10/05/2026 tarde, post-auditoría 3 agentes eruditos.

CREATE TABLE backup_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Cuándo
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  -- Quién/cómo lo disparó
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'cron',           -- GitHub Actions schedule cron diario
    'manual',         -- Botón /admin/sistema
    'pre_migration',  -- Snapshot on-demand antes de aplicar migración
    'fire_drill',     -- Restore drill semanal/mensual
    'github_actions', -- workflow_dispatch desde UI GitHub
    'hetzner_cron'    -- cron Linux Hetzner para n8n volume
  )),
  triggered_by TEXT,  -- email admin si manual, 'github-actions' o 'hetzner-cron' si auto

  -- Qué tipo de backup
  backup_type TEXT NOT NULL CHECK (backup_type IN (
    'pg_dump',        -- pg_dump --format=custom de la BD Supabase
    'n8n_volume',     -- tar.gz del volumen Docker n8n_data
    'full_combined'   -- ambos en una sola ejecución (futuro)
  )),
  category TEXT CHECK (category IN ('daily', 'weekly', 'monthly', 'manual', 'pre_migration', 'fire_drill')),

  -- Estado de la ejecución
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'success', 'failed')),

  -- Detalles del archivo generado
  file_size_bytes BIGINT,
  file_sha256     TEXT,
  file_locations  JSONB DEFAULT '{}'::jsonb,  -- {drive: 'gid', r2: 'bucket/key', github_artifact: 'run_id'}

  -- Cifrado GPG (Sprint A capa 2)
  gpg_encrypted   BOOLEAN DEFAULT false,
  gpg_recipient   TEXT,  -- 'backups@cathedralgroup.es'
  gpg_fingerprint TEXT,  -- 'CA85D0ED5C35D808EC7E664E6B3E392F09F26DA1'

  -- Verificación restore (Sprint A capa 1 — fire drill)
  restore_verified_at      TIMESTAMPTZ,
  restore_verified_status  TEXT CHECK (restore_verified_status IN ('passed', 'failed')),
  restore_verified_details JSONB,

  -- Errores
  error_message TEXT,
  error_details JSONB,

  -- Metadata libre (Hetzner uptime, github run_id, etc.)
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE backup_runs IS
  'Sprint A Backup Robusto — registro de cada ejecución del sistema backup '
  '(pg_dump diario, n8n volume, manual). Cubre auditoría AEPD/AML art. 5.1.f RGPD '
  '+ alarma backup-stale automática.';
COMMENT ON COLUMN backup_runs.trigger_type IS
  'Quién/qué disparó: cron (GH Actions schedule), manual (botón admin), '
  'pre_migration (snapshot on-demand), fire_drill (restore test), '
  'github_actions (workflow_dispatch UI), hetzner_cron (cron Linux n8n)';
COMMENT ON COLUMN backup_runs.file_locations IS
  'Ubicaciones del archivo: {drive: "gdrive_file_id", r2: "bucket/key", '
  'github_artifact: "run_id"}';

-- Trigger updated_at
CREATE OR REPLACE FUNCTION backup_runs_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER backup_runs_updated_at_trigger
BEFORE UPDATE ON backup_runs
FOR EACH ROW EXECUTE FUNCTION backup_runs_set_updated_at();

-- Indexes para queries frecuentes
CREATE INDEX idx_backup_runs_started_at ON backup_runs(started_at DESC);
CREATE INDEX idx_backup_runs_status_pending ON backup_runs(status, started_at DESC)
  WHERE status IN ('failed', 'pending', 'running');
CREATE INDEX idx_backup_runs_type_started ON backup_runs(backup_type, started_at DESC);
CREATE INDEX idx_backup_runs_type_success ON backup_runs(backup_type, completed_at DESC)
  WHERE status = 'success';

-- RLS: tabla bloqueada por defecto. Acceso solo vía service_role en endpoints
-- y via RPC `record_backup_run` SECURITY DEFINER.
ALTER TABLE backup_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup_runs FORCE ROW LEVEL SECURITY;

-- RPC `is_backup_stale` — usado por cron Vercel /api/cron/backup-stale-check
-- Devuelve un row por cada backup_type esperado. Si NO hay registros success
-- recientes, devuelve hours_since_last_success=99999 e is_stale=true.
CREATE OR REPLACE FUNCTION is_backup_stale(p_threshold_hours INT DEFAULT 26)
RETURNS TABLE(
  backup_type              TEXT,
  last_success_at          TIMESTAMPTZ,
  hours_since_last_success NUMERIC,
  is_stale                 BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH expected_types AS (
    SELECT unnest(ARRAY['pg_dump', 'n8n_volume']) AS bt
  ),
  last_success AS (
    SELECT
      br.backup_type AS bt,
      MAX(br.completed_at) AS max_completed
    FROM backup_runs br
    WHERE br.status = 'success'
    GROUP BY br.backup_type
  )
  SELECT
    et.bt::TEXT,
    ls.max_completed,
    COALESCE(
      ROUND(EXTRACT(EPOCH FROM (NOW() - ls.max_completed)) / 3600.0, 2),
      99999::numeric
    ),
    COALESCE(
      EXTRACT(EPOCH FROM (NOW() - ls.max_completed)) / 3600.0 > p_threshold_hours,
      true
    )
  FROM expected_types et
  LEFT JOIN last_success ls ON ls.bt = et.bt;
END;
$$;

COMMENT ON FUNCTION is_backup_stale IS
  'Devuelve por backup_type si han pasado más de N horas sin backup exitoso. '
  'Llamado por cron Vercel cada 6h. Si is_stale=true crea system_notification critical.';

-- RPC `record_backup_run` — usada por GitHub Actions, Hetzner cron, n8n
-- workflow al final del backup para registrar el resultado.
CREATE OR REPLACE FUNCTION record_backup_run(
  p_trigger_type      TEXT,
  p_backup_type       TEXT,
  p_status            TEXT,
  p_category          TEXT     DEFAULT NULL,
  p_triggered_by      TEXT     DEFAULT 'system',
  p_file_size_bytes   BIGINT   DEFAULT NULL,
  p_file_sha256       TEXT     DEFAULT NULL,
  p_file_locations    JSONB    DEFAULT '{}'::jsonb,
  p_gpg_encrypted     BOOLEAN  DEFAULT false,
  p_gpg_fingerprint   TEXT     DEFAULT NULL,
  p_error_message     TEXT     DEFAULT NULL,
  p_metadata          JSONB    DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO backup_runs(
    trigger_type, backup_type, status, category, triggered_by,
    file_size_bytes, file_sha256, file_locations,
    gpg_encrypted, gpg_recipient, gpg_fingerprint,
    error_message, metadata,
    completed_at
  ) VALUES (
    p_trigger_type, p_backup_type, p_status, p_category, p_triggered_by,
    p_file_size_bytes, p_file_sha256, p_file_locations,
    p_gpg_encrypted,
    CASE WHEN p_gpg_encrypted THEN 'backups@cathedralgroup.es' ELSE NULL END,
    p_gpg_fingerprint,
    p_error_message, p_metadata,
    CASE WHEN p_status IN ('success', 'failed') THEN NOW() ELSE NULL END
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION record_backup_run IS
  'RPC para que GitHub Actions / Hetzner / n8n registren un backup ejecutado. '
  'Llamado desde POST /api/cron/backup-record con Bearer AUDIT_CRON_SECRET.';

-- RPC `record_backup_restore_test` — actualiza una row backup_runs cuando
-- el fire drill restore termina (passed/failed con detalles).
CREATE OR REPLACE FUNCTION record_backup_restore_test(
  p_backup_run_id UUID,
  p_status        TEXT,
  p_details       JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE backup_runs
  SET
    restore_verified_at      = NOW(),
    restore_verified_status  = p_status,
    restore_verified_details = p_details
  WHERE id = p_backup_run_id;

  RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION record_backup_restore_test IS
  'Actualiza una row backup_runs con resultado del fire drill restore '
  '(passed/failed + JSONB details: row_counts, sha256_match, etc.).';
