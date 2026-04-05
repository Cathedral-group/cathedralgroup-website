-- Add UNIQUE constraint on suppliers.nif to enable upsert operations
-- Required for auto-creation of suppliers during invoice confirmation in Revisión IA
ALTER TABLE suppliers ADD CONSTRAINT suppliers_nif_unique UNIQUE (nif);
