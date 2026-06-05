'use client'

// ────────────────────────────────────────────────────────────────
// PayrollDetail — drawer SOLO LECTURA de una nómina (payslip completo)
//
// La tabla `payrolls` tiene ~130 columnas extraídas pero el panel solo
// muestra ~6 agregados. Este slide-over muestra TODO el contenido de la
// nómina agrupado en secciones claras (Empresa, Trabajador, Periodo,
// Devengos, Deducciones, Bases, Coste empresa, Líquido, Pago, IA).
//
// Read-only: no guarda, no muta. Solo visualiza.
// ────────────────────────────────────────────────────────────────

const MES_NOMBRE = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = Record<string, any>

function formatEur(val: unknown): string {
  const n = typeof val === 'string' ? parseFloat(val) : (val as number)
  if (n === null || n === undefined || isNaN(n)) return '—'
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
}

function formatDate(d: unknown): string {
  if (!d || typeof d !== 'string') return '—'
  const date = new Date(d + (d.length === 10 ? 'T00:00:00' : ''))
  if (isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatPct(val: unknown): string {
  const n = typeof val === 'string' ? parseFloat(val) : (val as number)
  if (n === null || n === undefined || isNaN(n)) return '—'
  return `${n.toLocaleString('es-ES', { maximumFractionDigits: 2 })} %`
}

// ¿El valor está "presente"? (no null, no undefined, no string vacío)
function isPresent(v: unknown): boolean {
  if (v === null || v === undefined) return false
  if (typeof v === 'string' && v.trim() === '') return false
  return true
}

// ¿Es un importe relevante? (presente y distinto de 0 — evita ruido)
function isRelevantMoney(v: unknown): boolean {
  if (!isPresent(v)) return false
  const n = typeof v === 'string' ? parseFloat(v) : (v as number)
  if (isNaN(n)) return false
  return n !== 0
}

type FieldType = 'text' | 'money' | 'date' | 'pct'

type FieldDef = { key: string; label: string; type?: FieldType }

// Renderiza una fila etiqueta→valor SOLO si el valor está presente.
// Para money usa el criterio "distinto de 0" para no ensuciar con ceros.
function Row({ row, field }: { row: AnyRow; field: FieldDef }) {
  const raw = row[field.key]
  const type = field.type ?? 'text'

  if (type === 'money') {
    if (!isRelevantMoney(raw)) return null
  } else if (!isPresent(raw)) {
    return null
  }

  let value: React.ReactNode
  if (type === 'money') value = formatEur(raw)
  else if (type === 'date') value = formatDate(raw)
  else if (type === 'pct') value = formatPct(raw)
  else value = String(raw)

  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 border-b border-neutral-50 last:border-0">
      <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 shrink-0">{field.label}</span>
      <span className={`text-sm text-neutral-800 text-right ${type === 'money' || type === 'pct' ? 'tabular-nums' : ''}`}>{value}</span>
    </div>
  )
}

// Sección con título — solo se pinta si tiene al menos una fila visible.
function Section({ title, row, fields, accent }: { title: string; row: AnyRow; fields: FieldDef[]; accent?: boolean }) {
  // Determinar si hay alguna fila visible antes de renderizar la cabecera
  const hasContent = fields.some(f => {
    const raw = row[f.key]
    const type = f.type ?? 'text'
    return type === 'money' ? isRelevantMoney(raw) : isPresent(raw)
  })
  if (!hasContent) return null

  return (
    <section className={`rounded border p-4 ${accent ? 'bg-green-50 border-green-200' : 'bg-white border-neutral-200'}`}>
      <h3 className="text-sm font-bold uppercase tracking-widest text-neutral-500 mb-2">{title}</h3>
      <div>
        {fields.map(f => <Row key={f.key} row={row} field={f} />)}
      </div>
    </section>
  )
}

// Bloque JSON crudo colapsado (devengos_extra_jsonb, deducciones_extra_jsonb, raw_extracted_jsonb)
function JsonBlock({ title, value }: { title: string; value: unknown }) {
  if (value === null || value === undefined) return null
  // jsonb vacío {} o [] → no mostrar
  if (typeof value === 'object' && Object.keys(value as object).length === 0) return null
  let text: string
  try {
    text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  } catch {
    text = String(value)
  }
  if (!text || text === '{}' || text === '[]' || text === 'null') return null
  return (
    <details className="rounded border border-neutral-200 bg-white">
      <summary className="cursor-pointer select-none px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-neutral-600">
        {title}
      </summary>
      <pre className="px-4 pb-4 pt-1 text-[11px] text-neutral-600 overflow-x-auto whitespace-pre-wrap break-words">{text}</pre>
    </details>
  )
}

// ────────────────────────────────────────────────────────────────
// Mapas de campos por sección (cubre las ~130 columnas de payrolls)
// ────────────────────────────────────────────────────────────────

const EMPRESA_FIELDS: FieldDef[] = [
  { key: 'empresa_nombre', label: 'Nombre' },
  { key: 'empresa_cif', label: 'CIF' },
  { key: 'empresa_domicilio', label: 'Domicilio' },
  { key: 'empresa_cp', label: 'CP' },
  { key: 'empresa_localidad', label: 'Localidad' },
  { key: 'empresa_cuenta_cotizacion_ss', label: 'Cuenta cotización SS' },
]

const TRABAJADOR_FIELDS: FieldDef[] = [
  { key: 'trabajador_nombre', label: 'Nombre' },
  { key: 'trabajador_nif', label: 'NIF' },
  { key: 'trabajador_num_afiliacion_ss', label: 'Nº afiliación SS' },
  { key: 'trabajador_categoria', label: 'Categoría' },
  { key: 'trabajador_grupo_cotizacion', label: 'Grupo cotización' },
  { key: 'trabajador_fecha_antiguedad', label: 'Antigüedad', type: 'date' },
  { key: 'trabajador_centro', label: 'Centro' },
  { key: 'trabajador_departamento', label: 'Departamento' },
  { key: 'trabajador_codigo', label: 'Código' },
]

const PERIODO_FIELDS: FieldDef[] = [
  // periodo_mes se renderiza aparte (nombre de mes), aquí el resto
  { key: 'periodo_desde', label: 'Desde', type: 'date' },
  { key: 'periodo_hasta', label: 'Hasta', type: 'date' },
  { key: 'periodo_dias', label: 'Días' },
  { key: 'periodo_horas', label: 'Horas' },
  { key: 'tipo_periodo', label: 'Tipo de periodo' },
]

const DEVENGOS_FIELDS: FieldDef[] = [
  { key: 'salario_base', label: 'Salario base', type: 'money' },
  { key: 'plus_actividad', label: 'Plus actividad', type: 'money' },
  { key: 'plus_extrasalarial', label: 'Plus extrasalarial', type: 'money' },
  { key: 'plus_convenio', label: 'Plus convenio', type: 'money' },
  { key: 'plus_antiguedad', label: 'Plus antigüedad', type: 'money' },
  { key: 'plus_nocturnidad', label: 'Plus nocturnidad', type: 'money' },
  { key: 'plus_peligrosidad', label: 'Plus peligrosidad', type: 'money' },
  { key: 'plus_responsabilidad', label: 'Plus responsabilidad', type: 'money' },
  { key: 'incentivos', label: 'Incentivos', type: 'money' },
  { key: 'comisiones', label: 'Comisiones', type: 'money' },
  { key: 'horas_extra_normales', label: 'Horas extra normales', type: 'money' },
  { key: 'horas_extra_estructurales', label: 'Horas extra estructurales', type: 'money' },
  { key: 'paga_extra_prorrata', label: 'Paga extra (prorrata)', type: 'money' },
  { key: 'paga_extra_completa', label: 'Paga extra (completa)', type: 'money' },
  { key: 'vacaciones_no_disfrutadas', label: 'Vacaciones no disfrutadas', type: 'money' },
  { key: 'otras_percepciones_salariales', label: 'Otras percepciones salariales', type: 'money' },
  { key: 'dietas', label: 'Dietas', type: 'money' },
  { key: 'plus_transporte', label: 'Plus transporte', type: 'money' },
  { key: 'kilometraje', label: 'Kilometraje', type: 'money' },
  { key: 'indemnizaciones', label: 'Indemnizaciones', type: 'money' },
  { key: 'otras_percepciones_no_salariales', label: 'Otras percepciones no salariales', type: 'money' },
]

const DEDUCCIONES_FIELDS: FieldDef[] = [
  { key: 'ss_total_trabajador', label: 'SS total trabajador', type: 'money' },
  { key: 'ss_cont_comunes_base', label: 'SS cont. comunes — base', type: 'money' },
  { key: 'ss_cont_comunes_pct', label: 'SS cont. comunes — %', type: 'pct' },
  { key: 'ss_cont_comunes_importe', label: 'SS cont. comunes — importe', type: 'money' },
  { key: 'ss_desempleo_base', label: 'SS desempleo — base', type: 'money' },
  { key: 'ss_desempleo_pct', label: 'SS desempleo — %', type: 'pct' },
  { key: 'ss_desempleo_importe', label: 'SS desempleo — importe', type: 'money' },
  { key: 'ss_formacion_base', label: 'SS formación — base', type: 'money' },
  { key: 'ss_formacion_pct', label: 'SS formación — %', type: 'pct' },
  { key: 'ss_formacion_importe', label: 'SS formación — importe', type: 'money' },
  { key: 'ss_horas_extra_fuerza_mayor_pct', label: 'SS H.E. fuerza mayor — %', type: 'pct' },
  { key: 'ss_horas_extra_fuerza_mayor_importe', label: 'SS H.E. fuerza mayor — importe', type: 'money' },
  { key: 'ss_horas_extra_no_estructurales_pct', label: 'SS H.E. no estructurales — %', type: 'pct' },
  { key: 'ss_horas_extra_no_estructurales_importe', label: 'SS H.E. no estructurales — importe', type: 'money' },
  { key: 'ss_solidaridad_pct', label: 'SS solidaridad — %', type: 'pct' },
  { key: 'ss_solidaridad_importe', label: 'SS solidaridad — importe', type: 'money' },
  { key: 'irpf_base', label: 'IRPF — base', type: 'money' },
  { key: 'irpf_porcentaje', label: 'IRPF — %', type: 'pct' },
  { key: 'irpf_importe', label: 'IRPF — importe', type: 'money' },
  { key: 'anticipos', label: 'Anticipos', type: 'money' },
  { key: 'productos_especie', label: 'Productos en especie', type: 'money' },
  { key: 'embargo_judicial', label: 'Embargo judicial', type: 'money' },
  { key: 'cuota_sindical', label: 'Cuota sindical', type: 'money' },
  { key: 'prestamos_empresa', label: 'Préstamos empresa', type: 'money' },
  { key: 'otras_deducciones', label: 'Otras deducciones', type: 'money' },
]

const BASES_FIELDS: FieldDef[] = [
  { key: 'base_cont_comunes', label: 'Base cont. comunes', type: 'money' },
  { key: 'base_cont_profesionales', label: 'Base cont. profesionales', type: 'money' },
  { key: 'base_irpf', label: 'Base IRPF', type: 'money' },
  { key: 'importe_remuneracion_mensual', label: 'Remuneración mensual', type: 'money' },
  { key: 'importe_prorrata_pagas_extras', label: 'Prorrata pagas extras', type: 'money' },
]

const COSTE_EMPRESA_FIELDS: FieldDef[] = [
  { key: 'emp_cont_comunes_pct', label: 'Cont. comunes — %', type: 'pct' },
  { key: 'emp_cont_comunes_importe', label: 'Cont. comunes — importe', type: 'money' },
  { key: 'emp_at_ep_pct', label: 'AT/EP — %', type: 'pct' },
  { key: 'emp_at_ep_importe', label: 'AT/EP — importe', type: 'money' },
  { key: 'emp_desempleo_pct', label: 'Desempleo — %', type: 'pct' },
  { key: 'emp_desempleo_importe', label: 'Desempleo — importe', type: 'money' },
  { key: 'emp_formacion_pct', label: 'Formación — %', type: 'pct' },
  { key: 'emp_formacion_importe', label: 'Formación — importe', type: 'money' },
  { key: 'emp_fogasa_pct', label: 'FOGASA — %', type: 'pct' },
  { key: 'emp_fogasa_importe', label: 'FOGASA — importe', type: 'money' },
  { key: 'emp_horas_extra_importe', label: 'Horas extra — importe', type: 'money' },
  { key: 'emp_solidaridad_importe', label: 'Solidaridad — importe', type: 'money' },
  { key: 'ss_total_empresa', label: 'SS total empresa', type: 'money' },
]

const PAGO_FIELDS: FieldDef[] = [
  { key: 'payment_status', label: 'Estado de pago' },
  { key: 'payment_date', label: 'Fecha de pago', type: 'date' },
  { key: 'payment_method', label: 'Método de pago' },
  { key: 'payment_iban_destino', label: 'IBAN destino' },
  { key: 'payment_referencia', label: 'Referencia' },
]

export default function PayrollDetail({ payroll, onClose }: { payroll: AnyRow; onClose: () => void }) {
  const p = payroll
  const periodoLabel = p.periodo_mes
    ? `${MES_NOMBRE[p.periodo_mes] ?? p.periodo_mes}${p.periodo_anio ? ' ' + p.periodo_anio : ''}`
    : (p.periodo_anio ? String(p.periodo_anio) : '—')

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-white w-full max-w-2xl h-full shadow-xl overflow-y-auto flex flex-col">
        {/* Cabecera fija */}
        <div className="sticky top-0 z-10 bg-white border-b border-neutral-100 px-6 py-4 flex items-start justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Nómina</p>
            <h2 className="text-lg font-bold text-neutral-800 mt-0.5">{p.trabajador_nombre || '—'}</h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              {periodoLabel}
              {p.trabajador_categoria ? ` · ${p.trabajador_categoria}` : ''}
              {p.empresa_nombre ? ` · ${p.empresa_nombre}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="text-neutral-400 hover:text-neutral-700 text-2xl leading-none ml-4"
          >
            ×
          </button>
        </div>

        {/* Líquido destacado */}
        <div className="px-6 pt-5">
          <div className="rounded border border-green-200 bg-green-50 p-4 flex items-baseline justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-green-700">Líquido a percibir</span>
            <span className="text-2xl font-bold text-green-700 tabular-nums">{formatEur(p.liquido_a_percibir)}</span>
          </div>
          {/* Mini-resumen totales */}
          <div className="grid grid-cols-3 gap-3 mt-3">
            <div className="rounded border border-neutral-200 bg-white p-3">
              <p className="text-[9px] font-bold uppercase tracking-widest text-neutral-400">Total devengado</p>
              <p className="text-base font-bold text-neutral-800 tabular-nums mt-0.5">{formatEur(p.total_devengado)}</p>
            </div>
            <div className="rounded border border-neutral-200 bg-white p-3">
              <p className="text-[9px] font-bold uppercase tracking-widest text-neutral-400">Deducciones</p>
              <p className="text-base font-bold text-neutral-800 tabular-nums mt-0.5">{formatEur(p.total_deducciones)}</p>
            </div>
            <div className="rounded border border-neutral-200 bg-white p-3">
              <p className="text-[9px] font-bold uppercase tracking-widest text-neutral-400">Coste empresa</p>
              <p className="text-base font-bold text-neutral-800 tabular-nums mt-0.5">{formatEur(p.coste_total_empresa)}</p>
            </div>
          </div>
        </div>

        {/* Secciones */}
        <div className="px-6 py-5 space-y-4">
          <Section title="Empresa" row={p} fields={EMPRESA_FIELDS} />
          <Section title="Trabajador" row={p} fields={TRABAJADOR_FIELDS} />

          {/* Periodo — con el mes en nombre legible */}
          <PeriodoSection p={p} periodoLabel={periodoLabel} />

          {/* Devengos — incluye total destacado al final + JSON crudo */}
          <DevengosSection p={p} />

          {/* Deducciones — incluye total destacado al final + JSON crudo */}
          <DeduccionesSection p={p} />

          <Section title="Bases de cotización" row={p} fields={BASES_FIELDS} />

          {/* Coste empresa — con total destacado */}
          <CosteEmpresaSection p={p} />

          <Section title="Pago" row={p} fields={PAGO_FIELDS} />

          {/* IA / revisión */}
          <IaSection p={p} />
        </div>
      </div>
    </div>
  )
}

// ─── Periodo (mes en nombre legible + resto de campos) ───
function PeriodoSection({ p, periodoLabel }: { p: AnyRow; periodoLabel: string }) {
  const hasMonth = isPresent(p.periodo_mes) || isPresent(p.periodo_anio)
  const hasRest = PERIODO_FIELDS.some(f => {
    const raw = p[f.key]
    return (f.type === 'money') ? isRelevantMoney(raw) : isPresent(raw)
  })
  if (!hasMonth && !hasRest) return null
  return (
    <section className="rounded border border-neutral-200 bg-white p-4">
      <h3 className="text-sm font-bold uppercase tracking-widest text-neutral-500 mb-2">Periodo</h3>
      <div>
        {hasMonth && (
          <div className="flex items-baseline justify-between gap-4 py-1.5 border-b border-neutral-50">
            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 shrink-0">Periodo</span>
            <span className="text-sm text-neutral-800 text-right">{periodoLabel}</span>
          </div>
        )}
        {PERIODO_FIELDS.map(f => <Row key={f.key} row={p} field={f} />)}
      </div>
    </section>
  )
}

// ─── Devengos (campos + total destacado + JSON crudo) ───
function DevengosSection({ p }: { p: AnyRow }) {
  const hasRows = DEVENGOS_FIELDS.some(f => isRelevantMoney(p[f.key]))
  const hasTotal = isRelevantMoney(p.total_devengado)
  const hasJson = hasJsonContent(p.devengos_extra_jsonb)
  if (!hasRows && !hasTotal && !hasJson) return null
  return (
    <section className="rounded border border-neutral-200 bg-white p-4">
      <h3 className="text-sm font-bold uppercase tracking-widest text-neutral-500 mb-2">Devengos</h3>
      <div>
        {DEVENGOS_FIELDS.map(f => <Row key={f.key} row={p} field={f} />)}
        {hasTotal && (
          <div className="flex items-baseline justify-between gap-4 pt-2 mt-1 border-t border-neutral-200">
            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-600 shrink-0">Total devengado</span>
            <span className="text-sm font-bold text-neutral-900 text-right tabular-nums">{formatEur(p.total_devengado)}</span>
          </div>
        )}
      </div>
      <div className="mt-3">
        <JsonBlock title="Devengos extra (datos crudos)" value={p.devengos_extra_jsonb} />
      </div>
    </section>
  )
}

// ─── Deducciones (campos + total destacado + JSON crudo) ───
function DeduccionesSection({ p }: { p: AnyRow }) {
  const hasRows = DEDUCCIONES_FIELDS.some(f => isRelevantMoney(p[f.key]) || (f.type === 'pct' && isPresent(p[f.key])))
  const hasTotal = isRelevantMoney(p.total_deducciones)
  const hasJson = hasJsonContent(p.deducciones_extra_jsonb)
  if (!hasRows && !hasTotal && !hasJson) return null
  return (
    <section className="rounded border border-neutral-200 bg-white p-4">
      <h3 className="text-sm font-bold uppercase tracking-widest text-neutral-500 mb-2">Deducciones</h3>
      <div>
        {DEDUCCIONES_FIELDS.map(f => <Row key={f.key} row={p} field={f} />)}
        {hasTotal && (
          <div className="flex items-baseline justify-between gap-4 pt-2 mt-1 border-t border-neutral-200">
            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-600 shrink-0">Total deducciones</span>
            <span className="text-sm font-bold text-neutral-900 text-right tabular-nums">{formatEur(p.total_deducciones)}</span>
          </div>
        )}
      </div>
      <div className="mt-3">
        <JsonBlock title="Deducciones extra (datos crudos)" value={p.deducciones_extra_jsonb} />
      </div>
    </section>
  )
}

// ─── Coste empresa (campos + total destacado) ───
function CosteEmpresaSection({ p }: { p: AnyRow }) {
  const hasRows = COSTE_EMPRESA_FIELDS.some(f => (f.type === 'pct' ? isPresent(p[f.key]) : isRelevantMoney(p[f.key])))
  const hasTotal = isRelevantMoney(p.coste_total_empresa)
  if (!hasRows && !hasTotal) return null
  return (
    <section className="rounded border border-neutral-200 bg-white p-4">
      <h3 className="text-sm font-bold uppercase tracking-widest text-neutral-500 mb-2">Coste empresa</h3>
      <div>
        {COSTE_EMPRESA_FIELDS.map(f => <Row key={f.key} row={p} field={f} />)}
        {hasTotal && (
          <div className="flex items-baseline justify-between gap-4 pt-2 mt-1 border-t border-neutral-200">
            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-600 shrink-0">Coste total empresa</span>
            <span className="text-sm font-bold text-neutral-900 text-right tabular-nums">{formatEur(p.coste_total_empresa)}</span>
          </div>
        )}
      </div>
    </section>
  )
}

// ─── IA / revisión ───
function IaSection({ p }: { p: AnyRow }) {
  const razones: string[] = Array.isArray(p.ai_razones) ? p.ai_razones : []
  const hasConfidence = isPresent(p.ai_confidence)
  const hasReview = p.needs_review === true || p.needs_review === false
  const hasNotes = isPresent(p.notes)
  const hasDrive = isPresent(p.drive_url)
  const hasRazones = razones.length > 0
  const hasJson = hasJsonContent(p.raw_extracted_jsonb)
  if (!hasConfidence && !hasReview && !hasNotes && !hasDrive && !hasRazones && !hasJson) return null

  return (
    <section className="rounded border border-neutral-200 bg-white p-4">
      <h3 className="text-sm font-bold uppercase tracking-widest text-neutral-500 mb-2">IA / revisión</h3>
      <div>
        {hasConfidence && (
          <div className="flex items-baseline justify-between gap-4 py-1.5 border-b border-neutral-50">
            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 shrink-0">Confianza IA</span>
            <span className="text-sm text-neutral-800 text-right tabular-nums">
              {(() => {
                const n = typeof p.ai_confidence === 'string' ? parseFloat(p.ai_confidence) : p.ai_confidence
                return isNaN(n) ? '—' : `${Math.round(n * 100)} %`
              })()}
            </span>
          </div>
        )}
        {hasReview && (
          <div className="flex items-baseline justify-between gap-4 py-1.5 border-b border-neutral-50">
            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 shrink-0">Necesita revisión</span>
            <span className="text-sm text-right">
              {p.needs_review
                ? <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700">Sí</span>
                : <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-green-100 text-green-700">No</span>}
            </span>
          </div>
        )}
        {hasNotes && (
          <div className="py-1.5 border-b border-neutral-50">
            <span className="block text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1">Notas</span>
            <span className="block text-sm text-neutral-800 whitespace-pre-wrap">{p.notes}</span>
          </div>
        )}
        {hasRazones && (
          <div className="py-1.5 border-b border-neutral-50">
            <span className="block text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1">Razones IA</span>
            <ul className="list-disc list-inside text-sm text-neutral-700 space-y-0.5">
              {razones.map((r, i) => <li key={i}>{String(r)}</li>)}
            </ul>
          </div>
        )}
        {hasDrive && (
          <div className="flex items-baseline justify-between gap-4 py-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 shrink-0">Documento</span>
            <a href={p.drive_url} target="_blank" rel="noreferrer" className="text-sm text-blue-600 underline">Ver en Drive ↗</a>
          </div>
        )}
      </div>
      <div className="mt-3">
        <JsonBlock title="Extracción cruda (raw_extracted_jsonb)" value={p.raw_extracted_jsonb} />
      </div>
    </section>
  )
}

// Helper: ¿el jsonb tiene contenido renderizable?
function hasJsonContent(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'object') return Object.keys(value as object).length > 0
  if (typeof value === 'string') {
    const t = value.trim()
    return t !== '' && t !== '{}' && t !== '[]' && t !== 'null'
  }
  return false
}
