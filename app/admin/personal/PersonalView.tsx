'use client'

import { useState, useMemo } from 'react'

const MES_NOMBRE = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

type Payroll = {
  id: string
  employee_id?: string | null
  empresa_nombre: string
  empresa_cif: string
  trabajador_nombre: string
  trabajador_nif: string
  trabajador_categoria?: string | null
  periodo_desde: string
  periodo_hasta: string
  periodo_mes: number
  periodo_anio: number
  tipo_periodo?: string | null
  total_devengado: number
  ss_total_trabajador?: number | null
  irpf_importe?: number | null
  total_deducciones: number
  liquido_a_percibir: number
  ss_total_empresa?: number | null
  coste_total_empresa: number
  payment_status?: string | null
  payment_date?: string | null
  drive_url?: string | null
  drive_file_id?: string | null
  needs_review?: boolean | null
  review_status?: string | null
  ai_confidence?: number | null
  ai_razones?: string[] | null
  source?: string | null
  created_at?: string | null
  // resto de campos detallados
  salario_base?: number | null
  plus_actividad?: number | null
  plus_extrasalarial?: number | null
  plus_antiguedad?: number | null
  incentivos?: number | null
  paga_extra_prorrata?: number | null
  base_cont_comunes?: number | null
  base_irpf?: number | null
  irpf_porcentaje?: number | null
  ss_cont_comunes_importe?: number | null
  ss_desempleo_importe?: number | null
  ss_formacion_importe?: number | null
  emp_cont_comunes_importe?: number | null
  emp_at_ep_importe?: number | null
  emp_desempleo_importe?: number | null
  emp_formacion_importe?: number | null
  emp_fogasa_importe?: number | null
  trabajador_num_afiliacion_ss?: string | null
  trabajador_grupo_cotizacion?: number | null
  trabajador_fecha_antiguedad?: string | null
  empresa_cuenta_cotizacion_ss?: string | null
  notes?: string | null
  raw_extracted_jsonb?: Record<string, unknown> | null
}

type Summary = {
  id: string
  empresa_nombre: string
  empresa_cif: string
  cuenta_cotizacion_ss?: string | null
  periodo_mes: number
  periodo_anio: number
  num_trabajadores?: number | null
  total_retribuciones: number
  total_deduccion_trabajador: number
  total_costes_empresa: number
  total_retencion_irpf: number
  total_liquido: number
  drive_url?: string | null
  source?: string | null
  created_at?: string | null
}

type Employee = {
  id: string
  nombre: string
  nif: string
  num_afiliacion_ss?: string | null
  empresa_actual_nombre?: string | null
  categoria_profesional?: string | null
  grupo_cotizacion?: number | null
  fecha_antiguedad?: string | null
  fecha_baja?: string | null
  iban?: string | null
  email?: string | null
  telefono?: string | null
}

