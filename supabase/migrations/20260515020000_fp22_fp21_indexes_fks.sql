-- FP22 + FP21 fix (15/05/2026)
--
-- FP22: unique index invoices_unique_active_dedup ahora normaliza también `number`
--       (antes solo supplier_nif). Evita duplicado por mayúsculas/espacios.
-- FP21: añade FK enforced en columnas críticas que tenían FK lógicas sin enforce.

-- ============================================================
-- FP22 — recrear unique index con number normalizado
-- ============================================================

-- Drop old (sin normalize number)
DROP INDEX IF EXISTS public.invoices_unique_active_dedup;

-- Recreate with number normalized too
CREATE UNIQUE INDEX invoices_unique_active_dedup
ON public.invoices USING btree (
  regexp_replace(upper(supplier_nif), '[^A-Z0-9]'::text, ''::text, 'g'::text),
  upper(regexp_replace(number, '[\s]'::text, ''::text, 'g'::text)),
  issue_date,
  direction,
  doc_type,
  round(COALESCE(amount_total, 0::numeric), 2)
)
WHERE deleted_at IS NULL
  AND supplier_nif IS NOT NULL
  AND number IS NOT NULL
  AND issue_date IS NOT NULL;

COMMENT ON INDEX public.invoices_unique_active_dedup IS
  'FP22 fix 15/05/2026: number también normalizado (upper + sin espacios) además de supplier_nif. Antes "LgExp25" vs "lgexp25" contaban distintos.';

-- ============================================================
-- FP21 — FK constraints críticas (idempotente)
-- ============================================================

-- Helper: añadir FK solo si no existe
DO $$
DECLARE
  fk_exists boolean;
BEGIN
  -- linked_invoice_id → invoices(id) ON DELETE SET NULL
  SELECT EXISTS(
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'invoices_linked_invoice_id_fkey'
  ) INTO fk_exists;
  IF NOT fk_exists THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_linked_invoice_id_fkey
      FOREIGN KEY (linked_invoice_id) REFERENCES public.invoices(id) ON DELETE SET NULL;
    RAISE NOTICE 'Added FK invoices.linked_invoice_id';
  END IF;

  -- factura_principal_id → invoices(id) ON DELETE SET NULL
  SELECT EXISTS(
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'invoices_factura_principal_id_fkey'
  ) INTO fk_exists;
  IF NOT fk_exists THEN
    -- only if column exists
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='factura_principal_id') THEN
      ALTER TABLE public.invoices
        ADD CONSTRAINT invoices_factura_principal_id_fkey
        FOREIGN KEY (factura_principal_id) REFERENCES public.invoices(id) ON DELETE SET NULL;
      RAISE NOTICE 'Added FK invoices.factura_principal_id';
    END IF;
  END IF;

  -- linked_doc_id en documents → documents(id) ON DELETE SET NULL
  SELECT EXISTS(
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'documents_linked_doc_id_fkey'
  ) INTO fk_exists;
  IF NOT fk_exists THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='documents' AND column_name='linked_doc_id') THEN
      ALTER TABLE public.documents
        ADD CONSTRAINT documents_linked_doc_id_fkey
        FOREIGN KEY (linked_doc_id) REFERENCES public.documents(id) ON DELETE SET NULL;
      RAISE NOTICE 'Added FK documents.linked_doc_id';
    END IF;
  END IF;

  -- operation_id en invoices → flipping_operations(id) ON DELETE SET NULL
  SELECT EXISTS(
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'invoices_operation_id_fkey'
  ) INTO fk_exists;
  IF NOT fk_exists THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='operation_id') AND
       EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='flipping_operations') THEN
      ALTER TABLE public.invoices
        ADD CONSTRAINT invoices_operation_id_fkey
        FOREIGN KEY (operation_id) REFERENCES public.flipping_operations(id) ON DELETE SET NULL;
      RAISE NOTICE 'Added FK invoices.operation_id';
    END IF;
  END IF;

  -- project_id en invoices ya tiene FK probablemente, pero verificamos
  SELECT EXISTS(
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name LIKE 'invoices_project_id_%fkey'
  ) INTO fk_exists;
  IF NOT fk_exists THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='project_id') THEN
      ALTER TABLE public.invoices
        ADD CONSTRAINT invoices_project_id_fkey
        FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;
      RAISE NOTICE 'Added FK invoices.project_id';
    END IF;
  END IF;

  -- supplier_id en invoices
  SELECT EXISTS(
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name LIKE 'invoices_supplier_id_%fkey'
  ) INTO fk_exists;
  IF NOT fk_exists THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='supplier_id') THEN
      ALTER TABLE public.invoices
        ADD CONSTRAINT invoices_supplier_id_fkey
        FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;
      RAISE NOTICE 'Added FK invoices.supplier_id';
    END IF;
  END IF;

  -- client_id en invoices
  SELECT EXISTS(
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name LIKE 'invoices_client_id_%fkey'
  ) INTO fk_exists;
  IF NOT fk_exists THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='client_id') THEN
      ALTER TABLE public.invoices
        ADD CONSTRAINT invoices_client_id_fkey
        FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;
      RAISE NOTICE 'Added FK invoices.client_id';
    END IF;
  END IF;
END $$;

-- Verificación final
SELECT count(*) AS fks_invoices
FROM information_schema.table_constraints
WHERE table_name='invoices' AND constraint_type='FOREIGN KEY';
