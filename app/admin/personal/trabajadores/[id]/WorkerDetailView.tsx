'use client'

import Link from 'next/link'
import { useState } from 'react'

/* ───────── Types ───────── */

interface Employee {
  id: string
  nombre: string | null
  nif: string | null
  email: string | null
  telefono: string | null
  direccion: string | null
  iban: string | null
  banco: string | null
  num_afiliacion_ss: string | null
  empresa_actual_nombre: string | null
  empresa_actual_cif: string | null
  categoria_profesional: string | null
  grupo_cotizacion: number | null
  centro_trabajo: string | null
  departamento: string | null
  tipo_contrato: string | null
  jornada: string | null
  horas_semanales: number | null
  jornada_porcentaje: number | null
  fecha_alta: string | null
  fecha_antiguedad: string | null
  fecha_baja: string | null
  notes: string | null
  convenio_colectivo_nombre: string | null
  nivel_salarial_convenio: string | null
  apto_vigilancia_salud_fecha: string | null
  apto_vigilancia_salud_proxima: string | null
  formacion_prl_fecha: string | null
  formacion_prl_horas: number | null
  fecha_firma_modelo_145: string | null
  clausula_informativa_firmada_fecha: string | null
}

interface ProjectRef {
  id?: string
  code: string
  name: string | null
  status?: string
}

interface TimeRecord {
  id: string
  fecha: string
  project_id: string | null
  hora_entrada: string | null
  hora_salida: string | null
  horas_ordinarias: number | null
  horas_extra: number | null
  horas_nocturnas: number | null
  horas_extra_modo: string | null
  observaciones: string | null
  fuente: string | null
  worker_signed_at: string | null
  device_geo_lat: number | null
  device_geo_lng: number | null
  device_geo_accuracy_m: number | null
  geofence_status: string | null
  geofence_distance_m: number | null
  entrada_geo_lat: number | null
  entrada_geo_lng: number | null
  entrada_geo_accuracy_m: number | null
  entrada_geofence_status: string | null
  salida_geo_lat: number | null
  salida_geo_lng: number | null
  salida_geo_accuracy_m: number | null
  salida_geofence_status: string | null
  project: ProjectRef | ProjectRef[] | null
}

interface Redemption {
  id: string
  fecha: string
  horas_descontadas: number
  motivo: string | null
  created_at: string
  created_by_email: string | null
}

interface Absence {
  id: string
  tipo: string
  motivo_detalle: string | null
  fecha_inicio: string
  fecha_fin: string
  dias_total: number
  horas_total: number | null
  solicitado_at: string
  solicitud_fuente: string
  status: string
  decided_at: string | null
  decided_by_email: string | null
  decision_notes: string | null
  cancellation_requested_at?: string | null
  cancellation_requested_motivo?: string | null
  cancellation_decision?: string | null
}

interface Attachment {
  id: string
  storage_path: string
  storage_bucket: string
  mime_type: string | null
  original_filename: string | null
  doc_type: string
  status: string
  worker_notas: string | null
  created_at: string
  reviewed_at: string | null
  reviewer_action: string | null
  preview_url: string | null
  project: ProjectRef | ProjectRef[] | null
}

interface Expense {
  id: string
  fecha: string
  tipo: string
  medio_pago: string
  project_id: string | null
  importe: number | null
  km_recorridos: number | null
  km_origen: string | null
  km_destino: string | null
  material_descripcion: string | null
  material_cantidad: number | null
  observaciones: string | null
  status: string
  reviewed_at: string | null
  created_at: string
  project: ProjectRef | ProjectRef[] | null
}

interface PortalAccess {
  id: string
  token: string
  expires_at: string | null
  revoked_at: string | null
  revoked_reason: string | null
  last_used_at: string | null
  last_used_ip: string | null
  uses_count: number
  pin_set_at: string | null
  pin_locked_until: string | null
  pin_attempts: number
  created_at: string
}

interface OvertimeBalance {
  horas_acumuladas?: number
  horas_pendientes?: number
  horas_canjeadas?: number
  horas_disponibles?: number
  [key: string]: unknown
}

