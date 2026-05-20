/**
 * Tipo describing cómo listar/editar UN tipo de documento tipado del grupo.
 *
 * Diseño:
 *   - 1 archivo CONFIG por tipo (8 totales).
 *   - El componente `<TypedDocsView>` consume esta config y renderiza:
 *       · KPIs (4 cards calculados desde `kpis[]`)
 *       · Sidebar filtros (desde `filters[]`)
 *       · Tabla densa (columnas desde `columns[]`)
 *       · Drawer slide-out detalle (form auto-generado desde `columns[]`)
 *
 *   - El servidor (page.tsx) hace SELECT desde `table` con `company_id`,
 *     `deleted_at IS NULL`, defaultSort y page size 50, pasando initialData.
 *
 *   - Los CRUD via /api/db/<table> (PATCH/POST/DELETE) — handler genérico
 *     ya existente en app/api/db/[resource]/route.ts.
 */

export type FieldType = 'text' | 'date' | 'numeric' | 'badge' | 'boolean' | 'select' | 'textarea'

export interface ColumnDef {
  /** Nombre de la columna en BD (snake_case). */
  key: string
  /** Etiqueta humana para header tabla y label form. */
  label: string
  /** Tipo de dato (controla renderizado tabla + control form). */
  type: FieldType
  /** Map valor→clase CSS para `type: 'badge'`. Override del default. */
  badgeColors?: Record<string, string>
  /** Opciones cuando `type: 'select'` (también usado por `badge` para form). */
  options?: { value: string; label: string }[]
  /** Si true, NO se muestra como columna en la lista, sólo en el drawer detalle. */
  hideInList?: boolean
  /** Si true, NO se muestra como campo editable en el drawer. */
  hideInForm?: boolean
  /** Ancho tailwind opcional para la columna en lista (ej. 'min-w-[120px]'). */
  width?: string
  /** Placeholder para inputs text/textarea. */
  placeholder?: string
  /** Required en el form (validación client-side básica). */
  required?: boolean
  /** Texto de ayuda mostrado debajo del input. */
  hint?: string
}

export type FilterType = 'select' | 'date_range' | 'numeric_range' | 'boolean' | 'text'

export interface FilterDef {
  /** Nombre de la columna en BD. */
  key: string
  /** Etiqueta humana en sidebar. */
  label: string
  /** Tipo de control. */
  type: FilterType
  /** Opciones para `type: 'select'`. */
  options?: { value: string; label: string }[]
}

export interface KpiDef {
  /** Etiqueta de la card KPI. */
  label: string
  /** Cómo computarlo. */
  compute: 'count' | 'sum' | 'count_filter' | 'sum_filter'
  /** Campo a sumar (sólo `sum` / `sum_filter`). */
  field?: string
  /** Filtro a aplicar antes de count/sum (sólo `count_filter` / `sum_filter`). */
  filter?: { key: string; value: unknown }
  /** Color visual cuando el valor es > 0. */
  accent?: 'amber' | 'red' | 'green'
  /** Tooltip / hint debajo del valor. */
  hint?: string
  /** Si true, formatea como EUR (sólo aplica a `sum`/`sum_filter`). */
  isMoney?: boolean
}

export interface TypedDocsConfig {
  /** Tabla Supabase a consultar (ej. 'contratos', 'seguros'). */
  table: string
  /** Filtro `doc_type` cuando se quiera reusar `documents_registry` matview. */
  doc_type_filter?: string
  /** Título del listado (ej. "Contratos"). */
  title: string
  /** Subtítulo opcional (1 línea). */
  subtitle?: string
  /** Emoji para el header. */
  icon?: string
  /** Columnas de la tabla + campos del form (mismo esquema). */
  columns: ColumnDef[]
  /** Filtros sidebar. */
  filters: FilterDef[]
  /** Ordenación por defecto. */
  defaultSort?: { column: string; order: 'asc' | 'desc' }
  /** Cards KPI (max 4). */
  kpis?: KpiDef[]
  /** Texto para botón "+ Nuevo". */
  newLabel?: string
  /** Mensaje "sin registros" personalizado. */
  emptyMessage?: string
}

/**
 * Mapas de badge defaults reusables por configs.
 */
export const BADGE_COLORS_ESTADO: Record<string, string> = {
  vigente: 'bg-green-100 text-green-700',
  borrador: 'bg-neutral-100 text-neutral-500',
  suspendido: 'bg-amber-100 text-amber-700',
  resuelto: 'bg-neutral-100 text-neutral-500',
  vencido: 'bg-red-100 text-red-700',
  cancelado: 'bg-neutral-100 text-neutral-500',
  // Modelos fiscales
  presentado: 'bg-blue-100 text-blue-700',
  rectificativa: 'bg-violet-100 text-violet-700',
  sustitutiva: 'bg-violet-100 text-violet-700',
  rechazado: 'bg-red-100 text-red-700',
  // Seguros
  suspendida: 'bg-amber-100 text-amber-700',
  vencida: 'bg-red-100 text-red-700',
  anulada: 'bg-neutral-100 text-neutral-500',
  siniestro_abierto: 'bg-red-100 text-red-600',
  // Certificaciones
  pendiente_aprobar: 'bg-amber-100 text-amber-700',
  aprobada: 'bg-green-100 text-green-700',
  facturada: 'bg-blue-100 text-blue-700',
  pagada: 'bg-emerald-100 text-emerald-700',
  rechazada: 'bg-red-100 text-red-700',
}

export const BADGE_COLORS_REVIEW: Record<string, string> = {
  pendiente: 'bg-amber-100 text-amber-700',
  revisado: 'bg-blue-100 text-blue-700',
  error: 'bg-red-100 text-red-700',
  reprocesar: 'bg-violet-100 text-violet-700',
}
