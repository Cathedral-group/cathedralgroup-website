'use client'

import Link from 'next/link'
import { useState } from 'react'

interface Project {
  id: string
  code: string
  name: string | null
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
  material_unidad: string | null
  observaciones: string | null
  status: string
  reviewed_at: string | null
  created_at: string
  project?: { code: string; name: string | null } | { code: string; name: string | null }[] | null
}

interface Props {
  token: string
  projects: Project[]
  initialExpenses: Expense[]
}

const TIPO_LABELS: Record<string, string> = {
  dieta: '🍽️ Dieta',
  kilometraje: '🚗 Km recorridos',
  material: '🧱 Material',
  aparcamiento: '🅿️ Aparcamiento',
  peaje: '🛣️ Peaje',
  otro: '💼 Otro',
}

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Pendiente revisar', cls: 'bg-amber-100 text-amber-800' },
  confirmed: { label: '✓ Registrado', cls: 'bg-emerald-100 text-emerald-800' },
  ignored: { label: 'Descartado', cls: 'bg-stone-100 text-stone-600' },
  reimbursed: { label: '💰 Reembolsado', cls: 'bg-emerald-100 text-emerald-800' },
}

const MEDIO_PAGO_LABELS: Record<string, string> = {
  tarjeta_empresa: '💳 Tarjeta empresa',
  bolsillo_personal: '👛 Mi bolsillo',
  coche_empresa: '🚗 Coche empresa',
  efectivo_caja_obra: '💵 Caja obra',
}

function singleProj<T>(p: T | T[] | null | undefined): T | null {
  if (!p) return null
  return Array.isArray(p) ? (p[0] ?? null) : p
}

function eur(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(n))
}

