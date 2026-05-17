-- gmail_poll_state security fix: RLS estaba DISABLED (anon expone rows).
-- ENABLE+FORCE+policy service_role only. 7 rows producción afectadas.

ALTER TABLE public.gmail_poll_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gmail_poll_state FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname='service_role_full_access' AND polrelid='public.gmail_poll_state'::regclass) THEN
    CREATE POLICY "service_role_full_access" ON public.gmail_poll_state FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gmail_poll_state TO service_role;
