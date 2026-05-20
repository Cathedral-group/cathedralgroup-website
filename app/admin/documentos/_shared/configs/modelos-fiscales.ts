import type { TypedDocsConfig } from '../TypedDocsConfig'

const MODELOS = [
  '303', '111', '115', '130', '131', '180', '190', '193',
  '200', '202', '232', '303C', '347', '349', '368', '369',
  '390', '714', '720', 'D6',
].map((m) => ({ value: m, label: `Modelo ${m}` }))

const ESTADOS = [
  { value: 'borrador', label: 'Borrador' },
  { value: 'presentado', label: 'Presentado' },
  { value: 'rectificativa', label: 'Rectificativa' },
  { value: 'sustitutiva', label: 'Sustitutiva' },
  { value: 'rechazado', label: 'Rechazado' },
]

const SIGNOS = [
  { value: 'I', label: 'Ingresar (I)' },
  { value: 'D', label: 'Devolver (D)' },
  { value: 'C', label: 'Compensar (C)' },
  { value: 'N', label: 'Negativo a 0 (N)' },
]

const PERIODOS = [
  { value: '1T', label: '1T' },
  { value: '2T', label: '2T' },
  { value: '3T', label: '3T' },
  { value: '4T', label: '4T' },
  { value: '0A', label: 'Anual (0A)' },
  ...Array.from({ length: 12 }, (_, i) => {
    const v = String(i + 1).padStart(2, '0')
    return { value: v, label: `Mes ${v}` }
  }),
]

export const MODELOS_FISCALES_CONFIG: TypedDocsConfig = {
  table: 'modelos_fiscales',
  title: 'Modelos fiscales AEAT',
  subtitle: 'Presentaciones AEAT del grupo (303, 111, 115, 347, 349, 390, 200, 720, …).',
  icon: '🏛️',
  newLabel: 'Modelo',
  columns: [
    { key: 'modelo', label: 'Modelo', type: 'select', options: MODELOS, required: true },
    { key: 'ejercicio', label: 'Ejercicio', type: 'numeric', required: true },
    { key: 'periodo', label: 'Periodo', type: 'select', options: PERIODOS },
    { key: 'fecha_presentacion', label: 'Fecha presentación', type: 'date' },
    { key: 'fecha_devengo', label: 'Fecha devengo', type: 'date', hideInList: true },
    { key: 'numero_justificante', label: 'Nº justificante', type: 'text', hideInList: true },
    { key: 'numero_referencia', label: 'Nº referencia (NRC)', type: 'text', hideInList: true },
    { key: 'csv_aeat', label: 'CSV AEAT', type: 'text', hideInList: true },
    { key: 'estado', label: 'Estado', type: 'badge', options: ESTADOS, required: true },
    { key: 'resultado_signo', label: 'Resultado', type: 'select', options: SIGNOS },
    { key: 'importe_resultado', label: 'Importe', type: 'numeric' },
    { key: 'importe_pagado', label: 'Importe pagado', type: 'numeric', hideInList: true },
    { key: 'cuenta_cargo_iban', label: 'IBAN cargo', type: 'text', hideInList: true },
    { key: 'motivo_rectificacion', label: 'Motivo rectificación', type: 'textarea', hideInList: true },
  ],
  filters: [
    { key: 'modelo', label: 'Modelo', type: 'select', options: MODELOS },
    { key: 'ejercicio', label: 'Ejercicio', type: 'numeric_range' },
    { key: 'estado', label: 'Estado', type: 'select', options: ESTADOS },
    { key: 'resultado_signo', label: 'Resultado', type: 'select', options: SIGNOS },
    { key: 'fecha_presentacion', label: 'Fecha presentación', type: 'date_range' },
  ],
  defaultSort: { column: 'fecha_presentacion', order: 'desc' },
  kpis: [
    { label: 'Total presentaciones', compute: 'count' },
    { label: 'Presentados', compute: 'count_filter', filter: { key: 'estado', value: 'presentado' }, accent: 'green' },
    { label: 'A ingresar acumulado', compute: 'sum_filter', field: 'importe_resultado', filter: { key: 'resultado_signo', value: 'I' }, isMoney: true },
    { label: 'Borradores pendientes', compute: 'count_filter', filter: { key: 'estado', value: 'borrador' }, accent: 'amber' },
  ],
  emptyMessage: 'Sin presentaciones AEAT.',
}