export default function GastosView({ token, projects, initialExpenses }: Props) {
  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses)
  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().slice(0, 10)

  const last7Days: { iso: string; label: string }[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const iso = d.toISOString().slice(0, 10)
    let label: string
    if (i === 0) label = 'Hoy'
    else if (i === 1) label = 'Ayer'
    else label = d.toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: '2-digit' })
    last7Days.push({ iso, label })
  }

  const [tipo, setTipo] = useState('dieta')
  const [medioPago, setMedioPago] = useState<string>('tarjeta_empresa')
  const [fecha, setFecha] = useState(today)
  const [projectId, setProjectId] = useState<string>('')
  const [importe, setImporte] = useState<string>('')
  const [kmRecorridos, setKmRecorridos] = useState<string>('')
  const [kmOrigen, setKmOrigen] = useState('')
  const [kmDestino, setKmDestino] = useState('')
  const [materialDesc, setMaterialDesc] = useState('')
  const [materialCantidad, setMaterialCantidad] = useState<string>('')
  const [materialUnidad, setMaterialUnidad] = useState('uds')
  const [observaciones, setObservaciones] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  function reset() {
    setImporte('')
    setKmRecorridos('')
    setKmOrigen('')
    setKmDestino('')
    setMaterialDesc('')
    setMaterialCantidad('')
    setMaterialUnidad('uds')
    setObservaciones('')
  }

  async function guardar() {
    setSaving(true)
    setError(null)
    setSuccess(null)

    const payload: Record<string, unknown> = {
      fecha,
      tipo,
      medio_pago: medioPago,
      project_id: projectId || null,
      observaciones: observaciones.trim() || undefined,
    }

    if (tipo === 'kilometraje') {
      payload.km_recorridos = parseFloat(kmRecorridos) || 0
      payload.km_origen = kmOrigen.trim() || undefined
      payload.km_destino = kmDestino.trim() || undefined
    } else if (tipo === 'material') {
      payload.material_descripcion = materialDesc.trim()
      payload.material_cantidad = parseFloat(materialCantidad) || 0
      payload.material_unidad = materialUnidad
    } else {
      payload.importe = parseFloat(importe) || 0
    }

    try {
      const res = await fetch(`/api/portal/trabajador/${token}/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Error al guardar')
      } else {
        const msg =
          medioPago === 'tarjeta_empresa'
            ? 'Gasto registrado ✓ (tarjeta empresa, sin reembolso)'
            : medioPago === 'coche_empresa'
            ? 'Gasto registrado ✓ (coche empresa)'
            : medioPago === 'bolsillo_personal'
            ? 'Gasto registrado ✓ Pendiente de reembolso'
            : 'Gasto registrado ✓'
        setSuccess(msg)
        setExpenses((prev) => [
          {
            ...json.row,
            project: projectId ? (() => {
              const p = projects.find((x) => x.id === projectId)
              return p ? { code: p.code, name: p.name } : null
            })() : null,
          },
          ...prev,
        ])
        reset()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red')
    } finally {
      setSaving(false)
    }
  }

  async function borrar(id: string) {
    if (!confirm('¿Borrar este gasto? Solo se puede si la administración aún no lo ha revisado.')) return
    try {
      const res = await fetch(
        `/api/portal/trabajador/${token}/expenses?id=${encodeURIComponent(id)}`,
        { method: 'DELETE' },
      )
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'No se pudo borrar')
      } else {
        setExpenses((prev) => prev.filter((e) => e.id !== id))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red')
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-5">
      <div className="mb-4 flex items-center justify-between">
        <Link
          href={`/portal/trabajador/${token}`}
          className="text-sm text-stone-600 hover:text-stone-900"
        >
          ← Volver
        </Link>
      </div>

      <h1 className="text-xl font-medium text-stone-900">Gastos del día</h1>
      <p className="mt-1 text-sm text-stone-600">
        Apunta dietas, km recorridos, material consumido o gastos pagados de tu bolsillo. La
        administración los revisará y, si procede, te los reembolsa.
      </p>

      {/* Form nuevo gasto */}
      <div className="mt-5 rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
        <div className="space-y-3">
          {/* Tipo */}
          <div>
            <label className="block text-xs uppercase tracking-wider text-stone-500">¿Qué gasto?</label>
            <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {Object.entries(TIPO_LABELS).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setTipo(k)
                    reset()
                  }}
                  className={`rounded-lg border px-2 py-2 text-xs transition ${
                    tipo === k
                      ? 'border-stone-900 bg-stone-900 text-white'
                      : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Medio de pago */}
          <div>
            <label className="block text-xs uppercase tracking-wider text-stone-500">
              ¿Cómo lo pagaste?
            </label>
            <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {Object.entries(MEDIO_PAGO_LABELS).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setMedioPago(k)}
                  className={`rounded-lg border px-2 py-2 text-xs transition ${
                    medioPago === k
                      ? 'border-stone-900 bg-stone-900 text-white'
                      : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {medioPago === 'tarjeta_empresa' && (
              <p className="mt-1 text-xs text-emerald-700">
                ✓ Cathedral paga directo, no se reembolsa
              </p>
            )}
            {medioPago === 'bolsillo_personal' && (
              <p className="mt-1 text-xs text-amber-700">
                ⚠ Adelanto tuyo — Cathedral te lo reembolsará
              </p>
            )}
            {medioPago === 'coche_empresa' && (
              <p className="mt-1 text-xs text-stone-500">
                Combustible/peajes/aparcamiento del coche de Cathedral
              </p>
            )}
          </div>

          {/* Día */}
          <div>
            <label className="block text-xs uppercase tracking-wider text-stone-500">Día</label>
            <div className="mt-1 grid grid-cols-4 gap-1.5 sm:grid-cols-7">
              {last7Days.map((d) => (
                <button
                  key={d.iso}
                  type="button"
                  onClick={() => setFecha(d.iso)}
                  className={`rounded-md px-2 py-1.5 text-[11px] transition ${
                    fecha === d.iso
                      ? 'bg-stone-900 text-white'
                      : 'border border-stone-300 bg-white text-stone-700 hover:bg-stone-100'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Proyecto */}
          <div>
            <label className="block text-xs uppercase tracking-wider text-stone-500">
              Proyecto <span className="text-stone-400">(opcional)</span>
            </label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-base"
            >
              <option value="">— Sin proyecto —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} {p.name ? `· ${p.name}` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Campos según tipo */}
          {tipo === 'kilometraje' ? (
            <>
              <div>
                <label className="block text-xs uppercase tracking-wider text-stone-500">
                  Kilómetros recorridos
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="1000"
                  inputMode="decimal"
                  placeholder="0"
                  value={kmRecorridos}
                  onChange={(e) => setKmRecorridos(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-lg tabular-nums placeholder:text-stone-300"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs uppercase tracking-wider text-stone-500">
                    Origen
                  </label>
                  <input
                    type="text"
                    value={kmOrigen}
                    onChange={(e) => setKmOrigen(e.target.value)}
                    placeholder="Almacén"
                    className="mt-1 w-full rounded-lg border border-stone-300 px-2 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wider text-stone-500">
                    Destino
                  </label>
                  <input
                    type="text"
                    value={kmDestino}
                    onChange={(e) => setKmDestino(e.target.value)}
                    placeholder="Obra Aguacate 28"
                    className="mt-1 w-full rounded-lg border border-stone-300 px-2 py-2 text-sm"
                  />
                </div>
              </div>
            </>
          ) : tipo === 'material' ? (
            <>
              <div>
                <label className="block text-xs uppercase tracking-wider text-stone-500">
                  ¿Qué material?
                </label>
                <input
                  type="text"
                  value={materialDesc}
                  onChange={(e) => setMaterialDesc(e.target.value)}
                  placeholder="Sacos cemento Portland 25kg"
                  className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-base"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs uppercase tracking-wider text-stone-500">
                    Cantidad
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    inputMode="decimal"
                    placeholder="0"
                    value={materialCantidad}
                    onChange={(e) => setMaterialCantidad(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-lg tabular-nums placeholder:text-stone-300"
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wider text-stone-500">
                    Unidad
                  </label>
                  <select
                    value={materialUnidad}
                    onChange={(e) => setMaterialUnidad(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-base"
                  >
                    <option>uds</option>
                    <option>sacos</option>
                    <option>kg</option>
                    <option>litros</option>
                    <option>metros</option>
                    <option>m²</option>
                    <option>m³</option>
                    <option>cajas</option>
                  </select>
                </div>
              </div>
            </>
          ) : (
            <div>
              <label className="block text-xs uppercase tracking-wider text-stone-500">
                Importe (€)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                placeholder="0,00"
                value={importe}
                onChange={(e) => setImporte(e.target.value)}
                onFocus={(e) => e.target.select()}
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-lg tabular-nums placeholder:text-stone-300"
              />
            </div>
          )}

          {/* Observaciones */}
          <div>
            <label className="block text-xs uppercase tracking-wider text-stone-500">
              Observaciones <span className="text-stone-400">(opcional)</span>
            </label>
            <input
              type="text"
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="..."
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
              ⚠️ {error}
            </div>
          )}
          {success && (
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">
              ✓ {success}
            </div>
          )}

          <button
            type="button"
            onClick={guardar}
            disabled={saving}
            className="w-full rounded-lg bg-stone-900 px-4 py-3 text-base font-medium text-white transition hover:bg-stone-800 disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Registrar gasto'}
          </button>
        </div>
      </div>

      {/* Lista últimos 30 días */}
      <div className="mt-6">
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wider text-stone-700">
          Últimos 30 días ({expenses.length})
        </h2>
        {expenses.length === 0 ? (
          <div className="rounded-lg border border-dashed border-stone-300 p-5 text-center text-sm text-stone-500">
            Aún no has apuntado gastos.
          </div>
        ) : (
          <ul className="space-y-2">
            {expenses.map((e) => {
              const proj = singleProj(e.project)
              const status = STATUS_LABELS[e.status] ?? STATUS_LABELS.pending
              return (
                <li
                  key={e.id}
                  className="rounded-lg border border-stone-200 bg-white p-3 text-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs">{TIPO_LABELS[e.tipo] ?? e.tipo}</span>
                        <span className="font-mono text-[10px] text-stone-500">{e.fecha}</span>
                        {proj && (
                          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">
                            {proj.code}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-stone-800">
                        {e.tipo === 'kilometraje' ? (
                          <>
                            <span className="font-medium">{e.km_recorridos} km</span>
                            {e.km_origen && e.km_destino && (
                              <span className="text-xs text-stone-500">
                                {' '}({e.km_origen} → {e.km_destino})
                              </span>
                            )}
                          </>
                        ) : e.tipo === 'material' ? (
                          <>
                            <span className="font-medium">{e.material_cantidad} {e.material_unidad}</span>{' '}
                            {e.material_descripcion}
                          </>
                        ) : (
                          <span className="font-medium">{eur(e.importe)}</span>
                        )}
                      </div>
                      {e.observaciones && (
                        <div className="mt-1 text-xs text-stone-500">{e.observaciones}</div>
                      )}
                      <div className="mt-1 flex flex-wrap gap-1">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] ${status.cls}`}>
                          {status.label}
                        </span>
                        <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-600">
                          {MEDIO_PAGO_LABELS[e.medio_pago] ?? e.medio_pago}
                        </span>
                      </div>
                    </div>
                    {e.status === 'pending' && (
                      <button
                        type="button"
                        onClick={() => borrar(e.id)}
                        className="text-[11px] text-red-600 hover:text-red-800"
                      >
                        Borrar
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
