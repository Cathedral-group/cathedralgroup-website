-- invoices.source ya existe (default 'subida_manual'). Falta CHECK constraint.
-- Cathedral añade worker_portal + reprocesador a los 4 valores quotes pattern.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.invoices'::regclass
      AND contype = 'c'
      AND conname = 'invoices_source_check'
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_source_check
      CHECK (source IN (
        'subida_manual',
        'email_automatico',
        'drive_retroactivo',
        'manual_upload',
        'worker_portal',
        'reprocesador'
      ));
  END IF;
END $$;
