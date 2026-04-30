-- Módulo Operaciones de Flipping
-- Ejecutar en Supabase Dashboard > SQL Editor

-- 1. Tabla principal de operaciones
CREATE TABLE IF NOT EXISTS flipping_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'prospecto'
    CHECK (status IN ('prospecto','comprada','en_reforma','en_venta','vendida','cancelada')),
  address text,
  catastral_ref text,
  property_type text
    CHECK (property_type IN ('piso','local','chalet','atico','planta_baja','nave','otro')),
  surface_m2 numeric,

  -- COMPRA
  purchase_price numeric,
  purchase_date date,
  purchase_notary_cost numeric DEFAULT 0,
  purchase_registry_cost numeric DEFAULT 0,
  purchase_gestoria_cost numeric DEFAULT 0,
  itp_rate numeric DEFAULT 0.4,
  itp_amount numeric,

  -- REFORMA
  reform_budget_estimated numeric,
  reform_start_date date,
  reform_end_date date,
  project_id uuid REFERENCES projects(id),

  -- VENTA
  sale_price numeric,
  sale_date date,
  sale_notary_cost numeric DEFAULT 0,
  sale_registry_cost numeric DEFAULT 0,
  sale_gestoria_cost numeric DEFAULT 0,
  agent_commission_pct numeric DEFAULT 3,
  agent_commission_amount numeric,
  plusvalia_amount numeric,
  is_tax_amount numeric,

  notes text,
  drive_folder_url text,
  deleted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Hipotecas vinculadas a una operación
CREATE TABLE IF NOT EXISTS mortgages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES flipping_operations(id) ON DELETE CASCADE,
  lender text,
  capital numeric NOT NULL,
  interest_rate numeric NOT NULL,
  tae numeric,
  term_months integer NOT NULL,
  monthly_payment numeric,
  start_date date,
  tasacion_cost numeric DEFAULT 0,
  apertura_commission_pct numeric DEFAULT 0,
  apertura_commission_amount numeric DEFAULT 0,
  other_costs numeric DEFAULT 0,
  drive_contract_url text,
  deleted_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- 3. Costes adicionales (ITP, notaría, IBI, comunidad, plusvalía, IS...)
CREATE TABLE IF NOT EXISTS operation_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES flipping_operations(id) ON DELETE CASCADE,
  type text NOT NULL
    CHECK (type IN (
      'itp','notaria_compra','registro_compra','gestoria_compra',
      'notaria_venta','registro_venta','gestoria_venta',
      'tasacion','apertura_hipoteca','seguro_hipoteca',
      'ibi','comunidad','seguro_inmueble','suministros',
      'plusvalia','impuesto_sociedades','otro'
    )),
  concept text,
  amount numeric NOT NULL,
  date date,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- 4. Vincular facturas existentes a operaciones
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS operation_id uuid REFERENCES flipping_operations(id);

-- 5. Recargar schema cache de PostgREST
NOTIFY pgrst, 'reload schema';
