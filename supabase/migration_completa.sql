-- ================================================================
-- Cathedral Group — Migración completa de esquema
-- Ejecutar en Supabase Dashboard > SQL Editor
-- Seguro de re-ejecutar: usa ADD COLUMN IF NOT EXISTS en todo
-- ================================================================


-- ─── LEADS ───────────────────────────────────────────────────
ALTER TABLE leads ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_score int;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_summary text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS budget_estimate text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_to text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS zona text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS metros_cuadrados int;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS presupuesto_rango text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source_page text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS origen text;


-- ─── CLIENTS ─────────────────────────────────────────────────
ALTER TABLE clients ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS nif_cif text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS company_name text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS preferred_contact text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS type text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS notes text;


-- ─── SUPPLIERS ───────────────────────────────────────────────
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS nif text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS specialty text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS contact_person text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS bank_account text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS iban text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS payment_terms text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS notes text;


-- ─── PROJECTS ────────────────────────────────────────────────
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES clients(id);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS start_date date;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS end_date_planned date;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS end_date_real date;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS budget_estimated numeric;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS sale_price numeric;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS drive_folder_url text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS type text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS status text DEFAULT 'presupuesto';


-- ─── INVOICES ────────────────────────────────────────────────
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
-- 'number' es el nombre usado por el código nuevo (InvoicesView, InvoiceForm, QuoteEditor)
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS number text;
-- 'vat_amount' es el nombre usado por el código nuevo
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS vat_amount numeric;
-- Columnas del modelo completo
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS direction text DEFAULT 'emitida' CHECK (direction IN ('emitida','recibida'));
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS doc_type text DEFAULT 'factura';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS concept text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS amount_base numeric;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS vat_pct numeric DEFAULT 21;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS irpf_rate numeric;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS irpf_amount numeric;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS amount_total numeric;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS issue_date date;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS due_date date;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_date date;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'pendiente';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS proyecto_code text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS supplier_nif text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS categoria_gasto text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS es_rectificativa boolean DEFAULT false;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS numero_factura_original text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS notes text;


-- ─── QUOTES ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quotes (
  id                          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  number                      text NOT NULL,
  client_id                   uuid REFERENCES clients(id),
  project_id                  uuid REFERENCES projects(id),
  status                      text DEFAULT 'borrador' CHECK (status IN ('borrador','enviado','aceptado','rechazado')),
  quality_level               text DEFAULT 'estandar',
  quality_coefficient_override numeric,
  valid_until                 date,
  items                       jsonb DEFAULT '[]',
  subtotal                    numeric DEFAULT 0,
  vat_total                   numeric DEFAULT 0,
  total                       numeric DEFAULT 0,
  notes                       text,
  conditions                  text,
  created_by                  text,
  created_at                  timestamptz DEFAULT now(),
  updated_at                  timestamptz DEFAULT now(),
  deleted_at                  timestamptz
);

-- Si ya existía sin algunas columnas:
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES clients(id);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS quality_coefficient_override numeric;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS conditions text;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS created_by text;


-- ─── PROJECT PHASES ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_phases (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        text NOT NULL,
  status      text DEFAULT 'pendiente' CHECK (status IN ('pendiente','en_curso','completada')),
  sort_order  int DEFAULT 0,
  start_date  date,
  end_date    date,
  notes       text,
  created_at  timestamptz DEFAULT now()
);


-- ─── COMMUNICATIONS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS communications (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type text NOT NULL,
  entity_id   uuid NOT NULL,
  date        timestamptz DEFAULT now(),
  type        text NOT NULL CHECK (type IN ('llamada','email','whatsapp','reunion','nota')),
  summary     text,
  created_at  timestamptz DEFAULT now()
);


-- ─── QUALITY COEFFICIENTS ────────────────────────────────────
CREATE TABLE IF NOT EXISTS quality_coefficients (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  level       text NOT NULL UNIQUE,
  label       text NOT NULL,
  coefficient numeric NOT NULL DEFAULT 1.0,
  updated_at  timestamptz DEFAULT now()
);

-- Datos iniciales (no sobreescribe si ya existen)
INSERT INTO quality_coefficients (level, label, coefficient) VALUES
  ('estandar', 'Estándar', 1.25),
  ('premium',  'Premium',  1.35),
  ('lujo',     'Lujo',     1.50)
ON CONFLICT (level) DO NOTHING;


-- ─── QUOTE ITEMS CATALOG ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS quote_items_catalog (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  chapter_code text NOT NULL,
  chapter_name text NOT NULL,
  subcategory  text,
  code         text,
  description  text NOT NULL,
  unit         text NOT NULL DEFAULT 'ud',
  unit_price   numeric NOT NULL DEFAULT 0,
  notes        text,
  active       boolean DEFAULT true,
  created_at   timestamptz DEFAULT now()
);


-- ─── VAT QUARTERLY ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vat_quarterly (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  year              int NOT NULL,
  quarter           int NOT NULL CHECK (quarter IN (1,2,3,4)),
  vat_repercutido   numeric DEFAULT 0,
  vat_soportado     numeric DEFAULT 0,
  cuota_a_ingresar  numeric DEFAULT 0,
  status            text DEFAULT 'pendiente' CHECK (status IN ('pendiente','presentado')),
  created_at        timestamptz DEFAULT now(),
  UNIQUE(year, quarter)
);


-- ─── PROJECT FINANCIALS (VISTA) ──────────────────────────────
-- Vista que agrega facturación por proyecto para el dashboard
CREATE OR REPLACE VIEW project_financials AS
SELECT
  p.id              AS project_id,
  p.code,
  p.name,
  p.status,
  p.budget_estimated,
  p.sale_price,
  COALESCE(SUM(CASE WHEN i.direction = 'emitida'  THEN i.amount_base ELSE 0 END), 0) AS income_base,
  COALESCE(SUM(CASE WHEN i.direction = 'recibida' THEN i.amount_base ELSE 0 END), 0) AS expense_base,
  COALESCE(SUM(CASE WHEN i.direction = 'emitida'  THEN i.amount_base ELSE 0 END), 0)
  - COALESCE(SUM(CASE WHEN i.direction = 'recibida' THEN i.amount_base ELSE 0 END), 0) AS gross_margin
FROM projects p
LEFT JOIN invoices i
       ON i.proyecto_code = p.code
      AND i.deleted_at IS NULL
WHERE p.deleted_at IS NULL
GROUP BY p.id, p.code, p.name, p.status, p.budget_estimated, p.sale_price;
