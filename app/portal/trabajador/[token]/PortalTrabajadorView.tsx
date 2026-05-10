'use client'

import { useState } from 'react'

interface ProjectRef {
  id: string
  code: string
  name?: string | null
  description?: string | null
  status?: string | null
}

interface ParteRow {
  id: string
  fecha: string
  project_id: string | null
  horas_ordinarias: number | null
  horas_extra: number | null
  horas_nocturnas: number | null
  observaciones: string | null
  fuente?: string | null
  project?:
    | { code: string; name?: string | null }
    | { code: string; name?: string | null }[]
    | null
}

interface Props {
  token: string
  employee: { nombre: string }
  today: string
  projects: ProjectRef[]
  parteHoy: ParteRow | null
  ultimosDias: ParteRow[]
}

function totalHoras(r: ParteRow): number {
  return (
    Number(r.horas_ordinarias ?? 0) +
    Number(r.horas_extra ?? 0) +
    Number(r.horas_nocturnas ?? 0)
  )
}

function singleProj(p: ParteRow['project']): { code: string; name?: string | null } | null {
  if (!p) return null
  return Array.isArray(p) ? (p[0] ?? null) : p
}

export default function PortalTrabajadorView({
  token,
  employee,
  today,
  projects,
  parteHoy,
  ultimosDias,
}: Props) {
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().slice(0, 10)

  const [fecha, setFecha] = useState<string>(today)
  const [projectId, setProjectId] = useState<string>(parteHoy?.project_id ?? '')
  const [horasOrd, setHorasOrd] = useState<number>(Number(parteHoy?.horas_ordinarias ?? 8))
  const [horasExt, setHorasExt] = useState<number>(Number(parteHoy?.horas_extra ?? 0))
  const [horasNoc, setHorasNoc] = useState<number>(Number(parteHoy?.horas_nocturnas ?? 0))
  const [observaciones, setObservaciones] = useState<string>(parteHoy?.observaciones ?? '')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function guardar() {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch(`/api/portal/trabajador/${token}/parte`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fecha,
          project_id: projectId || null,
          horas_ordinarias: horasOrd,
          horas_extra: horasExt,
          horas_nocturnas: horasNoc,
          observaciones: observaciones.trim() || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'No se pudo guardar')
      } else {
        setSuccess(
          json.action === 'created' ? 'Parte registrado correctamente' : 'Parte actualizado',
        )
        setTimeout(() => window.location.reload(), 1200)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red')
    } finally {
      setSaving(false)
    }
  }

  const total = horasOrd + horasExt + horasNoc

  return (
    <div className="mx-auto max-w-2xl px-4 py-5">
      {/* Saludo */}
      <div className="mb-5 rounded-lg border border-stone-200 bg-white p-4">
        <div className="text-xs uppercase tracking-wider text-stone-500">Bienvenido</div>
        <div className="mt-1 text-lg font-medium text-stone-900">
          {employee.nombre.trim()}
        </div>
        <div className="mt-1 text-xs text-stone-500">
          Apunta tus horas de trabajo del día. Solo tú puedes ver y editar tus partes desde este link.
        </div>
      </div>

      {/* Form parte */}
      <div className="mb-6 rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-medium uppercase tracking-wider text-stone-700">
          {parteHoy ? 'Editar parte de hoy' : 'Registrar parte'}
        </h2>

        <div className="mt-4 space-y-3">
          <div>
            <label className="block text-xs uppercase tracking-wider text-stone-500">Día</label>
            <div className="mt-1 inline-flex rounded-lg border border-stone-300 p-0.5">
              <button
                type="button"
                onClick={() => setFecha(today)}
                className={`rounded-md px-3 py-1.5 text-sm transition ${
                  fecha === today ? 'bg-stone-900 text-white' : 'text-stone-700 hover:bg-stone-100'
                }`}
              >
                Hoy
              </button>
              <button
                type="button"
                onClick={() => setFecha(yesterdayStr)}
                className={`rounded-md px-3 py-1.5 text-sm transition ${
                  fecha === yesterdayStr ? 'bg-stone-900 text-white' : 'text-stone-700 hover:bg-stone-100'
                }`}
              >
                Ayer
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wider text-stone-500">
              Proyecto donde has trabajado
            </label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-base"
            >
              <option value="">— Sin proyecto específico</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} {p.name ? `· ${p.name}` : ''}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-stone-500">
              Si no estás seguro o has trabajado en oficina/almacén, déjalo vacío.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs uppercase tracking-wider text-stone-500">
                Ordinarias
              </label>
              <input
                type="number"
                step="0.25"
                min="0"
                max="24"
                value={horasOrd}
                onChange={(e) => setHorasOrd(parseFloat(e.target.value) || 0)}
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-center text-lg tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-stone-500">Extra</label>
              <input
                type="number"
                step="0.25"
                min="0"
                max="24"
                value={horasExt}
                onChange={(e) => setHorasExt(parseFloat(e.target.value) || 0)}
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-center text-lg tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-stone-500">
                Nocturnas
              </label>
              <input
                type="number"
                step="0.25"
                min="0"
                max="24"
                value={horasNoc}
                onChange={(e) => setHorasNoc(parseFloat(e.target.value) || 0)}
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-center text-lg tabular-nums"
              />
            </div>
          </div>

          <div className="rounded bg-stone-100 p-2 text-center text-sm text-stone-600">
            Total: <span className="font-medium tabular-nums">{total.toFixed(2)} h</span>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wider text-stone-500">
              Observaciones <span className="text-stone-400">(opcional)</span>
            </label>
            <textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              rows={2}
              placeholder="¿Qué has hecho hoy? ej: solado planta 2…"
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
            disabled={saving || total === 0}
            className="w-full rounded-lg bg-stone-900 px-4 py-3 text-base font-medium text-white transition hover:bg-stone-800 disabled:opacity-50"
          >
            {saving ? 'Guardando…' : parteHoy ? 'Actualizar parte' : 'Guardar parte'}
          </button>
        </div>
      </div>

      {/* Últimos 7 días */}
      <div>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wider text-stone-700">
          Últimos 7 días
        </h2>
        {ultimosDias.length === 0 ? (
          <div className="rounded-lg border border-dashed border-stone-300 p-5 text-center text-sm text-stone-500">
            No has registrado partes recientes.
          </div>
        ) : (
          <ul className="space-y-2">
            {ultimosDias.map((r) => {
              const proj = singleProj(r.project)
              return (
                <li
                  key={r.id}
                  className="rounded-lg border border-stone-200 bg-white p-3 text-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-stone-500">{r.fecha}</span>
                    <span className="tabular-nums font-medium">{totalHoras(r).toFixed(2)} h</span>
                  </div>
                  <div className="mt-1 text-stone-700">
                    {proj ? (
                      <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                        {proj.code}
                      </span>
                    ) : (
                      <span className="text-xs text-stone-400">— sin proyecto —</span>
                    )}
                  </div>
                  {r.observaciones && (
                    <div className="mt-1 text-xs text-stone-500">{r.observaciones}</div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
