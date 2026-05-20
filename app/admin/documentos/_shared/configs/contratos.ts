import type { TypedDocsConfig } from '../TypedDocsConfig'

const TIPOS_CONTRATO = [
  { value: 'arrendamiento_local', label: 'Arrendamiento local' },
  { value: 'arrendamiento_vivienda', label: 'Arrendamiento vivienda' },
  { value: 'arrendamiento_garaje', label: 'Arrendamiento garaje' },
  { value: 'compraventa', label: 'Compraventa' },
  { value: 'obra', label: 'Obra' },
  { value: 'servicios', label: 'Servicios' },
  { value: 'laboral', label: 'Laboral' },
  { value: 'suministro', label: 'Suministro' },
  { value: 'confidencialidad', label: 'Confidencialidad (NDA)' },
  { value: 'prestamo', label: 'Préstamo' },
  { value: 'factoring', label: 'Factoring' },
  { value: 'renting', label: 'Renting' },
  { value: 'leasing', label: 'Leasing' },
  { value: 'otro', label: 'Otro' },
]

const ESTADOS = [
  { value: 'borrador', label: 'Borrador' },
  { value: 'vigente', label: 'Vigente' },
  { value: 'suspendido', label: 'Suspendido' },
  { value: 'resuelto', label: 'Resuelto' },
  { value: 'vencido', label: 'Vencido' },
  { value: 'cancelado', label: 'Cancelado' },
]

const PERIODICIDAD = [
  { value: 'mensual', label: 'Mensual' },
  { value: 'trimestral', label: 'Trimestral' },
  { value: 'semestral', label: 'Semestral' },
  { value: 'anual', label: 'Anual' },
  { value: 'unico', label: 'Único' },
  { value: 'otro', label: 'Otro' },
]

export const CONTRATOS_CONFIG: TypedDocsConfig = {
  table: 'contratos',
  title: 'Contratos',
  subtitle: 'Contratos del grupo (arrendamiento, obra, servicios, suministro, préstamo, etc).',
  icon: '📑',
  newLabel: 'Contrato',
  columns: [
    { key: 'numero_contrato', label: 'Nº', type: 'text', placeholder: 'Ej: CTR-2026-007' },
    { key: 'tipo_contrato', label: 'Tipo', type: 'select', options: TIPOS_CONTRATO, required: true },
    { key: 'objeto', label: 'Objeto', type: 'textarea', placeholder: 'Resumen del objeto del contrato' },
    { key: 'fecha_firma', label: 'Firma', type: 'date' },
    { key: 'fecha_inicio', label: 'Inicio', type: 'date', hideInList: true },
    { key: 'fecha_fin', label: 'Fin', type: 'date' },
    { key: 'duracion_meses', label: 'Duración (meses)', type: 'numeric', hideInList: true },
    { key: 'preaviso_dias', label: 'Preaviso (días)', type: 'numeric', hideInList: true },
    { key: 'prorroga_automatica', label: 'Prórroga automática', type: 'boolean', hideInList: true },
    { key: 'fecha_proxima_revision', label: 'Próx. revisión', type: 'date', hideInList: true },
    { key: 'importe_total', label: 'Importe total', type: 'numeric' },
    { key: 'importe_periodico', label: 'Importe periódico', type: 'numeric', hideInList: true },
    { key: 'periodicidad', label: 'Periodicidad', type: 'select', options: PERIODICIDAD, hideInList: true },
    { key: 'moneda', label: 'Moneda', type: 'text', hideInList: true },
    { key: 'fianza', label: 'Fianza', type: 'numeric', hideInList: true },
    { key: 'iva_pct', label: 'IVA %', type: 'numeric', hideInList: true },
    { key: 'estado', label: 'Estado', type: 'badge', options: ESTADOS, required: true },
    { key: 'party_id', label: 'Contraparte (ID)', type: 'text', hideInList: true, hint: 'UUID de parties' },
    { key: 'project_id', label: 'Proyecto (ID)', type: 'text', hideInList: true },
    { key: 'property_id', label: 'Inmueble (ID)', type: 'text', hideInList: true },
    { key: 'clausula_indexacion', label: 'Cláusula indexación', type: 'boolean', hideInList: true },
    { key: 'indice_referencia', label: 'Índice referencia', type: 'text', hideInList: true, placeholder: 'IPC / IPC_VIVIENDA / EURIBOR' },
    { key: 'clausula_penalizacion', label: 'Cláusula penalización', type: 'boolean', hideInList: true },
    { key: 'clausula_renuncia_iva', label: 'Renuncia exención IVA', type: 'boolean', hideInList: true },
  ],
  filters: [
    { key: 'tipo_contrato', label: 'Tipo', type: 'select', options: TIPOS_CONTRATO },
    { key: 'estado', label: 'Estado', type: 'select', options: ESTADOS },
    { key: 'fecha_firma', label: 'Fecha firma', type: 'date_range' },
    { key: 'prorroga_automatica', label: 'Prórroga automática', type: 'boolean' },
  ],
  defaultSort: { column: 'fecha_firma', order: 'desc' },
  kpis: [
    { label: 'Total contratos', compute: 'count' },
    { label: 'Vigentes', compute: 'count_filter', filter: { key: 'estado', value: 'vigente' }, accent: 'green' },
    { label: 'Importe total acumulado', compute: 'sum', field: 'importe_total', isMoney: true },
    { label: 'Vencidos', compute: 'count_filter', filter: { key: 'estado', value: 'vencido' }, accent: 'red' },
  ],
  emptyMessage: 'Sin contratos.',
}
