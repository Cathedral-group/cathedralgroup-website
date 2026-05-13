-- ============================================================================
-- Migration: explicit grants for public schema (Supabase Oct 30, 2026 policy)
-- Date: 2026-05-14
--
-- Context: Supabase announced (email 14/05/2026):
--   - May 30, 2026: new projects → new public tables NO auto-grant to
--     anon/authenticated/service_role.
--   - Oct 30, 2026: enforced on EXISTING projects (Cathedral included).
--     Existing tables keep their grants; NEW tables created after that date
--     will have NO grants and Data API (supabase-js/PostgREST/GraphQL) calls
--     will return HTTP error 42501 until explicit GRANT statements run.
--
-- This migration:
--   1. Applies explicit GRANT ALL on the 96 existing public tables (mirror of
--      current de-facto state; idempotent; defense in depth against any
--      retroactive policy change).
--   2. Sets ALTER DEFAULT PRIVILEGES so future tables created by postgres
--      auto-grant anon/authenticated/service_role.
--   3. Covers sequences + functions + schema USAGE.
--
-- NOTE on supabase_admin default privileges: the Management API PAT lacks
-- privilege to ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin. Tables
-- created by supabase_admin already inherit grants via existing default ACL
-- (verified via pg_default_acl pre-migration). If Supabase changes that in
-- the future, run the supabase_admin variant via Dashboard SQL Editor logged
-- in as a superuser.
--
-- RLS+FORCE keeps controlling row access — these grants are role-level table
-- access. anon tightening (ALL → SELECT-only on selected tables) deferred to
-- future security audit.
-- ============================================================================

-- 1) Explicit GRANT ALL on every existing public table (idempotent)
DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('GRANT ALL PRIVILEGES ON TABLE public.%I TO service_role', t.tablename);
    EXECUTE format('GRANT ALL PRIVILEGES ON TABLE public.%I TO authenticated', t.tablename);
    EXECUTE format('GRANT ALL PRIVILEGES ON TABLE public.%I TO anon', t.tablename);
  END LOOP;
END $$;

-- 2) Default privileges for future tables (postgres role)
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL PRIVILEGES ON TABLES TO service_role, authenticated, anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO service_role, authenticated, anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO service_role, authenticated, anon;

-- 3) Schema USAGE (idempotent — required for any access to objects within)
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- 4) Explicit grants on existing sequences
DO $$
DECLARE
  s RECORD;
BEGIN
  FOR s IN
    SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public'
  LOOP
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO service_role, authenticated, anon', s.sequence_name);
  END LOOP;
END $$;
