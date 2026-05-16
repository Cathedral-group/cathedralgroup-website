-- Migration: extender CHECK constraint admin_audit_log.action (audit 16/05 noche)
--
-- Bug crítico detectado por doc-validator: el constraint original solo aceptaba
-- ('create','update','delete','restore','permanent_delete','login') — los valores
-- `flag_create`/`flag_update`/`flag_delete` introducidos en commit 72b8247
-- (Server Actions audit log) violaban CHECK → INSERT fallaba silentemente
-- (caught try/catch).
--
-- Server Actions auditAction() helper hizo audit log "no-op" porque cada INSERT
-- recibía 23514 check_violation → caught + console.warn → row no persistida.
--
-- Fix: ampliar CHECK con 3 valores nuevos (flag_create/update/delete) + 3 valores
-- futuros para API endpoints (flag_toggle_api/batch_api/delete_api) que añadiré
-- en próximo commit.
--
-- Test empírico post-migration:
--   INSERT INTO admin_audit_log (user_email, action, table_name, record_id)
--   VALUES ('test', 'flag_update', 'feature_flags', 'test')
--   → OK (id devuelto, no constraint violation).

ALTER TABLE public.admin_audit_log DROP CONSTRAINT admin_audit_log_action_check;

ALTER TABLE public.admin_audit_log ADD CONSTRAINT admin_audit_log_action_check
  CHECK (action IN (
    -- Valores originales (preexistentes desde sesión 28 abril)
    'create',
    'update',
    'delete',
    'restore',
    'permanent_delete',
    'login',
    -- Server Actions feature-flags (introducidos commit 72b8247)
    'flag_create',
    'flag_update',
    'flag_delete',
    -- API endpoints admin feature-flag-* (introducidos próximo commit)
    'flag_toggle_api',
    'flag_batch_api',
    'flag_delete_api'
  ));
