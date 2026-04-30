-- Presupuestos (Quotes) table for Cathedral Group admin
-- Run this migration in the Supabase SQL editor

CREATE TABLE IF NOT EXISTS quotes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  number text NOT NULL,
  client_id uuid REFERENCES clients(id),
  project_id uuid REFERENCES projects(id),
  status text DEFAULT 'borrador' CHECK (status IN ('borrador', 'enviado', 'aceptado', 'rechazado')),
  valid_until date,
  items jsonb DEFAULT '[]'::jsonb,
  subtotal numeric DEFAULT 0,
  vat_total numeric DEFAULT 0,
  total numeric DEFAULT 0,
  notes text,
  conditions text DEFAULT 'Presupuesto valido durante 30 dias naturales desde la fecha de emision. Los precios incluyen materiales y mano de obra salvo indicacion contraria. No incluye licencias ni tasas municipales.',
  created_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated" ON quotes
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
