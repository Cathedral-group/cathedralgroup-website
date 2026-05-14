-- ============================================================
-- Disk Heartbeats + Watchdog (anti-recurrencia ENOSPC)
-- 14/05/2026 — incidente cathedral-incidente-disco-14maig.md
--
-- Sistema de monitoreo pasivo del disco Hetzner. disk-guardian.sh
-- inserta una row aquí cada 15 min. pg_cron en Supabase chequea
-- staleness — si no llega heartbeat > 1h, crea system_notification
-- critical (banner admin). Cubre el caso "cron Hetzner muerto"
-- que disk-guardian local no puede detectar de sí mismo.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.disk_heartbeats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reported_at timestamptz NOT NULL DEFAULT now(),
  host text NOT NULL,
  used_pct int NOT NULL,
  avail text,
  level text DEFAULT 'silent',
  metadata jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS disk_heartbeats_reported_at_idx
  ON public.disk_heartbeats (reported_at DESC);

ALTER TABLE public.disk_heartbeats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disk_heartbeats FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service role all disk_heartbeats" ON public.disk_heartbeats;
CREATE POLICY "service role all disk_heartbeats"
  ON public.disk_heartbeats
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated select disk_heartbeats" ON public.disk_heartbeats;
CREATE POLICY "authenticated select disk_heartbeats"
  ON public.disk_heartbeats
  FOR SELECT TO authenticated
  USING (true);

GRANT ALL PRIVILEGES ON TABLE public.disk_heartbeats TO service_role, authenticated, anon;

CREATE OR REPLACE FUNCTION public.prune_disk_heartbeats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.disk_heartbeats
  WHERE id NOT IN (
    SELECT id FROM public.disk_heartbeats
    ORDER BY reported_at DESC
    LIMIT 1000
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.disk_watchdog_check()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last timestamptz;
  v_age_minutes int;
  v_used int;
  v_avail text;
  v_host text;
BEGIN
  SELECT reported_at, used_pct, avail, host
    INTO v_last, v_used, v_avail, v_host
  FROM public.disk_heartbeats
  ORDER BY reported_at DESC
  LIMIT 1;

  IF v_last IS NULL THEN
    PERFORM public.upsert_system_notification(
      'critical',
      'disk-watchdog: sin heartbeats',
      'No se ha recibido ningun heartbeat de disk-guardian. Cron Hetzner posiblemente caido.',
      'disk-watchdog',
      '{}'::jsonb,
      'disk-watchdog-no-heartbeats'
    );
    RETURN jsonb_build_object('status', 'no_heartbeats');
  END IF;

  v_age_minutes := EXTRACT(EPOCH FROM (now() - v_last))::int / 60;

  IF v_age_minutes > 60 THEN
    PERFORM public.upsert_system_notification(
      'critical',
      'disk-watchdog: heartbeat stale ' || v_age_minutes || ' min',
      'Ultimo heartbeat de disk-guardian fue hace ' || v_age_minutes || ' minutos (host=' || v_host ||
      ', used=' || v_used || '%, avail=' || COALESCE(v_avail,'?') || '). Cron Hetzner caido o servidor down.',
      'disk-watchdog',
      jsonb_build_object('age_minutes', v_age_minutes, 'last_seen', v_last, 'host', v_host, 'used_pct', v_used),
      'disk-watchdog-stale-' || to_char(now(), 'YYYY-MM-DD-HH24')
    );
    RETURN jsonb_build_object('status', 'stale', 'age_minutes', v_age_minutes);
  END IF;

  RETURN jsonb_build_object('status', 'ok', 'age_minutes', v_age_minutes, 'used_pct', v_used);
END;
$$;

GRANT EXECUTE ON FUNCTION public.disk_watchdog_check() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.prune_disk_heartbeats() TO service_role;

-- pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('disk-watchdog','disk-heartbeats-prune');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule('disk-watchdog','*/15 * * * *',$cron$SELECT public.disk_watchdog_check();$cron$);
SELECT cron.schedule('disk-heartbeats-prune','30 3 * * *',$cron$SELECT public.prune_disk_heartbeats();$cron$);

COMMENT ON TABLE public.disk_heartbeats IS 'Heartbeats de disk-guardian.sh en Hetzner. Cada ejecucion (cron */15) inserta una row. Funcion disk_watchdog_check() detecta staleness y crea system_notification critical. Auto-prune diario, retencion ultimos 1000.';
COMMENT ON FUNCTION public.disk_watchdog_check IS 'pg_cron supervisor: detecta heartbeat stale > 1h y notifica al banner admin. Cubre fallo del cron en Hetzner.';