interface VacationSummary {
  dias_anuales?: number
  dias_disfrutados?: number
  dias_planificados?: number
  dias_disponibles?: number
  [key: string]: unknown
}

interface Props {
  employee: Employee
  timeRecords: TimeRecord[]
  overtimeBalance: OvertimeBalance | null
  redemptions: Redemption[]
  absences: Absence[]
  attachments: Attachment[]
  expenses: Expense[]
  portalAccess: PortalAccess[]
  projects: ProjectRef[]
  vacationSummary: VacationSummary | null
  desde: string
  hasta: string
}

/* ───────── Helpers ───────── */

function singleRef<T>(p: T | T[] | null | undefined): T | null {
  if (!p) return null
  return Array.isArray(p) ? (p[0] ?? null) : p
}

function fmtDate(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s.includes('T') ? s : s + 'T00:00:00')
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtDateTime(s: string | null): string {
  if (!s) return '—'
  return new Date(s).toLocaleString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtMoney(v: number | null | undefined): string {
  if (v == null) return '—'
  return v.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 })
}

const ABSENCE_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Pendiente', cls: 'bg-amber-100 text-amber-800' },
  approved: { label: 'Aprobada', cls: 'bg-emerald-100 text-emerald-800' },
  rejected: { label: 'Rechazada', cls: 'bg-red-100 text-red-800' },
  cancelled: { label: 'Cancelada', cls: 'bg-stone-100 text-stone-600' },
}

const ATTACHMENT_STATUS: Record<string, { label: string; cls: string }> = {
  uploaded: { label: 'Subido', cls: 'bg-blue-100 text-blue-800' },
  processing: { label: 'Procesando OCR', cls: 'bg-blue-100 text-blue-800' },
  extracted: { label: 'Extraído IA', cls: 'bg-amber-100 text-amber-800' },
  confirmed: { label: 'Confirmado', cls: 'bg-emerald-100 text-emerald-800' },
  ignored: { label: 'Ignorado', cls: 'bg-stone-100 text-stone-600' },
  error: { label: 'Error', cls: 'bg-red-100 text-red-800' },
}

const EXPENSE_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Pendiente', cls: 'bg-amber-100 text-amber-800' },
  confirmed: { label: 'Confirmado', cls: 'bg-emerald-100 text-emerald-800' },
  ignored: { label: 'Ignorado', cls: 'bg-stone-100 text-stone-600' },
  reimbursed: { label: 'Reembolsado', cls: 'bg-blue-100 text-blue-800' },
}

const GEOFENCE_BADGE: Record<string, { label: string; cls: string }> = {
  within: { label: 'En el radio', cls: 'bg-emerald-100 text-emerald-800' },
  outside: { label: 'Fuera del radio', cls: 'bg-red-100 text-red-800' },
  low_accuracy: { label: 'GPS impreciso', cls: 'bg-amber-100 text-amber-800' },
  no_data: { label: 'Sin geofence', cls: 'bg-stone-100 text-stone-600' },
}

function geoBadge(status: string | null) {
  if (!status) return null
  const cfg = GEOFENCE_BADGE[status] ?? { label: status, cls: 'bg-stone-100 text-stone-600' }
  return <span className={`rounded px-1.5 py-0.5 text-[10px] ${cfg.cls}`}>{cfg.label}</span>
}

function mapsLink(lat: number | null, lng: number | null) {
  if (lat == null || lng == null) return null
  return `https://www.google.com/maps?q=${lat},${lng}`
}

type TabKey = 'datos' | 'partes' | 'banco' | 'ausencias' | 'tickets' | 'gastos' | 'portal'

/* ───────── Component ───────── */

