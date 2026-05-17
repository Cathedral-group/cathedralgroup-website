-- Extiende CHECK constraint admin_audit_log.action con valor 'reprocess_trigger'
-- para el nuevo modo del endpoint POST /api/invoices/reprocess (mode='reprocess').

ALTER TABLE public.admin_audit_log DROP CONSTRAINT IF EXISTS admin_audit_log_action_check;

ALTER TABLE public.admin_audit_log ADD CONSTRAINT admin_audit_log_action_check
  CHECK (action IN (
    'create',
    'update',
    'delete',
    'restore',
    'permanent_delete',
    'login',
    'flag_create',
    'flag_update',
    'flag_delete',
    'flag_toggle_api',
    'flag_batch_api',
    'flag_delete_api',
    'reprocess_trigger'
  ));
