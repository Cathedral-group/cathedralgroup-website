ALTER TABLE invoices ADD COLUMN IF NOT EXISTS empresa text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS lineas jsonb;