export default function WorkerDetailView({
  employee,
  timeRecords,
  overtimeBalance,
  redemptions,
  absences,
  attachments,
  expenses,
  portalAccess,
  projects,
  vacationSummary,
  desde,
  hasta,
}: Props) {
  const [tab, setTab] = useState<TabKey>('datos')

  const enBaja = !!(employee.fecha_baja && employee.fecha_baja <= new Date().toISOString().slice(0, 10))

  const todayStr = new Date().toISOString().slice(0, 10)
  const projectsActive = projects.filter((p) => p.status !== 'completado' && p.status !== 'finalizado')

  const counts = {
    partes: timeRecords.length,
    ausenciasPend: absences.filter((a) => a.status === 'pending').length,
    ausenciasCancelReq: absences.filter((a) => a.status === 'approved' && a.cancellation_requested_at && !a.cancellation_decision).length,
    ticketsPend: attachments.filter((a) => ['uploaded', 'processing', 'extracted'].includes(a.status)).length,
    gastosPend: expenses.filter((e) => e.status === 'pending').length,
  }

  const partesAnomalias = timeRecords.filter(
    (r) =>
      r.entrada_geofence_status === 'outside' ||
      r.entrada_geofence_status === 'low_accuracy' ||
      r.salida_geofence_status === 'outside' ||
      r.salida_geofence_status === 'low_accuracy' ||
      r.geofence_status === 'outside' ||
      r.geofence_status === 'low_accuracy',
  ).length

  const portalActivo = portalAccess.find((p) => !p.revoked_at)

  const TABS: Array<{ key: TabKey; label: string; badge?: number; muted?: boolean }> = [
    { key: 'datos', label: 'Datos' },
    { key: 'partes', label: 'Partes', badge: partesAnomalias, muted: partesAnomalias === 0 },
    { key: 'banco', label: 'Banco horas' },
    { key: 'ausencias', label: 'Ausencias', badge: counts.ausenciasPend + counts.ausenciasCancelReq, muted: counts.ausenciasPend + counts.ausenciasCancelReq === 0 },
    { key: 'tickets', label: 'Tickets', badge: counts.ticketsPend, muted: counts.ticketsPend === 0 },
    { key: 'gastos', label: 'Gastos', badge: counts.gastosPend, muted: counts.gastosPend === 0 },
    { key: 'portal', label: 'Portal/PIN' },
  ]

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 text-sm text-stone-500">
          <Link href="/admin/personal" className="hover:text-stone-900">Personal</Link>
          <span>›</span>
          <Link href="/admin/personal/trabajadores" className="hover:text-stone-900">Trabajadores</Link>
          <span>›</span>
          <span className="text-stone-900">{(employee.nombre ?? '').trim() || '—'}</span>
        </div>
        <div className="mt-2 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-light tracking-tight text-stone-900">
              {(employee.nombre ?? '').trim() || '—'}
              {enBaja && (
                <span className="ml-3 inline-block rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 align-middle">
                  En baja desde {fmtDate(employee.fecha_baja)}
                </span>
              )}
            </h1>
            <p className="text-sm text-stone-500 mt-1">
              {employee.nif ? <span className="font-mono">{employee.nif}</span> : 'sin NIF'} ·{' '}
              {employee.categoria_profesional ?? 'sin categoría'} ·{' '}
              {employee.email ?? 'sin email'}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-stone-200 mb-6 overflow-x-auto">
        <nav className="flex gap-1 -mb-px min-w-max">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-xs font-bold uppercase tracking-widest border-b-2 transition-colors whitespace-nowrap ${
                tab === t.key
                  ? 'border-stone-900 text-stone-900'
                  : 'border-transparent text-stone-500 hover:text-stone-800'
              }`}
            >
              {t.label}
              {t.badge != null && t.badge > 0 && (
                <span className={`ml-2 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[9px] font-bold ${t.muted ? 'bg-stone-200 text-stone-600' : 'bg-red-500 text-white'}`}>
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab contents */}
      <div className="bg-white rounded-lg border border-stone-200 p-5">
        {tab === 'datos' && <TabDatos employee={employee} />}

        {tab === 'partes' && (
          <TabPartes records={timeRecords} desde={desde} hasta={hasta} />
        )}

        {tab === 'banco' && (
          <TabBancoHoras
            balance={overtimeBalance}
            redemptions={redemptions}
            vacationSummary={vacationSummary}
          />
        )}

        {tab === 'ausencias' && <TabAusencias absences={absences} />}

        {tab === 'tickets' && <TabTickets attachments={attachments} />}

        {tab === 'gastos' && <TabGastos expenses={expenses} projects={projectsActive} />}

        {tab === 'portal' && (
          <TabPortal employee={employee} portalAccess={portalAccess} portalActivo={portalActivo} todayStr={todayStr} />
        )}
      </div>
    </div>
  )
}

/* ───────── Tab: Datos ───────── */

function Field({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-stone-400">{label}</div>
      <div className={`mt-0.5 text-sm text-stone-900 ${mono ? 'font-mono text-xs' : ''}`}>{value || '—'}</div>
    </div>
  )
}

function TabDatos({ employee }: { employee: Employee }) {
  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-xs font-bold uppercase tracking-widest text-stone-500 mb-3">Personal</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Field label="Nombre" value={(employee.nombre ?? '').trim()} />
          <Field label="NIF" value={employee.nif} mono />
          <Field label="Email" value={employee.email} />
          <Field label="Teléfono" value={employee.telefono} />
          <Field label="Dirección" value={employee.direccion} />
          <Field label="Núm. Seguridad Social" value={employee.num_afiliacion_ss} mono />
        </div>
      </section>

      <section>
        <h3 className="text-xs font-bold uppercase tracking-widest text-stone-500 mb-3">Laboral</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Field label="Empresa actual" value={employee.empresa_actual_nombre} />
          <Field label="CIF empresa" value={employee.empresa_actual_cif} mono />
          <Field label="Categoría profesional" value={employee.categoria_profesional} />
          <Field label="Grupo cotización" value={employee.grupo_cotizacion} />
          <Field label="Centro trabajo" value={employee.centro_trabajo} />
          <Field label="Departamento" value={employee.departamento} />
          <Field label="Tipo contrato" value={employee.tipo_contrato} />
          <Field label="Jornada" value={employee.jornada} />
          <Field label="Horas semanales" value={employee.horas_semanales} />
          <Field label="% Jornada" value={employee.jornada_porcentaje} />
          <Field label="Fecha alta" value={fmtDate(employee.fecha_alta)} />
          <Field label="Fecha antigüedad" value={fmtDate(employee.fecha_antiguedad)} />
          {employee.fecha_baja && <Field label="Fecha baja" value={fmtDate(employee.fecha_baja)} />}
        </div>
      </section>

      <section>
        <h3 className="text-xs font-bold uppercase tracking-widest text-stone-500 mb-3">Pago</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Field label="IBAN" value={employee.iban} mono />
          <Field label="Banco" value={employee.banco} />
        </div>
      </section>

      <section>
        <h3 className="text-xs font-bold uppercase tracking-widest text-stone-500 mb-3">Convenio y cumplimiento</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Field label="Convenio colectivo" value={employee.convenio_colectivo_nombre} />
          <Field label="Nivel salarial convenio" value={employee.nivel_salarial_convenio} />
          <Field label="Modelo 145 firmado" value={fmtDate(employee.fecha_firma_modelo_145)} />
          <Field label="Cláusula informativa firmada" value={fmtDate(employee.clausula_informativa_firmada_fecha)} />
          <Field label="Apto vigilancia salud" value={fmtDate(employee.apto_vigilancia_salud_fecha)} />
          <Field label="Próxima revisión salud" value={fmtDate(employee.apto_vigilancia_salud_proxima)} />
          <Field label="Formación PRL" value={fmtDate(employee.formacion_prl_fecha)} />
          <Field label="Horas formación PRL" value={employee.formacion_prl_horas} />
        </div>
      </section>

      {employee.notes && (
        <section>
          <h3 className="text-xs font-bold uppercase tracking-widest text-stone-500 mb-2">Notas</h3>
          <p className="text-sm text-stone-700 whitespace-pre-wrap">{employee.notes}</p>
        </section>
      )}
    </div>
  )
}

/* ───────── Tab: Partes (con ubicación) ───────── */

function TabPartes({ records, desde, hasta }: { records: TimeRecord[]; desde: string; hasta: string }) {
  if (records.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-stone-500">
        Sin partes en el rango {fmtDate(desde)} → {fmtDate(hasta)}.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-stone-500">
        <span>{records.length} parte{records.length === 1 ? '' : 's'} entre {fmtDate(desde)} y {fmtDate(hasta)}</span>
        <Link href="/admin/personal/dietario" className="hover:text-stone-900">Ir al dietario completo →</Link>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-[10px] uppercase tracking-widest text-stone-500">
            <tr>
              <th className="px-3 py-2.5">Fecha</th>
              <th className="px-3 py-2.5">Proyecto</th>
              <th className="px-3 py-2.5">Horario</th>
              <th className="px-3 py-2.5 text-right">Ordinarias</th>
              <th className="px-3 py-2.5 text-right">Extras</th>
              <th className="px-3 py-2.5">Ubicación entrada</th>
              <th className="px-3 py-2.5">Ubicación salida</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {records.map((r) => {
              const proj = singleRef(r.project)
              const entradaMap = mapsLink(r.entrada_geo_lat ?? r.device_geo_lat, r.entrada_geo_lng ?? r.device_geo_lng)
              const salidaMap = mapsLink(r.salida_geo_lat, r.salida_geo_lng)
              const entradaStatus = r.entrada_geofence_status ?? r.geofence_status
              return (
                <tr key={r.id}>
                  <td className="px-3 py-2.5 whitespace-nowrap">{fmtDate(r.fecha)}</td>
                  <td className="px-3 py-2.5">
                    {proj ? (
                      <Link href={`/admin/proyectos/${proj.code}/mano-de-obra`} className="text-xs hover:underline">
                        <span className="font-mono">{proj.code}</span>
                        {proj.name && <span className="block text-[10px] text-stone-500 truncate max-w-[180px]">{proj.name}</span>}
                      </Link>
                    ) : (
                      <span className="text-xs text-stone-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs tabular-nums">
                    {r.hora_entrada ? r.hora_entrada.slice(0, 5) : '—'}
                    {' → '}
                    {r.hora_salida ? r.hora_salida.slice(0, 5) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.horas_ordinarias ?? '—'}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {r.horas_extra ? (
                      <span>
                        {r.horas_extra}
                        {r.horas_extra_modo && (
                          <span className="ml-1 text-[9px] uppercase text-stone-400">
                            {r.horas_extra_modo === 'pagar' ? '💶' : '⏰'}
                          </span>
                        )}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-col gap-1">
                      {geoBadge(entradaStatus)}
                      {entradaMap ? (
                        <a href={entradaMap} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-600 hover:underline">
                          {(r.entrada_geo_accuracy_m ?? r.device_geo_accuracy_m) != null && (
                            <span>±{r.entrada_geo_accuracy_m ?? r.device_geo_accuracy_m}m · </span>
                          )}
                          Ver mapa →
                        </a>
                      ) : (
                        <span className="text-[10px] text-stone-400">Sin GPS</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-col gap-1">
                      {geoBadge(r.salida_geofence_status)}
                      {salidaMap ? (
                        <a href={salidaMap} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-600 hover:underline">
                          {r.salida_geo_accuracy_m != null && <span>±{r.salida_geo_accuracy_m}m · </span>}
                          Ver mapa →
                        </a>
                      ) : (
                        <span className="text-[10px] text-stone-400">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ───────── Tab: Banco horas ───────── */

function TabBancoHoras({
  balance, redemptions, vacationSummary,
}: {
  balance: OvertimeBalance | null
  redemptions: Redemption[]
  vacationSummary: VacationSummary | null
}) {
  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-xs font-bold uppercase tracking-widest text-stone-500 mb-3">Banco de horas extras</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Horas acumuladas" value={balance?.horas_acumuladas ?? 0} />
          <Field label="Horas canjeadas" value={balance?.horas_canjeadas ?? 0} />
          <Field label="Disponibles" value={balance?.horas_disponibles ?? balance?.horas_pendientes ?? 0} />
        </div>
      </section>

      {vacationSummary && (
        <section>
          <h3 className="text-xs font-bold uppercase tracking-widest text-stone-500 mb-3">
            Vacaciones {new Date().getFullYear()}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Field label="Días anuales" value={vacationSummary.dias_anuales ?? 22} />
            <Field label="Disfrutados" value={vacationSummary.dias_disfrutados ?? 0} />
            <Field label="Planificados" value={vacationSummary.dias_planificados ?? 0} />
            <Field label="Disponibles" value={vacationSummary.dias_disponibles ?? 22} />
          </div>
        </section>
      )}

      <section>
        <h3 className="text-xs font-bold uppercase tracking-widest text-stone-500 mb-3">Canjes realizados</h3>
        {redemptions.length === 0 ? (
          <p className="text-sm text-stone-500">Sin canjes registrados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-stone-200 bg-stone-50 text-left text-[10px] uppercase tracking-widest text-stone-500">
                <tr>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2 text-right">Horas</th>
                  <th className="px-3 py-2">Motivo</th>
                  <th className="px-3 py-2">Aprobó</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {redemptions.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2">{fmtDate(r.fecha)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.horas_descontadas}</td>
                    <td className="px-3 py-2 text-xs text-stone-600">{r.motivo ?? '—'}</td>
                    <td className="px-3 py-2 text-xs text-stone-400">{r.created_by_email ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

/* ───────── Tab: Ausencias ───────── */

function TabAusencias({ absences }: { absences: Absence[] }) {
  if (absences.length === 0) {
    return <p className="text-sm text-stone-500 py-4">Sin ausencias registradas.</p>
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-stone-500">
        <span>{absences.length} ausencia{absences.length === 1 ? '' : 's'}</span>
        <Link href="/admin/personal/ausencias" className="hover:text-stone-900">Ir a ausencias completas →</Link>
      </div>
      <ul className="space-y-2">
        {absences.map((a) => {
          const status = ABSENCE_STATUS[a.status] ?? ABSENCE_STATUS.pending
          const cancelReq = a.status === 'approved' && a.cancellation_requested_at && !a.cancellation_decision
          return (
            <li key={a.id} className="rounded border border-stone-200 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium">{a.tipo}</span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] ${status.cls}`}>{status.label}</span>
                {cancelReq && (
                  <span className="rounded bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[10px] text-amber-800">
                    ⏳ Pide cancelar
                  </span>
                )}
              </div>
              <div className="mt-1 text-stone-700">
                Del <span className="font-mono text-xs">{a.fecha_inicio}</span> al{' '}
                <span className="font-mono text-xs">{a.fecha_fin}</span>
                <span className="ml-2 text-xs text-stone-500">({a.dias_total} día{a.dias_total > 1 ? 's' : ''})</span>
              </div>
              {a.motivo_detalle && <div className="mt-1 text-xs text-stone-500">{a.motivo_detalle}</div>}
              {a.decision_notes && (
                <div className="mt-1 text-xs text-stone-600">
                  <span className="text-stone-400">Nota admin:</span> {a.decision_notes}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/* ───────── Tab: Tickets ───────── */

function TabTickets({ attachments }: { attachments: Attachment[] }) {
  if (attachments.length === 0) {
    return <p className="text-sm text-stone-500 py-4">No ha subido ningún ticket/albarán.</p>
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-stone-500">
        <span>{attachments.length} documento{attachments.length === 1 ? '' : 's'}</span>
        <Link href="/admin/personal/tickets-trabajador" className="hover:text-stone-900">Ir a tickets completos →</Link>
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {attachments.map((a) => {
          const status = ATTACHMENT_STATUS[a.status] ?? { label: a.status, cls: 'bg-stone-100' }
          const proj = singleRef(a.project)
          const isImage = a.mime_type?.startsWith('image/')
          return (
            <li key={a.id} className="rounded border border-stone-200 overflow-hidden bg-white">
              {a.preview_url && isImage ? (
                <a href={a.preview_url} target="_blank" rel="noopener noreferrer" className="block bg-stone-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.preview_url} alt={a.doc_type} className="w-full h-32 object-contain" />
                </a>
              ) : (
                <div className="h-32 bg-stone-50 flex items-center justify-center text-3xl text-stone-300">📄</div>
              )}
              <div className="p-2.5 text-xs">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-medium text-stone-900 uppercase">{a.doc_type}</span>
                  <span className={`rounded px-1 py-0.5 text-[9px] ${status.cls}`}>{status.label}</span>
                </div>
                <div className="text-[10px] text-stone-500">{fmtDate(a.created_at)}</div>
                {proj && <div className="text-[10px] text-stone-400 mt-0.5">{proj.code}</div>}
                {a.worker_notas && <div className="mt-1 text-[10px] text-stone-600 line-clamp-2">{a.worker_notas}</div>}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/* ───────── Tab: Gastos ───────── */

function TabGastos({ expenses, projects }: { expenses: Expense[]; projects: ProjectRef[] }) {
  void projects // referencia para futuras acciones inline
  if (expenses.length === 0) {
    return <p className="text-sm text-stone-500 py-4">Sin gastos registrados.</p>
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-stone-500">
        <span>{expenses.length} gasto{expenses.length === 1 ? '' : 's'}</span>
        <Link href="/admin/personal/gastos-trabajador" className="hover:text-stone-900">Ir a gastos completos →</Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-[10px] uppercase tracking-widest text-stone-500">
            <tr>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2">Proyecto</th>
              <th className="px-3 py-2 text-right">Importe / km</th>
              <th className="px-3 py-2">Pago</th>
              <th className="px-3 py-2">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {expenses.map((e) => {
              const proj = singleRef(e.project)
              const status = EXPENSE_STATUS[e.status] ?? { label: e.status, cls: 'bg-stone-100' }
              return (
                <tr key={e.id}>
                  <td className="px-3 py-2">{fmtDate(e.fecha)}</td>
                  <td className="px-3 py-2 text-xs">{e.tipo}</td>
                  <td className="px-3 py-2 text-xs">{proj ? proj.code : '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-xs">
                    {e.tipo === 'kilometraje' && e.km_recorridos
                      ? `${e.km_recorridos} km`
                      : fmtMoney(e.importe)}
                  </td>
                  <td className="px-3 py-2 text-xs text-stone-500">{e.medio_pago}</td>
                  <td className="px-3 py-2"><span className={`rounded px-1.5 py-0.5 text-[10px] ${status.cls}`}>{status.label}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ───────── Tab: Portal/PIN ───────── */

function TabPortal({
  employee, portalAccess, portalActivo, todayStr,
}: {
  employee: Employee
  portalAccess: PortalAccess[]
  portalActivo: PortalAccess | undefined
  todayStr: string
}) {
  void todayStr
  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-xs font-bold uppercase tracking-widest text-stone-500 mb-3">Acceso portal trabajador</h3>
        {portalActivo ? (
          <div className="space-y-2 text-sm">
            <Field label="Estado" value={<span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">Activo</span>} />
            <Field label="Último uso" value={fmtDateTime(portalActivo.last_used_at)} />
            <Field label="IP último uso" value={portalActivo.last_used_ip} mono />
            <Field label="Usos totales" value={portalActivo.uses_count} />
            <Field label="Expira" value={fmtDate(portalActivo.expires_at)} />
            <Field
              label="PIN"
              value={
                portalActivo.pin_set_at ? (
                  <span>Cambiado el {fmtDateTime(portalActivo.pin_set_at)}</span>
                ) : (
                  <span className="text-amber-700">⚠ Aún es el por defecto (0000)</span>
                )
              }
            />
            {portalActivo.pin_locked_until && portalActivo.pin_locked_until > new Date().toISOString() && (
              <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                🔒 PIN bloqueado por intentos hasta {fmtDateTime(portalActivo.pin_locked_until)}.
              </div>
            )}
          </div>
        ) : (
          <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Este trabajador no tiene token de portal activo.
          </div>
        )}
      </section>

      <Link
        href={`/admin/personal/trabajadores/${employee.id}/portal`}
        className="inline-flex items-center gap-2 rounded bg-stone-900 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white hover:bg-stone-800"
      >
        Gestionar token + PIN →
      </Link>

      {portalAccess.length > 1 && (
        <section>
          <h3 className="text-xs font-bold uppercase tracking-widest text-stone-500 mb-3">Historial de tokens</h3>
          <ul className="text-xs text-stone-600 space-y-1">
            {portalAccess.map((p) => (
              <li key={p.id} className="flex items-center gap-2">
                <span className={p.revoked_at ? 'line-through text-stone-400' : ''}>
                  Creado {fmtDateTime(p.created_at)}
                </span>
                {p.revoked_at && <span className="text-stone-400">· revocado {fmtDateTime(p.revoked_at)}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