function formatEur(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return '—'
  return val.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d + (d.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatPeriodo(p: { periodo_desde: string; periodo_hasta: string; periodo_mes: number; periodo_anio: number }): string {
  return `${MES_NOMBRE[p.periodo_mes]} ${p.periodo_anio} (${formatDate(p.periodo_desde)} → ${formatDate(p.periodo_hasta)})`
}

export default function PersonalView({
  payrolls,
  summaries,
  employees,
}: {
  payrolls: Payroll[]
  summaries: Summary[]
  employees: Employee[]
}) {
  const [tab, setTab] = useState<'payrolls' | 'summaries' | 'employees'>('payrolls')
  const [search, setSearch] = useState('')
  const [selectedPayroll, setSelectedPayroll] = useState<Payroll | null>(null)
  const [yearFilter, setYearFilter] = useState<number | 'todos'>('todos')

  const yearsAvailable = useMemo(() => {
    const ys = new Set<number>()
    payrolls.forEach(p => ys.add(p.periodo_anio))
    summaries.forEach(s => ys.add(s.periodo_anio))
    return Array.from(ys).sort((a, b) => b - a)
  }, [payrolls, summaries])

  // ─── Filtros ───
  const filteredPayrolls = useMemo(() => {
    return payrolls.filter(p => {
      if (yearFilter !== 'todos' && p.periodo_anio !== yearFilter) return false
      if (search) {
        const q = search.toLowerCase()
        const hay = `${p.trabajador_nombre} ${p.trabajador_nif} ${p.empresa_nombre} ${p.trabajador_categoria || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [payrolls, search, yearFilter])

  const filteredSummaries = useMemo(() => {
    return summaries.filter(s => {
      if (yearFilter !== 'todos' && s.periodo_anio !== yearFilter) return false
      if (search) {
        const q = search.toLowerCase()
        const hay = `${s.empresa_nombre} ${s.empresa_cif}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [summaries, search, yearFilter])

  // Empleados con stats anuales (devengado, IRPF, líquido)
  const employeesEnriched = useMemo(() => {
    return employees.map(e => {
      const sus = payrolls.filter(p => p.trabajador_nif === e.nif && (yearFilter === 'todos' || p.periodo_anio === yearFilter))
      const devengado = sus.reduce((s, p) => s + (p.total_devengado || 0), 0)
      const irpf = sus.reduce((s, p) => s + (p.irpf_importe || 0), 0)
      const liquido = sus.reduce((s, p) => s + (p.liquido_a_percibir || 0), 0)
      const ultima = sus.sort((a, b) => (b.periodo_hasta || '').localeCompare(a.periodo_hasta || ''))[0]
      return { ...e, n_nominas: sus.length, total_devengado: devengado, total_irpf: irpf, total_liquido: liquido, ultima_nomina: ultima?.periodo_hasta || null }
    }).filter(e => {
      if (search) {
        const q = search.toLowerCase()
        return `${e.nombre} ${e.nif} ${e.categoria_profesional || ''}`.toLowerCase().includes(q)
      }
      return true
    })
  }, [employees, payrolls, search, yearFilter])

  // Agregados rápidos para mostrar en stats
  const totals = useMemo(() => {
    const yearOnes = payrolls.filter(p => yearFilter === 'todos' || p.periodo_anio === yearFilter)
    return {
      n_nominas: yearOnes.length,
      bruto: yearOnes.reduce((s, p) => s + (p.total_devengado || 0), 0),
      irpf: yearOnes.reduce((s, p) => s + (p.irpf_importe || 0), 0),
      ss_trab: yearOnes.reduce((s, p) => s + (p.ss_total_trabajador || 0), 0),
      ss_emp: yearOnes.reduce((s, p) => s + (p.ss_total_empresa || 0), 0),
      liquido: yearOnes.reduce((s, p) => s + (p.liquido_a_percibir || 0), 0),
      coste_total: yearOnes.reduce((s, p) => s + (p.coste_total_empresa || 0), 0),
    }
  }, [payrolls, yearFilter])

  const tabBtnCls = (active: boolean) =>
    `px-4 py-2 text-xs font-bold uppercase tracking-widest transition-colors ${
      active ? 'border-b-2 border-primary text-primary' : 'text-neutral-400 hover:text-neutral-600'
    }`

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-baseline justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-800">Personal</h1>
          <p className="text-xs text-neutral-400 mt-1">Nóminas, resúmenes contables y trabajadores</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value === 'todos' ? 'todos' : parseInt(e.target.value))}
            className="text-sm border border-neutral-200 rounded px-3 py-1.5 bg-white"
          >
            <option value="todos">Todos los años</option>
            {yearsAvailable.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <input
            type="text"
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-neutral-50 border-0 focus:ring-1 focus:ring-primary px-3 py-1.5 text-sm w-48"
          />
        </div>
      </div>

      {/* Stats agregados (basados en payrolls del año filtrado) */}
      {payrolls.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatCard label="Nóminas" value={totals.n_nominas.toString()} hint={yearFilter === 'todos' ? 'Total histórico' : `${yearFilter}`} />
          <StatCard label="Bruto devengado" value={formatEur(totals.bruto)} hint={yearFilter === 'todos' ? 'Histórico' : `${yearFilter}`} />
          <StatCard label="IRPF retenido" value={formatEur(totals.irpf)} hint="A presentar mod. 111/190" />
          <StatCard label="Coste empresa" value={formatEur(totals.coste_total)} hint="Devengado + SS empresa" />
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-neutral-100 flex gap-2 mb-6">
        <button onClick={() => setTab('payrolls')} className={tabBtnCls(tab === 'payrolls')}>
          Nóminas <span className="ml-1 text-[10px] text-neutral-400">({filteredPayrolls.length})</span>
        </button>
        <button onClick={() => setTab('summaries')} className={tabBtnCls(tab === 'summaries')}>
          Resúmenes mensuales <span className="ml-1 text-[10px] text-neutral-400">({filteredSummaries.length})</span>
        </button>
        <button onClick={() => setTab('employees')} className={tabBtnCls(tab === 'employees')}>
          Trabajadores <span className="ml-1 text-[10px] text-neutral-400">({employeesEnriched.length})</span>
        </button>
      </div>

      {tab === 'payrolls' && (
        <PayrollsTable rows={filteredPayrolls} onSelect={setSelectedPayroll} />
      )}
      {tab === 'summaries' && (
        <SummariesTable rows={filteredSummaries} />
      )}
      {tab === 'employees' && (
        <EmployeesTable rows={employeesEnriched} />
      )}

      {selectedPayroll && (
        <PayrollDetail payroll={selectedPayroll} onClose={() => setSelectedPayroll(null)} />
      )}
    </div>
  )
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="p-3 bg-white border border-neutral-200 rounded">
      <p className="text-[10px] uppercase tracking-widest text-neutral-400 mb-1">{label}</p>
      <p className="text-lg font-bold text-neutral-800 tabular-nums">{value}</p>
      {hint && <p className="text-[10px] text-neutral-400 mt-0.5">{hint}</p>}
    </div>
  )
}

function PayrollsTable({ rows, onSelect }: { rows: Payroll[]; onSelect: (p: Payroll) => void }) {
  if (rows.length === 0) return <p className="text-sm text-neutral-400 p-6 text-center">Sin nóminas</p>
  return (
    <div className="bg-white border border-neutral-100 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-100 text-left text-[10px] font-bold uppercase tracking-widest text-neutral-400">
            <th className="px-3 py-3">Período</th>
            <th className="px-3 py-3">Trabajador</th>
            <th className="px-3 py-3">Empresa</th>
            <th className="px-3 py-3 text-right">Devengado</th>
            <th className="px-3 py-3 text-right">SS trab.</th>
            <th className="px-3 py-3 text-right">IRPF</th>
            <th className="px-3 py-3 text-right">Líquido</th>
            <th className="px-3 py-3 text-right">Coste empresa</th>
            <th className="px-3 py-3">Pago</th>
            <th className="px-3 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-50">
          {rows.map(p => (
            <tr key={p.id} onClick={() => onSelect(p)} className="cursor-pointer hover:bg-neutral-50">
              <td className="px-3 py-3 whitespace-nowrap">
                <div className="font-semibold">{MES_NOMBRE[p.periodo_mes]} {p.periodo_anio}</div>
                <div className="text-[10px] text-neutral-400">{formatDate(p.periodo_desde)} → {formatDate(p.periodo_hasta)}</div>
              </td>
              <td className="px-3 py-3">
                <div className="font-semibold">{p.trabajador_nombre}</div>
                <div className="text-[10px] text-neutral-400">{p.trabajador_nif} {p.trabajador_categoria ? `· ${p.trabajador_categoria}` : ''}</div>
              </td>
              <td className="px-3 py-3 text-xs text-neutral-500 max-w-[180px] truncate" title={p.empresa_nombre}>{p.empresa_nombre}</td>
              <td className="px-3 py-3 text-right tabular-nums">{formatEur(p.total_devengado)}</td>
              <td className="px-3 py-3 text-right tabular-nums text-neutral-500">{formatEur(p.ss_total_trabajador)}</td>
              <td className="px-3 py-3 text-right tabular-nums text-neutral-500">{formatEur(p.irpf_importe)}</td>
              <td className="px-3 py-3 text-right tabular-nums font-bold text-green-700">{formatEur(p.liquido_a_percibir)}</td>
              <td className="px-3 py-3 text-right tabular-nums text-neutral-500">{formatEur(p.coste_total_empresa)}</td>
              <td className="px-3 py-3">
                <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                  p.payment_status === 'pagada' ? 'bg-green-100 text-green-700' :
                  p.payment_status === 'pendiente' ? 'bg-amber-100 text-amber-700' :
                  'bg-neutral-100 text-neutral-500'
                }`}>{p.payment_status || 'pendiente'}</span>
                {p.review_status === 'error' && <span className="block mt-1 text-[10px] font-bold text-red-700 uppercase">Error</span>}
                {p.needs_review && p.review_status !== 'error' && <span className="block mt-1 text-[10px] font-bold text-amber-700 uppercase">Revisar</span>}
              </td>
              <td className="px-3 py-3 whitespace-nowrap">
                {p.drive_url && (
                  <a href={p.drive_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                     className="text-[10px] font-bold uppercase tracking-widest text-blue-600 hover:underline">
                    PDF ↗
                  </a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SummariesTable({ rows }: { rows: Summary[] }) {
  if (rows.length === 0) return <p className="text-sm text-neutral-400 p-6 text-center">Sin resúmenes mensuales</p>
  return (
    <div className="bg-white border border-neutral-100 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-100 text-left text-[10px] font-bold uppercase tracking-widest text-neutral-400">
            <th className="px-3 py-3">Mes</th>
            <th className="px-3 py-3">Empresa</th>
            <th className="px-3 py-3 text-right">Trabaj.</th>
            <th className="px-3 py-3 text-right">Bruto</th>
            <th className="px-3 py-3 text-right">SS trab.</th>
            <th className="px-3 py-3 text-right">IRPF</th>
            <th className="px-3 py-3 text-right">Líquido</th>
            <th className="px-3 py-3 text-right">SS empresa</th>
            <th className="px-3 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-50">
          {rows.map(s => (
            <tr key={s.id} className="hover:bg-neutral-50">
              <td className="px-3 py-3 whitespace-nowrap font-semibold">{MES_NOMBRE[s.periodo_mes]} {s.periodo_anio}</td>
              <td className="px-3 py-3 text-xs">
                <div className="font-semibold">{s.empresa_nombre}</div>
                <div className="text-[10px] text-neutral-400">{s.empresa_cif} {s.cuenta_cotizacion_ss ? `· ${s.cuenta_cotizacion_ss}` : ''}</div>
              </td>
              <td className="px-3 py-3 text-right tabular-nums">{s.num_trabajadores ?? '—'}</td>
              <td className="px-3 py-3 text-right tabular-nums">{formatEur(s.total_retribuciones)}</td>
              <td className="px-3 py-3 text-right tabular-nums text-neutral-500">{formatEur(s.total_deduccion_trabajador)}</td>
              <td className="px-3 py-3 text-right tabular-nums text-neutral-500">{formatEur(s.total_retencion_irpf)}</td>
              <td className="px-3 py-3 text-right tabular-nums font-bold text-green-700">{formatEur(s.total_liquido)}</td>
              <td className="px-3 py-3 text-right tabular-nums text-neutral-500">{formatEur(s.total_costes_empresa)}</td>
              <td className="px-3 py-3 whitespace-nowrap">
                {s.drive_url && (
                  <a href={s.drive_url} target="_blank" rel="noreferrer"
                     className="text-[10px] font-bold uppercase tracking-widest text-blue-600 hover:underline">
                    PDF ↗
                  </a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

type EmployeeEnriched = Employee & {
  n_nominas: number
  total_devengado: number
  total_irpf: number
  total_liquido: number
  ultima_nomina: string | null
}

function EmployeesTable({ rows }: { rows: EmployeeEnriched[] }) {
  if (rows.length === 0) return <p className="text-sm text-neutral-400 p-6 text-center">Sin trabajadores registrados</p>
  return (
    <div className="bg-white border border-neutral-100 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-100 text-left text-[10px] font-bold uppercase tracking-widest text-neutral-400">
            <th className="px-3 py-3">Nombre</th>
            <th className="px-3 py-3">NIF</th>
            <th className="px-3 py-3">Categoría</th>
            <th className="px-3 py-3">Antigüedad</th>
            <th className="px-3 py-3 text-right">Nóminas</th>
            <th className="px-3 py-3 text-right">Devengado</th>
            <th className="px-3 py-3 text-right">IRPF</th>
            <th className="px-3 py-3 text-right">Líquido</th>
            <th className="px-3 py-3">Última</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-50">
          {rows.map(e => (
            <tr key={e.id} className="hover:bg-neutral-50">
              <td className="px-3 py-3">
                <div className="font-semibold">{e.nombre}</div>
                {e.empresa_actual_nombre && <div className="text-[10px] text-neutral-400">{e.empresa_actual_nombre}</div>}
              </td>
              <td className="px-3 py-3 text-xs font-mono">{e.nif}</td>
              <td className="px-3 py-3 text-xs">
                {e.categoria_profesional || '—'}
                {e.grupo_cotizacion && <div className="text-[10px] text-neutral-400">Grupo {e.grupo_cotizacion}</div>}
              </td>
              <td className="px-3 py-3 text-xs">{formatDate(e.fecha_antiguedad)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{e.n_nominas}</td>
              <td className="px-3 py-3 text-right tabular-nums">{formatEur(e.total_devengado)}</td>
              <td className="px-3 py-3 text-right tabular-nums text-neutral-500">{formatEur(e.total_irpf)}</td>
              <td className="px-3 py-3 text-right tabular-nums font-bold text-green-700">{formatEur(e.total_liquido)}</td>
              <td className="px-3 py-3 text-xs text-neutral-500 whitespace-nowrap">{formatDate(e.ultima_nomina)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PayrollDetail({ payroll, onClose }: { payroll: Payroll; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30" onClick={onClose}>
      <div className="bg-white max-w-4xl w-full max-h-[90vh] overflow-y-auto rounded-lg shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-neutral-100 px-6 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold">{payroll.trabajador_nombre}</h3>
            <p className="text-xs text-neutral-400">
              {formatPeriodo(payroll)} · NIF {payroll.trabajador_nif}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {payroll.drive_url && (
              <a href={payroll.drive_url} target="_blank" rel="noreferrer"
                 className="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold uppercase tracking-widest rounded hover:bg-blue-700">
                Ver PDF ↗
              </a>
            )}
            <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 text-2xl leading-none">×</button>
          </div>
        </div>

        <div className="p-6 space-y-6 text-sm">

          {/* EMPRESA */}
          <Section title="Empresa">
            <Field label="Razón social" value={payroll.empresa_nombre} />
            <Field label="CIF" value={payroll.empresa_cif} />
            <Field label="Cuenta cotización SS" value={payroll.empresa_cuenta_cotizacion_ss} />
          </Section>

          {/* TRABAJADOR */}
          <Section title="Trabajador">
            <Field label="Nombre" value={payroll.trabajador_nombre} />
            <Field label="NIF" value={payroll.trabajador_nif} />
            <Field label="Núm. afiliación SS" value={payroll.trabajador_num_afiliacion_ss} />
            <Field label="Categoría profesional" value={payroll.trabajador_categoria} />
            <Field label="Grupo cotización" value={payroll.trabajador_grupo_cotizacion?.toString()} />
            <Field label="Fecha antigüedad" value={formatDate(payroll.trabajador_fecha_antiguedad)} />
          </Section>

          {/* DEVENGOS */}
          <Section title="Devengos">
            <Field label="Salario base" value={formatEur(payroll.salario_base)} />
            <Field label="Plus actividad" value={formatEur(payroll.plus_actividad)} />
            <Field label="Plus extrasalarial" value={formatEur(payroll.plus_extrasalarial)} />
            <Field label="Plus antigüedad" value={formatEur(payroll.plus_antiguedad)} />
            <Field label="Incentivos" value={formatEur(payroll.incentivos)} />
            <Field label="Paga extra prorrata" value={formatEur(payroll.paga_extra_prorrata)} />
            <Field label="A. TOTAL DEVENGADO" value={formatEur(payroll.total_devengado)} highlight />
          </Section>

          {/* DEDUCCIONES */}
          <Section title="Deducciones (trabajador)">
            <Field label="SS Cont. Comunes" value={formatEur(payroll.ss_cont_comunes_importe)} />
            <Field label="SS Desempleo" value={formatEur(payroll.ss_desempleo_importe)} />
            <Field label="SS Formación" value={formatEur(payroll.ss_formacion_importe)} />
            <Field label="SS total trabajador" value={formatEur(payroll.ss_total_trabajador)} />
            <Field label="IRPF" value={`${formatEur(payroll.irpf_importe)} (${payroll.irpf_porcentaje ? payroll.irpf_porcentaje + '%' : '—'})`} />
            <Field label="B. TOTAL A DEDUCIR" value={formatEur(payroll.total_deducciones)} highlight />
          </Section>

          {/* LÍQUIDO */}
          <div className="bg-green-50 border-2 border-green-200 rounded p-4">
            <p className="text-[10px] uppercase tracking-widest text-green-700 mb-1">Líquido a percibir (A - B)</p>
            <p className="text-3xl font-bold text-green-800 tabular-nums">{formatEur(payroll.liquido_a_percibir)}</p>
          </div>

          {/* BASES COTIZACIÓN */}
          <Section title="Bases de cotización">
            <Field label="Base Cont. Comunes" value={formatEur(payroll.base_cont_comunes)} />
            <Field label="Base IRPF" value={formatEur(payroll.base_irpf)} />
          </Section>

          {/* APORTACIÓN EMPRESA SS (coste laboral) */}
          <Section title="Aportación empresa a SS (coste laboral)">
            <Field label="Cont. Comunes empresa" value={formatEur(payroll.emp_cont_comunes_importe)} />
            <Field label="AT y EP" value={formatEur(payroll.emp_at_ep_importe)} />
            <Field label="Desempleo empresa" value={formatEur(payroll.emp_desempleo_importe)} />
            <Field label="Formación empresa" value={formatEur(payroll.emp_formacion_importe)} />
            <Field label="FOGASA" value={formatEur(payroll.emp_fogasa_importe)} />
            <Field label="SS total empresa" value={formatEur(payroll.ss_total_empresa)} />
            <Field label="COSTE TOTAL EMPRESA" value={formatEur(payroll.coste_total_empresa)} highlight />
          </Section>

          {/* IA Y AUDITORÍA */}
          {(payroll.ai_confidence !== null || payroll.ai_razones?.length || payroll.source) && (
            <Section title="Procesado IA">
              <Field label="Origen" value={payroll.source} />
              <Field label="Confianza IA" value={payroll.ai_confidence ? `${(payroll.ai_confidence * 100).toFixed(0)}%` : '—'} />
              {payroll.ai_razones && payroll.ai_razones.length > 0 && (
                <div className="col-span-2">
                  <p className="text-[10px] uppercase tracking-widest text-neutral-400 mb-1">Razones IA</p>
                  <ul className="text-xs space-y-0.5">
                    {payroll.ai_razones.map((r, i) => <li key={i} className="text-neutral-600">• {r}</li>)}
                  </ul>
                </div>
              )}
            </Section>
          )}

          {payroll.notes && (
            <Section title="Notas">
              <p className="text-sm text-neutral-700 whitespace-pre-wrap">{payroll.notes}</p>
            </Section>
          )}
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-3 border-b border-neutral-100 pb-2">{title}</h4>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">{children}</div>
    </div>
  )
}

function Field({ label, value, highlight = false }: { label: string; value: string | number | null | undefined; highlight?: boolean }) {
  return (
    <div className={highlight ? 'col-span-2 md:col-span-3 bg-neutral-50 p-2 rounded' : ''}>
      <p className="text-[10px] uppercase tracking-widest text-neutral-400">{label}</p>
      <p className={`text-sm tabular-nums ${highlight ? 'font-bold text-neutral-900' : 'text-neutral-700'}`}>
        {value === null || value === undefined || value === '' ? '—' : value}
      </p>
    </div>
  )
}
