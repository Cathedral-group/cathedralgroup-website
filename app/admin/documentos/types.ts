import type { ReactNode } from 'react'

export interface DocTypeConfig {
  value: string
  label: string
}

export interface FieldConfig {
  key: string
  label: string
  type?: 'text' | 'date' | 'number' | 'textarea' | 'select'
  options?: string[]
}

export interface DocumentRecord {
  id?: string
  doc_category: string
  doc_type: string
  titulo?: string | null
  fecha_documento?: string | null
  fecha_vencimiento?: string | null
  partes?: string | null
  importe?: number | null
  estado?: string | null
  texto_completo?: string | null
  resumen_ia?: string | null
  datos_brutos?: Record<string, unknown> | null
  datos_extraidos?: Record<string, unknown> | null
  drive_url?: string | null
  drive_file_id?: string | null
  original_filename?: string | null
  source?: string | null
  ai_confidence?: number | null
  needs_review?: boolean | null
  project_id?: string | null
  proyecto_code?: string | null
  entity_type?: string | null
  entity_id?: string | null
  created_at?: string
}

export interface DocumentsViewConfig {
  category: string
  title: string
  docTypes: DocTypeConfig[]
  fields: FieldConfig[]
  tableColumns: {
    key: string
    label: string
    render?: (doc: DocumentRecord) => ReactNode
  }[]
}
