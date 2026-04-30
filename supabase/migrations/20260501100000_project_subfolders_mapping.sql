-- =============================================================================
-- project_subfolders — cacheo Drive de cada subcarpeta de proyecto
-- =============================================================================
-- Sesión 31 (2026-05-01): el workflow general necesita enrutar cada doc a la
-- subcarpeta correcta del proyecto en Drive (ej: PROYECTOS/OBR-2025-002_PuertoRico9/03_Facturas/).
-- Sin cachear los IDs Drive, cada ejecución del workflow tendría que hacer
-- N+1 calls a Drive API para resolver "subcarpeta X dentro del proyecto Y".
-- Esta tabla resuelve la lookup en 1 query a Postgres.
--
-- Población: scripts/populate-project-subfolders.py escanea Drive una vez y
-- rellena la tabla. Mantenimiento: re-ejecutar el script si se renombran o
-- mueven carpetas Drive. Las plantillas son estables, no debería pasar.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.project_subfolders (
  project_id      uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  subfolder_name  text NOT NULL,        -- ej: '03_Facturas', '01_Presupuestos', etc.
  drive_folder_id text NOT NULL,        -- ID Drive de la subcarpeta
  created_at      timestamptz NOT NULL DEFAULT NOW(),
  updated_at      timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, subfolder_name)
);

CREATE INDEX IF NOT EXISTS idx_project_subfolders_project
  ON public.project_subfolders(project_id);

CREATE INDEX IF NOT EXISTS idx_project_subfolders_drive
  ON public.project_subfolders(drive_folder_id);

-- RLS: misma política que projects — service_role lee/escribe, sin policy
-- explícita por ahora (default deny seguro mientras todo va via service_role).
ALTER TABLE public.project_subfolders ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.project_subfolders IS
  'Cacheo de IDs Drive de las subcarpetas de cada proyecto (15-23 por proyecto según tipo OBR/CDU/FLP/OBN/PRO). Lo consulta el Router del workflow general n8n para enrutar cada doc a su carpeta correcta. Sesión 31 (2026-05-01).';

COMMENT ON COLUMN public.project_subfolders.subfolder_name IS
  'Nombre exacto de la subcarpeta Drive — el Router lo busca por mapping doc_type+project_type+categoria_gasto. Ejemplos: 03_Facturas (OBR), 05_Facturas (CDU), 07_Facturas (OBN/PRO), 04_Reforma (FLP), 05_Gastos_tenencia (FLP).';
