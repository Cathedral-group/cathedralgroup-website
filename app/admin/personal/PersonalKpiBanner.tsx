'use client'

/**
 * B9 — Banner KPIs + alertas para /admin/personal.
 *
 * Se renderiza arriba de PersonalView para que David vea de un vistazo:
 * - Trabajadores activos
 * - Próxima nómina (mes corriente con cuántas faltan)
 * - Contratos por vencer en 30d
 * - Vigilancia salud caducada o caducando
 * - Formación PRL pendiente (>12 meses sin formación)
 *
 * Click en cualquier alerta → navega a sección correspondiente con drill.
 */

import Link from 'next/link'

const MES_NOMBRE = [
  '',
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

interface ExpiringContract {
  id: string
  employee_id: string | null
  fecha_fin: string
  tipo_contrato: string | null
  days_until: number
}

interface VigilanciaItem {
  nif: string
  nombre: string
  proxima: string
  days_until?: number
  days_overdue?: number
}

interface PrlPendienteItem {
  nif: string
  nombre: string
  ultima_formacion: string | null
}

export interface DashboardKpis {
  activeCount: number
  payrollsThisMonth: number
  employeesNeedingPayroll: number
  expiringContracts: ExpiringContract[]
  vigilanciaCaducando: VigilanciaItem[]
  vigilanciaCaducada: VigilanciaItem[]
  prlPendiente: PrlPendienteItem[]
  lastPayrollByEmployee: Record<string, { mes: number; anio: number; fecha: string }>
  currentMonth: number
  currentYear: number
}

export default function PersonalKpiBanner({ kpis }: { kpis: DashboardKpis }) {
  const totalAlerts =
    kpis.expiringContracts.length +
    kpis.vigilanciaCaducada.length +
    kpis.vigilanciaCaducando.length +
    kpis.prlPendiente.length

  return (
    <div className="mb-6">
      {/* 5 KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <Kpi
          label="Trabajadores activos"
          value={String(kpis.activeCount)}
          color="text-neutral-800"
        />
        <Kpi
          label={`Nóminas ${MES_NOMBRE[kpis.currentMonth]}`}
          value={`${kpis.payrollsThisMonth}/${kpis.activeCount}`}
          color={
            kpis.employeesNeedingPayroll > 0 ? 'text-amber-700' : 'text-green-700'
          }
        />
        <Kpi
          label="Contratos vencen 30d"
          value={String(kpis.expiringContracts.length)}
          color={
            kpis.expiringContracts.length > 0 ? 'text-red-700' : 'text-neutral-800'
          }
        />
        <Kpi
          label="Vigilancia salud"
          value={String(
            kpis.vigilanciaCaducada.length + kpis.vigilanciaCaducando.length,
          )}
          color={
            kpis.vigilanciaCaducada.length > 0
              ? 'text-red-700'
              : kpis.vigilanciaCaducando.length > 0
                ? 'text-amber-700'
                : 'text-green-700'
          }
        />
        <Kpi
          label="Formación PRL pendiente"
          value={String(kpis.prlPendiente.length)}
          color={kpis.prlPendiente.length > 0 ? 'text-amber-700' : 'text-green-700'}
        />
      </div>

      {/* Banner alertas activas */}
      {totalAlerts > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="text-sm font-bold text-amber-900">
              ⚠ {totalAlerts} alerta{totalAlerts !== 1 ? 's' : ''} activas
            </h3>
            <p className="text-[11px] text-amber-700">Click cualquier item para ir a la sección</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            {/* Vigilancia caducada */}
            {kpis.vigilanciaCaducada.length > 0 && (
              <AlertGroup
                title="🔴 Vigilancia salud CADUCADA"
                items={kpis.vigilanciaCaducada.map((v) => ({
                  primary: v.nombre,
                  secondary: `Hace ${v.days_overdue}d (${v.proxima})`,
                  href: `/admin/personal?seccion=cumplimiento&filter=vigilancia&nif=${v.nif}`,
                }))}
                accent="red"
              />
            )}

            {/* Vigilancia caducando */}
            {kpis.vigilanciaCaducando.length > 0 && (
              <AlertGroup
                title="🟡 Vigilancia salud caduca en 30d"
                items={kpis.vigilanciaCaducando.map((v) => ({
                  primary: v.nombre,
                  secondary: `En ${v.days_until}d (${v.proxima})`,
                  href: `/admin/personal?seccion=cumplimiento&filter=vigilancia&nif=${v.nif}`,
                }))}
                accent="amber"
              />
            )}

            {/* Contratos por vencer */}
            {kpis.expiringContracts.length > 0 && (
              <AlertGroup
                title="📝 Contratos por vencer"
                items={kpis.expiringContracts.map((c) => ({
                  primary: `Contrato ${c.tipo_contrato ?? '—'}`,
                  secondary: `En ${c.days_until}d (${c.fecha_fin})`,
                  href: `/admin/personal?seccion=trabajadores&filter=contratos&id=${c.id}`,
                }))}
                accent="red"
              />
            )}

            {/* PRL pendiente */}
            {kpis.prlPendiente.length > 0 && (
              <AlertGroup
                title="🛡️ Formación PRL pendiente"
                items={kpis.prlPendiente.map((p) => ({
                  primary: p.nombre,
                  secondary: p.ultima_formacion
                    ? `Última: ${p.ultima_formacion} (>12 meses)`
                    : 'Nunca documentada',
                  href: `/admin/personal?seccion=prl&nif=${p.nif}`,
                }))}
                accent="amber"
              />
            )}
          </div>
        </div>
      )}

      {/* Sin alertas */}
      {totalAlerts === 0 && kpis.activeCount > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
          ✓ Sin alertas activas. {kpis.activeCount} trabajador
          {kpis.activeCount !== 1 ? 'es' : ''} al día con vigilancia salud, formación PRL y
          contratos.
        </div>
      )}

      {/* Sin trabajadores */}
      {kpis.activeCount === 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
          ℹ️ Sin trabajadores activos. Añade desde{' '}
          <Link href="/admin/personal?seccion=trabajadores" className="underline font-semibold">
            Trabajadores → Nuevo
          </Link>
          .
        </div>
      )}
    </div>
  )
}

function Kpi({
  label,
  value,
  color = 'text-neutral-800',
}: {
  label: string
  value: string
  color?: string
}) {
  return (
    <div className="bg-white border border-neutral-100 rounded-lg p-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  )
}

function AlertGroup({
  title,
  items,
  accent,
}: {
  title: string
  items: { primary: string; secondary: string; href: string }[]
  accent: 'red' | 'amber'
}) {
  const itemColor =
    accent === 'red'
      ? 'border-red-200 hover:border-red-400 hover:bg-red-50'
      : 'border-amber-200 hover:border-amber-400 hover:bg-amber-100'
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-widest text-amber-900 mb-1.5">
        {title}
      </p>
      <div className="space-y-1">
        {items.slice(0, 5).map((item, i) => (
          <Link
            key={i}
            href={item.href}
            className={`block bg-white border ${itemColor} rounded px-2 py-1.5 transition-colors`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium text-neutral-800 text-xs truncate">{item.primary}</span>
              <span className="text-[10px] text-neutral-500 whitespace-nowrap">
                {item.secondary}
              </span>
            </div>
          </Link>
        ))}
        {items.length > 5 && (
          <p className="text-[10px] text-amber-700 italic px-2">
            + {items.length - 5} más…
          </p>
        )}
      </div>
    </div>
  )
}
