-- FP10 fix (15/05/2026): trigger updated_at en 47 tablas core sin trigger.
-- Hoy 681/681 invoices tienen updated_at = created_at porque nadie lo actualizaba.
-- Cualquier query "modificadas recientemente" devuelve datos falsos.
--
-- Usa moddatetime extension (oficial PostgreSQL, instalada en Supabase).

CREATE EXTENSION IF NOT EXISTS moddatetime SCHEMA extensions;

-- Helper: crear trigger idempotente solo si NO existe ya
DO $$
DECLARE
  t TEXT;
  trigger_name TEXT;
BEGIN
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema='public'
      AND c.column_name='updated_at'
      AND c.table_name NOT LIKE 'pg_%'
      AND NOT EXISTS (
        SELECT 1 FROM information_schema.triggers tg
        WHERE tg.event_object_table=c.table_name
          AND tg.trigger_name LIKE 'set_updated_at%'
      )
  LOOP
    trigger_name := 'set_updated_at_' || t;
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at)',
      trigger_name, t
    );
    RAISE NOTICE 'Created trigger % on public.%', trigger_name, t;
  END LOOP;
END $$;

-- Verificación: contar triggers creados
SELECT count(*) AS triggers_created
FROM information_schema.triggers
WHERE trigger_name LIKE 'set_updated_at_%' AND trigger_schema='public';
