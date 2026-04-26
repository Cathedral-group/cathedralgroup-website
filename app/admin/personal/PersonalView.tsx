'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'

const MES_NOMBRE = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = Record<string, any>

type DataBundle = {
  payrolls: AnyRow[]
  summaries: AnyRow[]
  employees: AnyRow[]
  contracts: AnyRow[]
  payments: AnyRow[]
  dependents: AnyRow[]
  familyHistory: AnyRow[]
  timeRecords: AnyRow[]
  vacations: AnyRow[]
  permits: AnyRow[]
  overtime: AnyRow[]
  itLeaves: AnyRow[]
  finiquitos: AnyRow[]
  taxFilings: AnyRow[]
  ssFilings: AnyRow[]
  equality: AnyRow[]
  agreements: AnyRow[]
  prl: AnyRow[]
}

function formatEur(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return '—'
  return val.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d + (d.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

type SectionKey = 'resumen' | 'trabajadores' | 'nominas' | 'tiempo' | 'cumplimiento' | 'prl'

const SECTIONS: { key: SectionKey; label: string; icon: string }[] = [
  { key: 'resumen',      label: 'Resumen',          icon: '📊' },
  { key: 'trabajadores', label: 'Trabajadores',     icon: '👥' },
  { key: 'nominas',      label: 'Nóminas y pagos',  icon: '💰' },
  { key: 'tiempo',       label: 'Tiempo y permisos',icon: '⏱' },
  { key: 'cumplimiento', label: 'Cumplimiento legal',icon: '📋' },
  { key: 'prl',          label: 'PRL',              icon: '🦺' },
]

export default function PersonalView({ data }: { data: DataBundle }) {
  const router = useRouter()
  const [section, setSection] = useState<SectionKey>('resumen')
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState<null | 'employee' | 'contract' | 'time' | 'vacation' | 'permit' | 'it' | 'tax' | 'ss' | 'prl' | 'finiquito' | 'agreement' | 'payment' | 'modelo145'>(null)

  const yearsAvailable = useMemo(() => {
    const ys = new Set<number>()
    data.payrolls.forEach(p => ys.add(p.periodo_anio))
    data.summaries.forEach(s => ys.add(s.periodo_anio))
    return Array.from(ys).sort((a, b) => b - a)
  }, [data])

  const [yearFilter, setYearFilter] = useState<number | 'todos'>('todos')

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-baseline justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-800">Personal</h1>
          <p className="text-xs text-neutral-400 mt-1">Sistema completo de gestión de personal — cumple normativa AEAT, TGSS, ITSS, RDL 8/2019, RD 902/2020 y LOPDGDD</p>
        </div>
        <div className="flex items-center gap-3">
          {yearsAvailable.length > 0 && (
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value === 'todos' ? 'todos' : parseInt(e.target.value))}
              className="text-sm border border-neutral-200 rounded px-3 py-1.5 bg-white"
            >
              <option value="todos">Todos los años</option>
              {yearsAvailable.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          )}
          <input
            type="text"
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-neutral-50 border-0 focus:ring-1 focus:ring-primary px-3 py-1.5 text-sm w-48"
          />
        </div>
      </div>

      {/* Tabs principales */}
      <div className="border-b border-neutral-100 flex gap-1 mb-6 overflow-x-auto">
        {SECTIONS.map(s => (
          <button
            key={s.key}
            onClick={() => setSection(s.key)}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-widest transition-colors whitespace-nowrap ${
              section === s.key ? 'border-b-2 border-primary text-primary' : 'text-neutral-400 hover:text-neutral-600'
            }`}
          >
            {s.icon} {s.label}
          </button>
        ))}
      </div>

      {section === 'resumen'      && <SectionResumen data={data} yearFilter={yearFilter} />}
      {section === 'trabajadores' && <SectionTrabajadores data={data} search={search} yearFilter={yearFilter} onCreate={setModal} />}
      {section === 'nominas'      && <SectionNominas data={data} search={search} yearFilter={yearFilter} onCreate={setModal} />}
      {section === 'tiempo'       && <SectionTiempo data={data} search={search} onCreate={setModal} />}
      {section === 'cumplimiento' && <SectionCumplimiento data={data} yearFilter={yearFilter} onCreate={setModal} />}
      {section === 'prl'          && <SectionPRL data={data} search={search} onCreate={setModal} />}

      {/* MODALES de creación */}
      {modal === 'employee'  && <EmployeeModal onClose={() => setModal(null)} onSaved={() => { setModal(null); router.refresh() }} />}
      {modal === 'contract'  && <ContractModal employees={data.employees} onClose={() => setModal(null)} onSaved={() => { setModal(null); router.refresh() }} />}
      {modal === 'time'      && <TimeRecordModal employees={data.employees} onClose={() => setModal(null)} onSaved={() => { setModal(null); router.refresh() }} />}
      {modal === 'vacation'  && <SimpleCreateModal title="Vacaciones" resource="vacation-records" employees={data.employees} fields={[
        { name: 'employee_id', label: 'Trabajador', type: 'employee', required: true },
        { name: 'anio', label: 'Año', type: 'number', required: true, default: new Date().getFullYear() },
        { name: 'dias_devengados', label: 'Días devengados', type: 'number' },
        { name: 'dias_disfrutados', label: 'Días disfrutados', type: 'number' },
        { name: 'fecha_inicio', label: 'Inicio disfrute', type: 'date' },
        { name: 'fecha_fin', label: 'Fin disfrute', type: 'date' },
        { name: 'estado', label: 'Estado', type: 'select', options: ['planificado','aprobado','disfrutado','rechazado','liquidado'], default: 'planificado' },
        { name: 'notes', label: 'Notas', type: 'textarea' },
      ]} onClose={() => setModal(null)} onSaved={() => { setModal(null); router.refresh() }} />}
      {modal === 'permit'    && <SimpleCreateModal title="Permiso retribuido" resource="leave-permits" employees={data.employees} fields={[
        { name: 'employee_id', label: 'Trabajador', type: 'employee', required: true },
        { name: 'tipo', label: 'Tipo', type: 'select', required: true, options: ['matrimonio','fallecimiento_familiar','accidente_familiar','cuidado_familiar','mudanza','examen','sufragio','lactancia','cuidado_menor_grave_enfermedad','fuerza_mayor','otros'] },
        { name: 'fecha_inicio', label: 'Inicio', type: 'date', required: true },
        { name: 'fecha_fin', label: 'Fin', type: 'date', required: true },
        { name: 'dias_naturales', label: 'Días naturales', type: 'number' },
        { name: 'parentesco', label: 'Parentesco' },
        { name: 'motivo_descripcion', label: 'Motivo', type: 'textarea' },
        { name: 'justificante_url', label: 'URL justificante (Drive)' },
      ]} onClose={() => setModal(null)} onSaved={() => { setModal(null); router.refresh() }} />}
      {modal === 'it'        && <SimpleCreateModal title="Baja IT" resource="it-leaves" employees={data.employees} fields={[
        { name: 'employee_id', label: 'Trabajador', type: 'employee', required: true },
        { name: 'contingencia', label: 'Contingencia', type: 'select', required: true, options: ['comun','accidente_trabajo','enfermedad_profesional','maternidad','paternidad','cuidado_menor','riesgo_embarazo','lactancia'] },
        { name: 'fecha_baja', label: 'Fecha baja', type: 'date', required: true },
        { name: 'fecha_alta', label: 'Fecha alta', type: 'date' },
        { name: 'mutua', label: 'Mutua' },
        { name: 'parte_baja_url', label: 'URL parte baja (Drive)' },
        { name: 'parte_alta_url', label: 'URL parte alta (Drive)' },
        { name: 'fecha_envio_red', label: 'Fecha envío Sistema RED', type: 'date' },
        { name: 'estado', label: 'Estado', type: 'select', options: ['activa','finalizada','prorrogada','agotada'], default: 'activa' },
        { name: 'notes', label: 'Notas', type: 'textarea' },
      ]} onClose={() => setModal(null)} onSaved={() => { setModal(null); router.refresh() }} />}
      {modal === 'tax'       && <SimpleCreateModal title="Modelo AEAT presentado" resource="tax-filings" fields={[
        { name: 'empresa_cif', label: 'CIF empresa', required: true, default: 'B19761915' },
        { name: 'empresa_nombre', label: 'Empresa', default: 'CATHEDRAL HOUSE INVESTMENT S.L.' },
        { name: 'modelo', label: 'Modelo', type: 'select', required: true, options: ['111','190','216','296','303','390','347','349','115','180','100','200','202'] },
        { name: 'ejercicio', label: 'Ejercicio', type: 'number', required: true, default: new Date().getFullYear() },
        { name: 'periodo', label: 'Periodo', placeholder: 'Q1, Q2, M01, ANUAL...' },
        { name: 'fecha_presentacion', label: 'Fecha presentación', type: 'date' },
        { name: 'importe_a_ingresar', label: 'Importe a ingresar', type: 'number' },
        { name: 'csv_aeat', label: 'CSV verificación AEAT' },
        { name: 'modelo_pdf_url', label: 'URL PDF modelo (Drive)' },
        { name: 'estado', label: 'Estado', type: 'select', options: ['pendiente','presentado','complementario','sustitutivo','sancionado'], default: 'presentado' },
      ]} onClose={() => setModal(null)} onSaved={() => { setModal(null); router.refresh() }} />}
      {modal === 'ss'        && <SimpleCreateModal title="Liquidación SS (RNT/RLC)" resource="ss-filings" fields={[
        { name: 'empresa_cif', label: 'CIF', required: true, default: 'B19761915' },
        { name: 'cuenta_cotizacion', label: 'Cuenta cotización', required: true, default: '28274546366' },
        { name: 'ejercicio', label: 'Ejercicio', type: 'number', required: true, default: new Date().getFullYear() },
        { name: 'mes', label: 'Mes (1-12)', type: 'number', required: true },
        { name: 'fecha_presentacion', label: 'Fecha presentación', type: 'date' },
        { name: 'fecha_cargo', label: 'Fecha cargo', type: 'date' },
        { name: 'importe_total', label: 'Importe total', type: 'number' },
        { name: 'rnt_url', label: 'URL RNT (Drive)' },
        { name: 'rlc_url', label: 'URL RLC (Drive)' },
        { name: 'estado', label: 'Estado', type: 'select', options: ['pendiente','presentada','cargada','aplazada','sancionada'], default: 'cargada' },
      ]} onClose={() => setModal(null)} onSaved={() => { setModal(null); router.refresh() }} />}
      {modal === 'prl'       && <SimpleCreateModal title="Documento PRL" resource="prl-documents" employees={data.employees} fields={[
        { name: 'tipo', label: 'Tipo', type: 'select', required: true, options: ['plan_prevencion','evaluacion_riesgos','planificacion_actividad','formacion','vigilancia_salud','accidente','investigacion_accidente','concierto_spa','memoria_anual','auditoria','otros'] },
        { name: 'titulo', label: 'Título', required: true },
        { name: 'employee_id', label: 'Trabajador (opcional, vacío = general)', type: 'employee' },
        { name: 'fecha_documento', label: 'Fecha documento', type: 'date', required: true },
        { name: 'vigencia_hasta', label: 'Vigencia hasta', type: 'date' },
        { name: 'realizado_por', label: 'Realizado por (interno/SPA...)' },
        { name: 'archivo_url', label: 'URL archivo (Drive)' },
        { name: 'apto', label: 'Apto (vigilancia salud)', type: 'checkbox' },
        { name: 'notes', label: 'Notas', type: 'textarea' },
      ]} onClose={() => setModal(null)} onSaved={() => { setModal(null); router.refresh() }} />}
      {modal === 'finiquito' && <SimpleCreateModal title="Finiquito" resource="finiquitos" employees={data.employees} fields={[
        { name: 'employee_id', label: 'Trabajador', type: 'employee', required: true },
        { name: 'fecha_baja', label: 'Fecha baja', type: 'date', required: true },
        { name: 'causa_baja_codigo', label: 'Código causa baja (SEPE)', placeholder: '51, 52, 54...' },
        { name: 'causa_baja_descripcion', label: 'Causa baja' },
        { name: 'salario_pendiente', label: 'Salario pendiente', type: 'number' },
        { name: 'vacaciones_no_disfrutadas_dias', label: 'Días vacaciones no disfrutadas', type: 'number' },
        { name: 'vacaciones_no_disfrutadas_importe', label: 'Importe vacaciones no disfrutadas', type: 'number' },
        { name: 'paga_extra_prorrata', label: 'Paga extra prorrata', type: 'number' },
        { name: 'horas_extra_pendientes', label: 'Horas extra pendientes', type: 'number' },
        { name: 'indemnizacion_dias_x_anio', label: 'Indemnización días/año (20=objetivo, 33=improcedente)', type: 'number' },
        { name: 'indemnizacion_importe', label: 'Indemnización importe', type: 'number' },
        { name: 'total_devengado', label: 'TOTAL devengado', type: 'number', required: true },
        { name: 'retencion_irpf', label: 'IRPF retenido', type: 'number' },
        { name: 'ss_trabajador', label: 'SS trabajador retenido', type: 'number' },
        { name: 'total_deducciones', label: 'Total deducciones', type: 'number' },
        { name: 'liquido_a_percibir', label: 'LÍQUIDO a percibir', type: 'number', required: true },
        { name: 'documento_pdf_url', label: 'URL PDF finiquito (Drive)' },
        { name: 'firmado', label: 'Firmado por trabajador', type: 'checkbox' },
        { name: 'no_conforme', label: 'Firmado "no conforme"', type: 'checkbox' },
        { name: 'fecha_firma', label: 'Fecha firma', type: 'date' },
        { name: 'presencia_representante', label: 'Presencia representante trabajadores', type: 'checkbox' },
        { name: 'representante_nombre', label: 'Nombre representante' },
        { name: 'certificado_empresa_url', label: 'URL certificado SEPE Certific@2 (Drive)' },
        { name: 'fecha_envio_certific2', label: 'Fecha envío Certific@2', type: 'date' },
        { name: 'fecha_pago', label: 'Fecha pago', type: 'date' },
        { name: 'importe_pagado', label: 'Importe realmente pagado', type: 'number' },
        { name: 'iban_destino', label: 'IBAN destino' },
        { name: 'notes', label: 'Notas', type: 'textarea' },
      ]} onClose={() => setModal(null)} onSaved={() => { setModal(null); router.refresh() }} />}
      {modal === 'agreement' && <SimpleCreateModal title="Convenio colectivo" resource="collective-agreements" fields={[
        { name: 'codigo_boe', label: 'Código BOE' },
        { name: 'nombre', label: 'Nombre convenio', required: true },
        { name: 'ambito_geografico', label: 'Ámbito geográfico', placeholder: 'Estatal, Madrid...' },
        { name: 'ambito_funcional', label: 'Ámbito funcional', placeholder: 'Inmobiliarias, Construcción...' },
        { name: 'vigencia_desde', label: 'Vigente desde', type: 'date' },
        { name: 'vigencia_hasta', label: 'Vigente hasta', type: 'date' },
        { name: 'tabla_salarial_url', label: 'URL tabla salarial (Drive)' },
        { name: 'texto_convenio_url', label: 'URL texto completo (Drive)' },
        { name: 'notes', label: 'Notas', type: 'textarea' },
      ]} onClose={() => setModal(null)} onSaved={() => { setModal(null); router.refresh() }} />}
      {modal === 'payment'   && <SimpleCreateModal title="Justificante pago nómina" resource="payroll-payments" employees={data.employees} payrolls={data.payrolls} fields={[
        { name: 'payroll_id', label: 'Nómina vinculada (opcional pero recomendado)', type: 'payroll' },
        { name: 'employee_id', label: 'Trabajador', type: 'employee', required: true },
        { name: 'fecha_transferencia', label: 'Fecha transferencia', type: 'date', required: true },
        { name: 'importe', label: 'Importe', type: 'number', required: true },
        { name: 'iban_origen', label: 'IBAN origen' },
        { name: 'banco_origen', label: 'Banco origen' },
        { name: 'iban_destino', label: 'IBAN destino' },
        { name: 'banco_destino', label: 'Banco destino' },
        { name: 'referencia_bancaria', label: 'Referencia bancaria' },
        { name: 'concepto_transferencia', label: 'Concepto transferencia' },
        { name: 'justificante_pdf_url', label: 'URL justificante (Drive)' },
        { name: 'recibo_firmado_url', label: 'URL nómina firmada (Drive)' },
        { name: 'metodo_firma', label: 'Método firma', type: 'select', options: ['presencial','electronica','transferencia'], default: 'transferencia' },
        { name: 'fecha_firma', label: 'Fecha firma', type: 'date' },
        { name: 'reconciliado', label: 'Reconciliado con extracto bancario', type: 'checkbox' },
        { name: 'notes', label: 'Notas', type: 'textarea' },
      ]} onClose={() => setModal(null)} onSaved={() => { setModal(null); router.refresh() }} />}
      {modal === 'modelo145' && <SimpleCreateModal title="Modelo 145 (situación familiar)" resource="employee-family-history" employees={data.employees} fields={[
        { name: 'employee_id', label: 'Trabajador', type: 'employee', required: true },
        { name: 'fecha_efecto', label: 'Fecha efecto', type: 'date', required: true },
        { name: 'fecha_firma', label: 'Fecha firma', type: 'date' },
        { name: 'situacion_familiar', label: 'Situación familiar (1=soltero, 2=casado-cónyuge sin rentas, 3=otros)', type: 'select-int', required: true, options: ['1','2','3'] },
        { name: 'nif_conyuge', label: 'NIF cónyuge' },
        { name: 'conyuge_rentas_superiores_1500', label: 'Cónyuge rentas > 1.500€', type: 'checkbox' },
        { name: 'discapacidad_grado', label: 'Discapacidad grado', type: 'select-int', options: ['0','33','65'], default: '0' },
        { name: 'discapacidad_movilidad_reducida', label: 'Discapacidad con movilidad reducida', type: 'checkbox' },
        { name: 'movilidad_geografica', label: 'Movilidad geográfica', type: 'checkbox' },
        { name: 'prolongacion_actividad', label: 'Prolongación actividad', type: 'checkbox' },
        { name: 'prestamo_vivienda_anterior_2013', label: 'Préstamo vivienda anterior 2013', type: 'checkbox' },
        { name: 'pension_compensatoria_conyuge', label: 'Pensión compensatoria cónyuge', type: 'number' },
        { name: 'anualidades_alimentos_hijos', label: 'Anualidades alimentos hijos', type: 'number' },
        { name: 'residencia_ceuta_melilla', label: 'Residencia Ceuta/Melilla', type: 'checkbox' },
        { name: 'modelo_145_pdf_url', label: 'URL PDF firmado (Drive)' },
        { name: 'notes', label: 'Notas', type: 'textarea' },
      ]} onClose={() => setModal(null)} onSaved={() => { setModal(null); router.refresh() }} />}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// SECCIÓN: RESUMEN (overview con KPIs y status compliance)
// ────────────────────────────────────────────────────────────────
function SectionResumen({ data, yearFilter }: { data: DataBundle; yearFilter: number | 'todos' }) {
  const yearOnes = data.payrolls.filter(p => yearFilter === 'todos' || p.periodo_anio === yearFilter)
  const totalNominas = yearOnes.length
  const totalBruto = yearOnes.reduce((s, p) => s + (p.total_devengado || 0), 0)
  const totalIRPF = yearOnes.reduce((s, p) => s + (p.irpf_importe || 0), 0)
  const totalLiquido = yearOnes.reduce((s, p) => s + (p.liquido_a_percibir || 0), 0)
  const totalCosteEmpresa = yearOnes.reduce((s, p) => s + (p.coste_total_empresa || 0), 0)

  // Compliance checks
  const today = new Date()
  const empleadosActivos = data.employees.filter(e => !e.fecha_baja || new Date(e.fecha_baja) > today)

  const sinModelo145 = empleadosActivos.filter(e => !e.fecha_firma_modelo_145).length
  const sinFormacionPRL = empleadosActivos.filter(e => !e.formacion_prl_fecha).length
  const sinVigilanciaSalud = empleadosActivos.filter(e => !e.apto_vigilancia_salud_fecha).length
  const sinContrato = empleadosActivos.filter(e => !data.contracts.some(c => c.employee_id === e.id && c.estado === 'vigente')).length
  const sinJornadaHoy = empleadosActivos.filter(e => !data.timeRecords.some(t => t.employee_id === e.id && t.fecha === today.toISOString().slice(0, 10))).length

  const complianceItems = [
    { label: 'Trabajadores sin Modelo 145', count: sinModelo145, total: empleadosActivos.length, norma: 'AEAT (RD 439/2007)', critico: sinModelo145 > 0 },
    { label: 'Trabajadores sin contrato vigente', count: sinContrato, total: empleadosActivos.length, norma: 'Art. 8 ET', critico: sinContrato > 0 },
    { label: 'Trabajadores sin formación PRL', count: sinFormacionPRL, total: empleadosActivos.length, norma: 'Ley 31/1995', critico: sinFormacionPRL > 0 },
    { label: 'Trabajadores sin vigilancia salud al día', count: sinVigilanciaSalud, total: empleadosActivos.length, norma: 'Ley 31/1995', critico: sinVigilanciaSalud > 0 },
    { label: 'Sin registro jornada hoy', count: sinJornadaHoy, total: empleadosActivos.length, norma: 'RDL 8/2019', critico: sinJornadaHoy > 0 },
  ]

  const taxFilingsAnio = data.taxFilings.filter(t => yearFilter === 'todos' || t.ejercicio === yearFilter)
  const ssFilingsAnio = data.ssFilings.filter(s => yearFilter === 'todos' || s.ejercicio === yearFilter)

  return (
    <div className="space-y-8">
      {/* KPIs principales */}
      <section>
        <h2 className="text-sm font-bold uppercase tracking-widest text-neutral-500 mb-3">📊 Indicadores clave</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <KPICard label="Trabajadores activos" value={empleadosActivos.length.toString()} />
          <KPICard label="Nóminas año" value={totalNominas.toString()} />
          <KPICard label="Bruto devengado" value={formatEur(totalBruto)} />
          <KPICard label="IRPF retenido" value={formatEur(totalIRPF)} hint="Mod. 111 / 190" />
          <KPICard label="Líquido pagado" value={formatEur(totalLiquido)} />
          <KPICard label="Coste empresa" value={formatEur(totalCosteEmpresa)} />
        </div>
      </section>

      {/* Compliance status */}
      <section>
        <h2 className="text-sm font-bold uppercase tracking-widest text-neutral-500 mb-3">✅ Estado de cumplimiento</h2>
        <div className="space-y-2">
          {complianceItems.map((item, i) => (
            <div key={i} className={`p-3 rounded border flex items-center justify-between ${item.critico ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
              <div className="flex items-center gap-3">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${item.critico ? 'bg-amber-500' : 'bg-green-500'}`} />
                <div>
                  <p className="text-sm font-semibold text-neutral-800">{item.label}</p>
                  <p className="text-[10px] text-neutral-500">{item.norma}</p>
                </div>
              </div>
              <div className={`text-sm font-bold ${item.critico ? 'text-amber-800' : 'text-green-800'}`}>
                {item.count} / {item.total}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Modelos fiscales presentados */}
      <section>
        <h2 className="text-sm font-bold uppercase tracking-widest text-neutral-500 mb-3">📑 Presentaciones del año</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-white border border-neutral-200 rounded">
            <p className="text-xs uppercase tracking-widest text-neutral-400 mb-2">Modelos AEAT presentados</p>
            <p className="text-2xl font-bold text-neutral-800">{taxFilingsAnio.length}</p>
            <ul className="text-[10px] text-neutral-500 mt-2 space-y-0.5">
              <li>Modelo 111 (trimestral): {taxFilingsAnio.filter(t => t.modelo === '111').length}/4 trimestres</li>
              <li>Modelo 190 (anual): {taxFilingsAnio.filter(t => t.modelo === '190').length > 0 ? '✓' : 'pendiente'}</li>
            </ul>
          </div>
          <div className="p-4 bg-white border border-neutral-200 rounded">
            <p className="text-xs uppercase tracking-widest text-neutral-400 mb-2">Liquidaciones SS (RNT/RLC)</p>
            <p className="text-2xl font-bold text-neutral-800">{ssFilingsAnio.length}</p>
            <p className="text-[10px] text-neutral-500 mt-2">de 12 meses anuales</p>
          </div>
        </div>
      </section>

      {/* Tablas auxiliares stats */}
      <section>
        <h2 className="text-sm font-bold uppercase tracking-widest text-neutral-500 mb-3">📂 Datos almacenados</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <CountCard label="Contratos" value={data.contracts.length} />
          <CountCard label="Pagos justificados" value={data.payments.length} />
          <CountCard label="Reg. jornada" value={data.timeRecords.length} hint="últimos 500" />
          <CountCard label="Vacaciones" value={data.vacations.length} />
          <CountCard label="Permisos" value={data.permits.length} />
          <CountCard label="Bajas IT" value={data.itLeaves.length} />
          <CountCard label="Finiquitos" value={data.finiquitos.length} />
          <CountCard label="Documentos PRL" value={data.prl.length} />
          <CountCard label="Convenios" value={data.agreements.length} />
          <CountCard label="Reg. retributivo" value={data.equality.length} />
          <CountCard label="Familia trabajadores" value={data.dependents.length} />
          <CountCard label="Histórico Mod. 145" value={data.familyHistory.length} />
        </div>
      </section>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// SECCIÓN: TRABAJADORES (employees + contratos + dependents + family history)
// ────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ModalKey = any

function SectionTrabajadores({ data, search, yearFilter, onCreate }: { data: DataBundle; search: string; yearFilter: number | 'todos'; onCreate: (m: ModalKey) => void }) {
  const [tab, setTab] = useState<'lista' | 'contratos' | 'familia' | 'modelo145'>('lista')

  const filtered = data.employees.filter(e => {
    if (!search) return true
    const q = search.toLowerCase()
    return `${e.nombre} ${e.nif} ${e.categoria_profesional || ''} ${e.email || ''}`.toLowerCase().includes(q)
  })

  const createBtn = (label: string, action: ModalKey) => (
    <button onClick={() => onCreate(action)} className="px-3 py-1.5 bg-primary text-white text-[11px] font-bold uppercase tracking-widest rounded hover:opacity-90">+ {label}</button>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <SubTabs value={tab} onChange={setTab} options={[
          { v: 'lista',     label: `Lista (${filtered.length})` },
          { v: 'contratos', label: `Contratos (${data.contracts.length})` },
          { v: 'familia',   label: `Familia (${data.dependents.length})` },
          { v: 'modelo145', label: `Histórico Mod. 145 (${data.familyHistory.length})` },
        ]} />
        <div className="flex gap-2">
          {tab === 'lista'     && createBtn('Trabajador',      'employee')}
          {tab === 'contratos' && createBtn('Contrato',        'contract')}
          {tab === 'modelo145' && createBtn('Modelo 145',      'modelo145')}
        </div>
      </div>

      {tab === 'lista' && (
        <SimpleTable
          rows={filtered}
          empty="Sin trabajadores"
          columns={[
            { key: 'nombre', label: 'Nombre', render: (r) => <strong>{r.nombre}</strong> },
            { key: 'nif', label: 'NIF', render: (r) => <span className="font-mono text-xs">{r.nif}</span> },
            { key: 'num_afiliacion_ss', label: 'NAF SS' },
            { key: 'categoria_profesional', label: 'Categoría' },
            { key: 'grupo_cotizacion', label: 'Grupo' },
            { key: 'fecha_antiguedad', label: 'Antigüedad', render: (r) => formatDate(r.fecha_antiguedad) },
            { key: 'situacion_familiar', label: 'Sit. fam.', render: (r) => r.situacion_familiar ? `Tipo ${r.situacion_familiar}` : '—' },
            { key: 'fecha_firma_modelo_145', label: 'Mod. 145', render: (r) => r.fecha_firma_modelo_145 ? '✓' : <span className="text-amber-600">⚠</span> },
            { key: 'formacion_prl_fecha', label: 'Form. PRL', render: (r) => r.formacion_prl_fecha ? formatDate(r.formacion_prl_fecha) : <span className="text-amber-600">⚠</span> },
            { key: 'iban', label: 'IBAN', render: (r) => r.iban ? r.iban.substring(0, 6) + '...' : '—' },
          ]}
        />
      )}
      {tab === 'contratos' && (
        <SimpleTable
          rows={data.contracts.filter(c => yearFilter === 'todos' || new Date(c.fecha_inicio).getFullYear() === yearFilter)}
          empty="Sin contratos registrados. Diseñado para almacenar tipo, fechas, jornada, salario, comunicación SEPE, PDF firmado, prórrogas y extinción."
          columns={[
            { key: 'employee_id', label: 'Trabajador', render: (r) => data.employees.find(e => e.id === r.employee_id)?.nombre ?? '—' },
            { key: 'tipo_contrato', label: 'Tipo' },
            { key: 'codigo_clave_sepe', label: 'Clave SEPE' },
            { key: 'fecha_inicio', label: 'Inicio', render: (r) => formatDate(r.fecha_inicio) },
            { key: 'fecha_fin', label: 'Fin', render: (r) => formatDate(r.fecha_fin) || 'Indefinido' },
            { key: 'salario_bruto_anual', label: 'Salario anual', render: (r) => formatEur(r.salario_bruto_anual) },
            { key: 'estado', label: 'Estado', render: (r) => <Badge value={r.estado} /> },
          ]}
        />
      )}
      {tab === 'familia' && (
        <SimpleTable
          rows={data.dependents}
          empty="Sin dependientes registrados. Diseñado para hijos, ascendientes y cónyuge — usado para calcular IRPF (deducciones por mínimo familiar)."
          columns={[
            { key: 'employee_id', label: 'Trabajador', render: (r) => data.employees.find(e => e.id === r.employee_id)?.nombre ?? '—' },
            { key: 'tipo', label: 'Tipo', render: (r) => <Badge value={r.tipo} /> },
            { key: 'nombre', label: 'Nombre' },
            { key: 'nif', label: 'NIF', render: (r) => <span className="font-mono text-xs">{r.nif || '—'}</span> },
            { key: 'fecha_nacimiento', label: 'F. Nacim.', render: (r) => formatDate(r.fecha_nacimiento) },
            { key: 'discapacidad_grado', label: 'Discap.', render: (r) => r.discapacidad_grado ? `${r.discapacidad_grado}%` : '—' },
            { key: 'computa_irpf', label: 'IRPF', render: (r) => r.computa_irpf ? '✓' : '—' },
          ]}
        />
      )}
      {tab === 'modelo145' && (
        <SimpleTable
          rows={data.familyHistory}
          empty="Sin histórico de Modelo 145. Cada vez que un trabajador firme un nuevo Modelo 145 (alta o cambio familiar) se registra aquí. Plazo legal: conservar mientras dure relación + 4 años post-baja."
          columns={[
            { key: 'employee_id', label: 'Trabajador', render: (r) => data.employees.find(e => e.id === r.employee_id)?.nombre ?? '—' },
            { key: 'fecha_efecto', label: 'Fecha efecto', render: (r) => formatDate(r.fecha_efecto) },
            { key: 'situacion_familiar', label: 'Sit. familiar', render: (r) => `Tipo ${r.situacion_familiar}` },
            { key: 'discapacidad_grado', label: 'Discap.', render: (r) => r.discapacidad_grado ? `${r.discapacidad_grado}%` : '—' },
            { key: 'modelo_145_pdf_url', label: 'PDF', render: (r) => r.modelo_145_pdf_url ? <a href={r.modelo_145_pdf_url} target="_blank" rel="noreferrer" className="text-blue-600 underline text-xs">Ver</a> : '—' },
          ]}
        />
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// SECCIÓN: NÓMINAS (payrolls + payments + summaries)
// ────────────────────────────────────────────────────────────────
function SectionNominas({ data, search, yearFilter, onCreate }: { data: DataBundle; search: string; yearFilter: number | 'todos'; onCreate: (m: ModalKey) => void }) {
  const [tab, setTab] = useState<'nominas' | 'pagos' | 'resumenes'>('nominas')

  const filteredPayrolls = data.payrolls.filter(p => {
    if (yearFilter !== 'todos' && p.periodo_anio !== yearFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return `${p.trabajador_nombre} ${p.trabajador_nif} ${p.empresa_nombre}`.toLowerCase().includes(q)
    }
    return true
  })

  const filteredSummaries = data.summaries.filter(s => yearFilter === 'todos' || s.periodo_anio === yearFilter)
  const filteredPayments = data.payments.filter(p => yearFilter === 'todos' || new Date(p.fecha_transferencia).getFullYear() === yearFilter)

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <SubTabs value={tab} onChange={setTab} options={[
          { v: 'nominas',   label: `Nóminas (${filteredPayrolls.length})` },
          { v: 'pagos',     label: `Pagos justificados (${filteredPayments.length})` },
          { v: 'resumenes', label: `Resúmenes mensuales (${filteredSummaries.length})` },
        ]} />
        <div className="flex gap-2">
          {tab === 'pagos' && (
            <button onClick={() => onCreate('payment')} className="px-3 py-1.5 bg-primary text-white text-[11px] font-bold uppercase tracking-widest rounded hover:opacity-90">+ Justificante pago</button>
          )}
        </div>
      </div>

      {tab === 'nominas' && (
        <SimpleTable
          rows={filteredPayrolls}
          empty="Sin nóminas. Llegan automáticamente al reenviar un email con nóminas adjuntas."
          columns={[
            { key: 'periodo', label: 'Período', render: (r) => `${MES_NOMBRE[r.periodo_mes]} ${r.periodo_anio}` },
            { key: 'trabajador_nombre', label: 'Trabajador', render: (r) => <strong>{r.trabajador_nombre}</strong> },
            { key: 'total_devengado', label: 'Devengado', render: (r) => formatEur(r.total_devengado) },
            { key: 'ss_total_trabajador', label: 'SS trab.', render: (r) => formatEur(r.ss_total_trabajador) },
            { key: 'irpf_importe', label: 'IRPF', render: (r) => formatEur(r.irpf_importe) },
            { key: 'liquido_a_percibir', label: 'Líquido', render: (r) => <strong className="text-green-700">{formatEur(r.liquido_a_percibir)}</strong> },
            { key: 'coste_total_empresa', label: 'Coste empresa', render: (r) => formatEur(r.coste_total_empresa) },
            { key: 'payment_status', label: 'Pago', render: (r) => <Badge value={r.payment_status} /> },
            { key: 'drive_url', label: 'PDF', render: (r) => r.drive_url ? <a href={r.drive_url} target="_blank" rel="noreferrer" className="text-blue-600 underline text-xs">↗</a> : '—' },
          ]}
        />
      )}

      {tab === 'pagos' && (
        <SimpleTable
          rows={filteredPayments}
          empty="Sin pagos justificados. Diseñado para almacenar transferencia bancaria + IBAN origen/destino + referencia + justificante PDF, cumpliendo art. 29 ET (sustituye firma del recibo)."
          columns={[
            { key: 'fecha_transferencia', label: 'Fecha', render: (r) => formatDate(r.fecha_transferencia) },
            { key: 'employee_id', label: 'Trabajador', render: (r) => data.employees.find(e => e.id === r.employee_id)?.nombre ?? '—' },
            { key: 'importe', label: 'Importe', render: (r) => formatEur(r.importe) },
            { key: 'iban_destino', label: 'IBAN destino', render: (r) => r.iban_destino?.substring(0,6) + '...' || '—' },
            { key: 'referencia_bancaria', label: 'Ref. banco' },
            { key: 'reconciliado', label: 'Reconciliado', render: (r) => r.reconciliado ? '✓' : '—' },
            { key: 'justificante_pdf_url', label: 'Justif.', render: (r) => r.justificante_pdf_url ? <a href={r.justificante_pdf_url} target="_blank" rel="noreferrer" className="text-blue-600 underline text-xs">Ver</a> : '—' },
          ]}
        />
      )}

      {tab === 'resumenes' && (
        <SimpleTable
          rows={filteredSummaries}
          empty="Sin resúmenes mensuales"
          columns={[
            { key: 'periodo', label: 'Mes', render: (r) => `${MES_NOMBRE[r.periodo_mes]} ${r.periodo_anio}` },
            { key: 'empresa_nombre', label: 'Empresa' },
            { key: 'num_trabajadores', label: 'Trabaj.', render: (r) => r.num_trabajadores ?? '—' },
            { key: 'total_retribuciones', label: 'Bruto', render: (r) => formatEur(r.total_retribuciones) },
            { key: 'total_retencion_irpf', label: 'IRPF', render: (r) => formatEur(r.total_retencion_irpf) },
            { key: 'total_liquido', label: 'Líquido', render: (r) => <strong className="text-green-700">{formatEur(r.total_liquido)}</strong> },
            { key: 'total_costes_empresa', label: 'SS empresa', render: (r) => formatEur(r.total_costes_empresa) },
            { key: 'drive_url', label: 'PDF', render: (r) => r.drive_url ? <a href={r.drive_url} target="_blank" rel="noreferrer" className="text-blue-600 underline text-xs">↗</a> : '—' },
          ]}
        />
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// SECCIÓN: TIEMPO (jornada + vacaciones + permisos + horas extra + IT)
// ────────────────────────────────────────────────────────────────
function SectionTiempo({ data, search, onCreate }: { data: DataBundle; search: string; onCreate: (m: ModalKey) => void }) {
  const [tab, setTab] = useState<'jornada' | 'vacaciones' | 'permisos' | 'extras' | 'it'>('jornada')

  const createBtn = (label: string, action: ModalKey) => (
    <button onClick={() => onCreate(action)} className="px-3 py-1.5 bg-primary text-white text-[11px] font-bold uppercase tracking-widest rounded hover:opacity-90">+ {label}</button>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <SubTabs value={tab} onChange={setTab} options={[
          { v: 'jornada',     label: `Jornada (${data.timeRecords.length})` },
          { v: 'vacaciones',  label: `Vacaciones (${data.vacations.length})` },
          { v: 'permisos',    label: `Permisos (${data.permits.length})` },
          { v: 'extras',      label: `Horas extra (${data.overtime.length})` },
          { v: 'it',          label: `Bajas IT (${data.itLeaves.length})` },
        ]} />
        <div className="flex gap-2">
          {tab === 'jornada'    && createBtn('Fichaje',    'time')}
          {tab === 'vacaciones' && createBtn('Vacaciones', 'vacation')}
          {tab === 'permisos'   && createBtn('Permiso',    'permit')}
          {tab === 'it'         && createBtn('Baja IT',    'it')}
        </div>
      </div>

      {tab === 'jornada' && (
        <div>
          <ComplianceWarning text="Obligatorio por RDL 8/2019. Sanciones 751€-7.500€ por incumplimiento. Conservación 4 años. Accesible para trabajadores, representantes e ITSS." />
          <SimpleTable
            rows={data.timeRecords}
            empty="Sin registros de jornada. Diseñado para hora entrada/salida diaria, pausas (jsonb), horas ordinarias/extra/nocturnas, hash de inalterabilidad."
            columns={[
              { key: 'fecha', label: 'Fecha', render: (r) => formatDate(r.fecha) },
              { key: 'employee_id', label: 'Trabajador', render: (r) => data.employees.find(e => e.id === r.employee_id)?.nombre ?? '—' },
              { key: 'hora_entrada', label: 'Entrada' },
              { key: 'hora_salida', label: 'Salida' },
              { key: 'horas_ordinarias', label: 'H. ordin.', render: (r) => r.horas_ordinarias?.toFixed(1) ?? '—' },
              { key: 'horas_extra', label: 'H. extra', render: (r) => r.horas_extra?.toFixed(1) ?? '0.0' },
              { key: 'fuente', label: 'Fuente' },
            ]}
          />
        </div>
      )}

      {tab === 'vacaciones' && (
        <SimpleTable
          rows={data.vacations}
          empty="Sin vacaciones registradas. Mín 30 días naturales/año (art. 38 ET). Diseñado para devengadas, disfrutadas, pendientes acumulados, fecha disfrute."
          columns={[
            { key: 'employee_id', label: 'Trabajador', render: (r) => data.employees.find(e => e.id === r.employee_id)?.nombre ?? '—' },
            { key: 'anio', label: 'Año' },
            { key: 'dias_devengados', label: 'Devengados' },
            { key: 'dias_disfrutados', label: 'Disfrutados' },
            { key: 'dias_pendientes', label: 'Pendientes' },
            { key: 'fecha_inicio', label: 'Inicio', render: (r) => formatDate(r.fecha_inicio) },
            { key: 'fecha_fin', label: 'Fin', render: (r) => formatDate(r.fecha_fin) },
            { key: 'estado', label: 'Estado', render: (r) => <Badge value={r.estado} /> },
          ]}
        />
      )}

      {tab === 'permisos' && (
        <SimpleTable
          rows={data.permits}
          empty="Sin permisos retribuidos registrados. Tipos cubiertos por art. 37 ET ampliado por RDL 5/2023: matrimonio, fallecimiento familiar, lactancia, fuerza mayor, etc."
          columns={[
            { key: 'employee_id', label: 'Trabajador', render: (r) => data.employees.find(e => e.id === r.employee_id)?.nombre ?? '—' },
            { key: 'tipo', label: 'Tipo', render: (r) => <Badge value={r.tipo} /> },
            { key: 'fecha_inicio', label: 'Inicio', render: (r) => formatDate(r.fecha_inicio) },
            { key: 'fecha_fin', label: 'Fin', render: (r) => formatDate(r.fecha_fin) },
            { key: 'dias_naturales', label: 'Días' },
            { key: 'parentesco', label: 'Parentesco' },
            { key: 'estado', label: 'Estado', render: (r) => <Badge value={r.estado} /> },
          ]}
        />
      )}

      {tab === 'extras' && (
        <SimpleTable
          rows={data.overtime}
          empty="Sin registro de horas extra. Por art. 35.5 ET deben comunicarse mensualmente al trabajador y a representantes."
          columns={[
            { key: 'periodo', label: 'Período', render: (r) => `${MES_NOMBRE[r.mes]} ${r.ejercicio}` },
            { key: 'employee_id', label: 'Trabajador', render: (r) => data.employees.find(e => e.id === r.employee_id)?.nombre ?? '—' },
            { key: 'total_horas_extra', label: 'Total horas' },
            { key: 'importe_total', label: 'Importe', render: (r) => formatEur(r.importe_total) },
            { key: 'comunicacion_trabajador_fecha', label: 'Comun. trab.', render: (r) => formatDate(r.comunicacion_trabajador_fecha) },
          ]}
        />
      )}

      {tab === 'it' && (
        <SimpleTable
          rows={data.itLeaves}
          empty="Sin bajas IT registradas. Diseñado para tramitar partes baja/confirmación/alta, contingencia (CC/AT/EP/maternidad), días pago empresa vs mutua, envío al Sistema RED."
          columns={[
            { key: 'employee_id', label: 'Trabajador', render: (r) => data.employees.find(e => e.id === r.employee_id)?.nombre ?? '—' },
            { key: 'contingencia', label: 'Tipo', render: (r) => <Badge value={r.contingencia} /> },
            { key: 'fecha_baja', label: 'F. Baja', render: (r) => formatDate(r.fecha_baja) },
            { key: 'fecha_alta', label: 'F. Alta', render: (r) => formatDate(r.fecha_alta) },
            { key: 'duracion_dias', label: 'Días' },
            { key: 'estado', label: 'Estado', render: (r) => <Badge value={r.estado} /> },
            { key: 'fecha_envio_red', label: 'Sistema RED', render: (r) => formatDate(r.fecha_envio_red) },
          ]}
        />
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// SECCIÓN: CUMPLIMIENTO LEGAL (modelos AEAT, SS, finiquitos, igualdad, convenios)
// ────────────────────────────────────────────────────────────────
function SectionCumplimiento({ data, yearFilter, onCreate }: { data: DataBundle; yearFilter: number | 'todos'; onCreate: (m: ModalKey) => void }) {
  const [tab, setTab] = useState<'aeat' | 'ss' | 'finiquitos' | 'igualdad' | 'convenios'>('aeat')

  const filteredTax = data.taxFilings.filter(t => yearFilter === 'todos' || t.ejercicio === yearFilter)
  const filteredSs = data.ssFilings.filter(s => yearFilter === 'todos' || s.ejercicio === yearFilter)
  const filteredEqu = data.equality.filter(e => yearFilter === 'todos' || e.periodo_anio === yearFilter)

  const createBtn = (label: string, action: ModalKey) => (
    <button onClick={() => onCreate(action)} className="px-3 py-1.5 bg-primary text-white text-[11px] font-bold uppercase tracking-widest rounded hover:opacity-90">+ {label}</button>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <SubTabs value={tab} onChange={setTab} options={[
          { v: 'aeat',       label: `Modelos AEAT (${filteredTax.length})` },
          { v: 'ss',         label: `RNT/RLC SS (${filteredSs.length})` },
          { v: 'finiquitos', label: `Finiquitos (${data.finiquitos.length})` },
          { v: 'igualdad',   label: `Reg. Retributivo (${filteredEqu.length})` },
          { v: 'convenios',  label: `Convenios (${data.agreements.length})` },
        ]} />
        <div className="flex gap-2">
          {tab === 'aeat'       && createBtn('Modelo AEAT', 'tax')}
          {tab === 'ss'         && createBtn('Liquidación SS', 'ss')}
          {tab === 'finiquitos' && createBtn('Finiquito', 'finiquito')}
          {tab === 'convenios'  && createBtn('Convenio', 'agreement')}
        </div>
      </div>

      {tab === 'aeat' && (
        <div>
          <ComplianceWarning text="Plazo conservación: 4 años (prescripción tributaria art. 66 LGT). Modelos: 111 trimestral retenciones IRPF, 190 anual, 145 declaración trabajador, 216/296 no residentes." />
          <SimpleTable
            rows={filteredTax}
            empty="Sin modelos fiscales registrados. Diseñado para trazar: modelo, ejercicio/periodo, importe, justificante AEAT, CSV verificación."
            columns={[
              { key: 'modelo', label: 'Modelo', render: (r) => <strong>{r.modelo}</strong> },
              { key: 'ejercicio', label: 'Ejer.' },
              { key: 'periodo', label: 'Periodo' },
              { key: 'fecha_presentacion', label: 'Presentado', render: (r) => formatDate(r.fecha_presentacion) },
              { key: 'importe_a_ingresar', label: 'A ingresar', render: (r) => formatEur(r.importe_a_ingresar) },
              { key: 'estado', label: 'Estado', render: (r) => <Badge value={r.estado} /> },
              { key: 'csv_aeat', label: 'CSV AEAT', render: (r) => r.csv_aeat ? <span className="font-mono text-[10px]">{r.csv_aeat.substring(0,12)}...</span> : '—' },
              { key: 'modelo_pdf_url', label: 'PDF', render: (r) => r.modelo_pdf_url ? <a href={r.modelo_pdf_url} target="_blank" rel="noreferrer" className="text-blue-600 underline text-xs">↗</a> : '—' },
            ]}
          />
        </div>
      )}

      {tab === 'ss' && (
        <div>
          <ComplianceWarning text="Sistema de Liquidación Directa (SILTRA/CRET@) sustituye TC1/TC2 desde 2015. RNT (Relación Nominal Trabajadores) + RLC (Recibo Liquidación Cotizaciones). Plazo: 4 años (art. 21 LGSS)." />
          <SimpleTable
            rows={filteredSs}
            empty="Sin liquidaciones SS registradas."
            columns={[
              { key: 'periodo', label: 'Período', render: (r) => `${MES_NOMBRE[r.mes]} ${r.ejercicio}` },
              { key: 'cuenta_cotizacion', label: 'Cuenta cotiz.' },
              { key: 'fecha_presentacion', label: 'Presentado', render: (r) => formatDate(r.fecha_presentacion) },
              { key: 'importe_total', label: 'Importe', render: (r) => formatEur(r.importe_total) },
              { key: 'bonificaciones', label: 'Bonif.', render: (r) => formatEur(r.bonificaciones) },
              { key: 'estado', label: 'Estado', render: (r) => <Badge value={r.estado} /> },
              { key: 'rnt_url', label: 'RNT', render: (r) => r.rnt_url ? <a href={r.rnt_url} target="_blank" rel="noreferrer" className="text-blue-600 underline text-xs">↗</a> : '—' },
              { key: 'rlc_url', label: 'RLC', render: (r) => r.rlc_url ? <a href={r.rlc_url} target="_blank" rel="noreferrer" className="text-blue-600 underline text-xs">↗</a> : '—' },
            ]}
          />
        </div>
      )}

      {tab === 'finiquitos' && (
        <SimpleTable
          rows={data.finiquitos}
          empty="Sin finiquitos. Diseñado para: causa baja (clave SEPE), salario pendiente, vacaciones no disfrutadas, indemnización, IRPF retenido, certificado empresa Certific@2."
          columns={[
            { key: 'employee_id', label: 'Trabajador', render: (r) => data.employees.find(e => e.id === r.employee_id)?.nombre ?? '—' },
            { key: 'fecha_baja', label: 'F. Baja', render: (r) => formatDate(r.fecha_baja) },
            { key: 'causa_baja_descripcion', label: 'Causa' },
            { key: 'total_devengado', label: 'Devengado', render: (r) => formatEur(r.total_devengado) },
            { key: 'indemnizacion_importe', label: 'Indemniz.', render: (r) => formatEur(r.indemnizacion_importe) },
            { key: 'liquido_a_percibir', label: 'Líquido', render: (r) => <strong className="text-green-700">{formatEur(r.liquido_a_percibir)}</strong> },
            { key: 'firmado', label: 'Firmado', render: (r) => r.firmado ? '✓' : '—' },
            { key: 'documento_pdf_url', label: 'PDF', render: (r) => r.documento_pdf_url ? <a href={r.documento_pdf_url} target="_blank" rel="noreferrer" className="text-blue-600 underline text-xs">↗</a> : '—' },
          ]}
        />
      )}

      {tab === 'igualdad' && (
        <div>
          <ComplianceWarning text="OBLIGATORIO para TODAS las empresas (RD 902/2020), no solo >50 trabajadores. Media y mediana salarial desagregada por sexo y grupo profesional. Accesible para representantes y trabajadores." />
          <SimpleTable
            rows={filteredEqu}
            empty="Sin registro retributivo generado. Puede generarse automáticamente desde nóminas con la función SQL generate_equality_pay_register(año)."
            columns={[
              { key: 'periodo_anio', label: 'Año' },
              { key: 'grupo_profesional', label: 'Grupo' },
              { key: 'sexo', label: 'Sexo' },
              { key: 'num_personas', label: 'Personas' },
              { key: 'salario_base_media', label: 'Sal. base media', render: (r) => formatEur(r.salario_base_media) },
              { key: 'total_retribucion_media', label: 'Total media', render: (r) => formatEur(r.total_retribucion_media) },
              { key: 'total_retribucion_mediana', label: 'Total mediana', render: (r) => formatEur(r.total_retribucion_mediana) },
            ]}
          />
        </div>
      )}

      {tab === 'convenios' && (
        <SimpleTable
          rows={data.agreements}
          empty="Sin convenios registrados. Diseñado para almacenar convenio aplicable (sector inmobiliario / construcción según corresponda), tabla salarial vigente, categorías profesionales."
          columns={[
            { key: 'codigo_boe', label: 'Código BOE' },
            { key: 'nombre', label: 'Nombre' },
            { key: 'ambito_geografico', label: 'Ámbito' },
            { key: 'vigencia_desde', label: 'Desde', render: (r) => formatDate(r.vigencia_desde) },
            { key: 'vigencia_hasta', label: 'Hasta', render: (r) => formatDate(r.vigencia_hasta) },
            { key: 'tabla_salarial_url', label: 'Tabla salarial', render: (r) => r.tabla_salarial_url ? <a href={r.tabla_salarial_url} target="_blank" rel="noreferrer" className="text-blue-600 underline text-xs">↗</a> : '—' },
          ]}
        />
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// SECCIÓN: PRL (Ley 31/1995)
// ────────────────────────────────────────────────────────────────
function SectionPRL({ data, search, onCreate }: { data: DataBundle; search: string; onCreate: (m: ModalKey) => void }) {
  const filtered = data.prl.filter(p => {
    if (!search) return true
    const q = search.toLowerCase()
    return `${p.titulo} ${p.tipo} ${data.employees.find(e => e.id === p.employee_id)?.nombre || ''}`.toLowerCase().includes(q)
  })

  return (
    <div>
      <div className="flex items-center justify-end mb-2">
        <button onClick={() => onCreate('prl')} className="px-3 py-1.5 bg-primary text-white text-[11px] font-bold uppercase tracking-widest rounded hover:opacity-90">+ Documento PRL</button>
      </div>
      <ComplianceWarning text="Ley 31/1995. Documentación obligatoria: plan prevención, evaluación riesgos, planificación actividad, formación e información al trabajador, vigilancia de la salud, investigación accidentes. Sanciones graves en caso de accidente sin documentación." />
      <SimpleTable
        rows={filtered}
        empty="Sin documentos PRL. Diseñado para: plan prevención, evaluación riesgos, formación, vigilancia salud, accidentes, investigación accidentes, concierto SPA (servicio prevención ajeno), memoria anual, auditoría."
        columns={[
          { key: 'tipo', label: 'Tipo', render: (r) => <Badge value={r.tipo} /> },
          { key: 'titulo', label: 'Título', render: (r) => <strong>{r.titulo}</strong> },
          { key: 'employee_id', label: 'Trabajador', render: (r) => r.employee_id ? data.employees.find(e => e.id === r.employee_id)?.nombre ?? '—' : <em className="text-neutral-400">General</em> },
          { key: 'fecha_documento', label: 'Fecha', render: (r) => formatDate(r.fecha_documento) },
          { key: 'vigencia_hasta', label: 'Vigencia', render: (r) => formatDate(r.vigencia_hasta) },
          { key: 'realizado_por', label: 'Por' },
          { key: 'archivo_url', label: 'Archivo', render: (r) => r.archivo_url ? <a href={r.archivo_url} target="_blank" rel="noreferrer" className="text-blue-600 underline text-xs">↗</a> : '—' },
        ]}
      />
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// COMPONENTES AUXILIARES
// ────────────────────────────────────────────────────────────────

function SubTabs({ value, onChange, options }: { value: string; onChange: (v: never) => void; options: { v: string; label: string }[] }) {
  return (
    <div className="border-b border-neutral-100 flex gap-1 mb-4 overflow-x-auto">
      {options.map(o => (
        <button
          key={o.v}
          onClick={() => onChange(o.v as never)}
          className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest transition-colors whitespace-nowrap ${
            value === o.v ? 'bg-neutral-100 text-neutral-800 rounded-t' : 'text-neutral-400 hover:text-neutral-600'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

type Col = { key: string; label: string; render?: (r: AnyRow) => React.ReactNode }

function SimpleTable({ rows, columns, empty }: { rows: AnyRow[]; columns: Col[]; empty: string }) {
  if (rows.length === 0) {
    return (
      <div className="bg-white border border-dashed border-neutral-200 rounded p-8 text-center">
        <p className="text-sm text-neutral-500">{empty}</p>
      </div>
    )
  }
  return (
    <div className="bg-white border border-neutral-100 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-100 text-left text-[10px] font-bold uppercase tracking-widest text-neutral-400">
            {columns.map(c => <th key={c.key} className="px-3 py-2.5">{c.label}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-50">
          {rows.map((r, i) => (
            <tr key={r.id || i} className="hover:bg-neutral-50">
              {columns.map(c => (
                <td key={c.key} className="px-3 py-2.5 align-top">
                  {c.render ? c.render(r) : (r[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function KPICard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="p-3 bg-white border border-neutral-200 rounded">
      <p className="text-[10px] uppercase tracking-widest text-neutral-400 mb-1">{label}</p>
      <p className="text-lg font-bold text-neutral-800 tabular-nums">{value}</p>
      {hint && <p className="text-[10px] text-neutral-400 mt-0.5">{hint}</p>}
    </div>
  )
}

function CountCard({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className={`p-3 rounded border ${value > 0 ? 'bg-white border-neutral-200' : 'bg-neutral-50 border-neutral-100'}`}>
      <p className="text-[10px] uppercase tracking-widest text-neutral-400 mb-1">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${value > 0 ? 'text-neutral-800' : 'text-neutral-400'}`}>{value}</p>
      {hint && <p className="text-[10px] text-neutral-400 mt-0.5">{hint}</p>}
    </div>
  )
}

function Badge({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-neutral-300">—</span>
  const colorMap: Record<string, string> = {
    pendiente: 'bg-amber-100 text-amber-700',
    pagada:    'bg-green-100 text-green-700',
    pagado:    'bg-green-100 text-green-700',
    cobrada:   'bg-green-100 text-green-700',
    vigente:   'bg-green-100 text-green-700',
    activa:    'bg-green-100 text-green-700',
    aprobado:  'bg-green-100 text-green-700',
    finalizada:'bg-neutral-100 text-neutral-500',
    finalizado:'bg-neutral-100 text-neutral-500',
    rescindido:'bg-red-100 text-red-700',
    rechazado: 'bg-red-100 text-red-700',
    error:     'bg-red-100 text-red-700',
    revisado:  'bg-blue-100 text-blue-700',
    confirmado:'bg-green-100 text-green-700',
    presentado:'bg-green-100 text-green-700',
    presentada:'bg-green-100 text-green-700',
  }
  const cls = colorMap[value] ?? 'bg-neutral-100 text-neutral-600'
  return <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${cls}`}>{value}</span>
}

function ComplianceWarning({ text }: { text: string }) {
  return (
    <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800">
      <p>📜 <strong>Cumplimiento normativo:</strong> {text}</p>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// MODALES DE CREACIÓN
// ────────────────────────────────────────────────────────────────

type FieldDef = {
  name: string
  label: string
  type?: 'text' | 'number' | 'date' | 'textarea' | 'select' | 'select-int' | 'checkbox' | 'employee' | 'payroll'
  required?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default?: any
  options?: string[]
  placeholder?: string
}

function ModalShell({ title, onClose, onSubmit, saving, children, error }: { title: string; onClose: () => void; onSubmit: (e: React.FormEvent) => void; saving: boolean; children: React.ReactNode; error?: string | null }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30" onClick={onClose}>
      <form onSubmit={onSubmit} className="bg-white max-w-2xl w-full max-h-[90vh] overflow-y-auto rounded-lg shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-neutral-100 px-6 py-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">{title}</h3>
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-neutral-700 text-2xl leading-none">×</button>
        </div>
        <div className="p-6 space-y-3">
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700">{error}</div>}
          {children}
        </div>
        <div className="sticky bottom-0 bg-white border-t border-neutral-100 px-6 py-3 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-neutral-600 hover:text-neutral-900">Cancelar</button>
          <button type="submit" disabled={saving} className="px-4 py-2 bg-primary text-white text-sm font-bold rounded hover:opacity-90 disabled:opacity-50">{saving ? 'Guardando...' : 'Guardar'}</button>
        </div>
      </form>
    </div>
  )
}

function SimpleCreateModal({ title, resource, fields, employees, payrolls, onClose, onSaved }: { title: string; resource: string; fields: FieldDef[]; employees?: AnyRow[]; payrolls?: AnyRow[]; onClose: () => void; onSaved: () => void }) {
  const initial: AnyRow = {}
  fields.forEach(f => { initial[f.name] = f.default ?? (f.type === 'checkbox' ? false : '') })
  const [form, setForm] = useState<AnyRow>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true); setError(null)
    try {
      // Limpiar valores vacíos y convertir tipos
      const payload: AnyRow = {}
      fields.forEach(f => {
        const v = form[f.name]
        if (v === '' || v === null || v === undefined) {
          if (f.required) throw new Error(`Campo obligatorio: ${f.label}`)
          return
        }
        if (f.type === 'number') payload[f.name] = parseFloat(v)
        else if (f.type === 'select-int') payload[f.name] = parseInt(v, 10)  // CRÍTICO: select integer, evita CHECK constraint fail
        else if (f.type === 'checkbox') payload[f.name] = !!v
        else payload[f.name] = v
      })

      const res = await fetch(`/api/db/${resource}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Error ${res.status}`)
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell title={title} onClose={onClose} onSubmit={submit} saving={saving} error={error}>
      {fields.map(f => (
        <div key={f.name}>
          <label className="block text-xs font-semibold text-neutral-600 mb-1">
            {f.label}{f.required && <span className="text-red-500"> *</span>}
          </label>
          {f.type === 'textarea' ? (
            <textarea value={form[f.name] || ''} onChange={(e) => setForm(p => ({ ...p, [f.name]: e.target.value }))}
              className="w-full border border-neutral-200 rounded px-3 py-2 text-sm" rows={3} />
          ) : f.type === 'select' || f.type === 'select-int' ? (
            <select value={form[f.name] ?? ''} onChange={(e) => setForm(p => ({ ...p, [f.name]: e.target.value }))}
              className="w-full border border-neutral-200 rounded px-3 py-2 text-sm bg-white">
              <option value="">— Seleccionar —</option>
              {f.options?.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : f.type === 'checkbox' ? (
            <input type="checkbox" checked={!!form[f.name]} onChange={(e) => setForm(p => ({ ...p, [f.name]: e.target.checked }))} className="h-4 w-4" />
          ) : f.type === 'employee' ? (
            <select value={form[f.name] || ''} onChange={(e) => setForm(p => ({ ...p, [f.name]: e.target.value }))}
              className="w-full border border-neutral-200 rounded px-3 py-2 text-sm bg-white">
              <option value="">— Seleccionar trabajador —</option>
              {(employees || []).map(emp => (
                <option key={emp.id} value={emp.id}>{emp.nombre} ({emp.nif})</option>
              ))}
            </select>
          ) : f.type === 'payroll' ? (
            <select value={form[f.name] || ''} onChange={(e) => setForm(p => ({ ...p, [f.name]: e.target.value }))}
              className="w-full border border-neutral-200 rounded px-3 py-2 text-sm bg-white">
              <option value="">— Sin vincular —</option>
              {(payrolls || []).map(pay => (
                <option key={pay.id} value={pay.id}>
                  {pay.trabajador_nombre} · {['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][pay.periodo_mes]} {pay.periodo_anio} · {(pay.liquido_a_percibir||0).toFixed(2)}€
                </option>
              ))}
            </select>
          ) : (
            <input type={f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'}
              step={f.type === 'number' ? 'any' : undefined}
              placeholder={f.placeholder}
              value={form[f.name] ?? ''}
              onChange={(e) => setForm(p => ({ ...p, [f.name]: e.target.value }))}
              className="w-full border border-neutral-200 rounded px-3 py-2 text-sm" />
          )}
        </div>
      ))}
    </ModalShell>
  )
}

// Modal específico empleado (más campos relevantes)
function EmployeeModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  return (
    <SimpleCreateModal
      title="Nuevo trabajador"
      resource="employees"
      onClose={onClose}
      onSaved={onSaved}
      fields={[
        { name: 'nombre', label: 'Nombre completo (Apellidos, Nombre)', required: true },
        { name: 'nif', label: 'NIF/NIE', required: true },
        { name: 'num_afiliacion_ss', label: 'Núm. afiliación SS', placeholder: '32-10249132-85' },
        { name: 'empresa_actual_cif', label: 'CIF empresa', default: 'B19761915' },
        { name: 'empresa_actual_nombre', label: 'Empresa', default: 'CATHEDRAL HOUSE INVESTMENT S.L.' },
        { name: 'categoria_profesional', label: 'Categoría profesional', placeholder: 'NIVEL VIII' },
        { name: 'grupo_cotizacion', label: 'Grupo cotización (1-11)', type: 'number' },
        { name: 'epigrafe_at_ep', label: 'Epígrafe AT/EP' },
        { name: 'codigo_contrato_sepe', label: 'Código contrato SEPE', placeholder: '100, 200, 401...' },
        { name: 'jornada_porcentaje', label: 'Jornada %', type: 'number', default: 100 },
        { name: 'fecha_alta', label: 'Fecha alta SS', type: 'date' },
        { name: 'fecha_antiguedad', label: 'Fecha antigüedad reconocida', type: 'date' },
        { name: 'centro_trabajo', label: 'Centro de trabajo', placeholder: 'PS Castellana 40' },
        { name: 'iban', label: 'IBAN para pago nómina' },
        { name: 'banco', label: 'Banco' },
        { name: 'email', label: 'Email contacto' },
        { name: 'telefono', label: 'Teléfono' },
        { name: 'situacion_familiar', label: 'Situación familiar (1=soltero, 2=casado-cónyuge sin rentas, 3=otros)', type: 'select-int', options: ['1','2','3'] },
        { name: 'discapacidad_grado', label: 'Discapacidad grado', type: 'select-int', options: ['0','33','65'], default: '0' },
        { name: 'convenio_colectivo_codigo_boe', label: 'Convenio - Código BOE' },
        { name: 'convenio_colectivo_nombre', label: 'Convenio colectivo aplicable' },
        { name: 'nivel_salarial_convenio', label: 'Nivel salarial convenio' },
        { name: 'tipo_contrato', label: 'Tipo contrato', type: 'select', options: ['indefinido','temporal','obra','practicas','formacion','relevo','fijo_discontinuo'] },
        { name: 'jornada', label: 'Jornada', type: 'select', options: ['completa','parcial'] },
        { name: 'horas_semanales', label: 'Horas semanales', type: 'number' },
        { name: 'departamento', label: 'Departamento' },
        { name: 'direccion', label: 'Dirección postal' },
        { name: 'fecha_baja', label: 'Fecha baja (vacío si activo)', type: 'date' },
        // Mod 145 — flags fiscales que SÍ existen en employees
        { name: 'nif_conyuge', label: 'NIF cónyuge' },
        { name: 'conyuge_rentas_superiores_1500', label: 'Cónyuge rentas > 1.500€', type: 'checkbox' },
        { name: 'discapacidad_movilidad_reducida', label: 'Discapacidad con movilidad reducida', type: 'checkbox' },
        { name: 'movilidad_geografica', label: 'Movilidad geográfica', type: 'checkbox' },
        { name: 'prolongacion_actividad', label: 'Prolongación actividad (>65)', type: 'checkbox' },
        { name: 'prestamo_vivienda_anterior_2013', label: 'Préstamo vivienda anterior 2013', type: 'checkbox' },
        { name: 'pension_compensatoria_conyuge', label: 'Pensión compensatoria cónyuge (€)', type: 'number' },
        { name: 'anualidades_alimentos_hijos', label: 'Anualidades alimentos hijos (€)', type: 'number' },
        { name: 'residencia_ceuta_melilla', label: 'Residencia Ceuta/Melilla', type: 'checkbox' },
        { name: 'fecha_firma_modelo_145', label: 'Fecha firma Mod. 145', type: 'date' },
        { name: 'ccc_asignado', label: 'Cuenta cotización asignada (CCC)' },
        // PRL
        { name: 'apto_vigilancia_salud_fecha', label: 'Vigilancia salud — última fecha', type: 'date' },
        { name: 'apto_vigilancia_salud_proxima', label: 'Vigilancia salud — próxima', type: 'date' },
        { name: 'formacion_prl_fecha', label: 'Formación PRL — fecha', type: 'date' },
        { name: 'formacion_prl_horas', label: 'Formación PRL — horas', type: 'number' },
        { name: 'formacion_prl_archivo_url', label: 'Formación PRL — URL certificado (Drive)' },
        { name: 'clausula_informativa_firmada_fecha', label: 'Cláusula GDPR — fecha firma', type: 'date' },
      ]}
    />
  )
}

function ContractModal({ employees, onClose, onSaved }: { employees: AnyRow[]; onClose: () => void; onSaved: () => void }) {
  return (
    <SimpleCreateModal
      title="Nuevo contrato"
      resource="employee-contracts"
      employees={employees}
      onClose={onClose}
      onSaved={onSaved}
      fields={[
        { name: 'employee_id', label: 'Trabajador', type: 'employee', required: true },
        { name: 'tipo_contrato', label: 'Tipo de contrato', type: 'select', required: true, options: ['indefinido','temporal','obra','practicas','formacion','relevo','fijo_discontinuo'] },
        { name: 'codigo_clave_sepe', label: 'Código clave SEPE', placeholder: '100, 200, 401...' },
        { name: 'modalidad', label: 'Modalidad', type: 'select', options: ['tiempo completo','parcial','fijo discontinuo'] },
        { name: 'jornada_horas_semanales', label: 'Horas semanales', type: 'number' },
        { name: 'jornada_porcentaje', label: 'Jornada %', type: 'number', default: 100 },
        { name: 'fecha_inicio', label: 'Fecha inicio', type: 'date', required: true },
        { name: 'fecha_fin', label: 'Fecha fin (vacío si indefinido)', type: 'date' },
        { name: 'fecha_fin_periodo_prueba', label: 'Fin periodo prueba', type: 'date' },
        { name: 'salario_bruto_anual', label: 'Salario bruto anual', type: 'number' },
        { name: 'salario_mensual', label: 'Salario mensual', type: 'number' },
        { name: 'num_pagas', label: 'Nº pagas', type: 'number', default: 14 },
        { name: 'paga_extra_prorrateada', label: 'Paga extra prorrateada', type: 'checkbox' },
        { name: 'categoria_profesional', label: 'Categoría profesional' },
        { name: 'grupo_cotizacion', label: 'Grupo cotización', type: 'number' },
        { name: 'convenio_aplicable', label: 'Convenio aplicable' },
        { name: 'centro_trabajo', label: 'Centro trabajo' },
        { name: 'funciones_descripcion', label: 'Funciones', type: 'textarea' },
        { name: 'fecha_comunicacion_sepe', label: 'Fecha comunicación SEPE', type: 'date' },
        { name: 'numero_comunicacion_sepe', label: 'Nº comunicación SEPE' },
        { name: 'fecha_alta_ss', label: 'Fecha alta SS', type: 'date' },
        { name: 'pdf_contrato_url', label: 'URL PDF contrato firmado (Drive)' },
        { name: 'estado', label: 'Estado', type: 'select', options: ['vigente','prorrogado','finalizado','rescindido','novado'], default: 'vigente' },
        { name: 'notes', label: 'Notas', type: 'textarea' },
      ]}
    />
  )
}

function TimeRecordModal({ employees, onClose, onSaved }: { employees: AnyRow[]; onClose: () => void; onSaved: () => void }) {
  const today = new Date().toISOString().slice(0, 10)
  return (
    <SimpleCreateModal
      title="Registrar jornada"
      resource="time-records"
      employees={employees}
      onClose={onClose}
      onSaved={onSaved}
      fields={[
        { name: 'employee_id', label: 'Trabajador', type: 'employee', required: true },
        { name: 'fecha', label: 'Fecha', type: 'date', required: true, default: today },
        { name: 'hora_entrada', label: 'Hora entrada (HH:MM)', placeholder: '09:00' },
        { name: 'hora_salida', label: 'Hora salida (HH:MM)', placeholder: '18:00' },
        { name: 'horas_ordinarias', label: 'Horas ordinarias', type: 'number' },
        { name: 'horas_extra', label: 'Horas extra', type: 'number', default: 0 },
        { name: 'horas_nocturnas', label: 'Horas nocturnas', type: 'number', default: 0 },
        { name: 'fuente', label: 'Fuente', type: 'select', options: ['manual','app_movil','biometrico','tarjeta','importado'], default: 'manual' },
        { name: 'observaciones', label: 'Observaciones', type: 'textarea' },
      ]}
    />
  )
}
