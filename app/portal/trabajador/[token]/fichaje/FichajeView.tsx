'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import imageCompression from 'browser-image-compression'

interface ProjectRef {
  id: string
  code: string
  name: string | null
}

interface AssignmentRow {
  id: string
  fecha: string
  project_id: string | null
  jornada_esperada_horas: number | null
  notas: string | null
  project?: { id: string; code: string; name?: string | null } | { id: string; code: string; name?: string | null }[] | null
}

interface ParteRow {
  id: string
  fecha: string
  project_id: string | null
  horas_ordinarias: number | null
  horas_extra: number | null
  horas_nocturnas: number | null
  horas_extra_modo?: 'compensar' | 'pagar' | null
  observaciones: string | null
  fuente: string | null
  worker_signed_at: string | null
  hora_entrada: string | null
  hora_salida: string | null
  foto_avance_path: string | null
  foto_avance_bucket: string | null
  project?: { code: string; name: string | null } | { code: string; name: string | null }[] | null
}

interface Props {
  token: string
  employeeName: string
  today: string
  projects: ProjectRef[]
  partes: ParteRow[]
  assignments: AssignmentRow[]
  jornadaEsperadaHoy: number
}

function singleProj<T>(p: T | T[] | null | undefined): T | null {
  if (!p) return null
  return Array.isArray(p) ? (p[0] ?? null) : p
}

export default function FichajeView({
  token,
  employeeName,
  today,
  projects,
  partes,
  assignments,
  jornadaEsperadaHoy,
}: Props) {
  // Últimos 7 días para el selector
  const last7Days = useMemo(() => {
    const result: { iso: string; label: string }[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      const iso = d.toISOString().slice(0, 10)
      let label: string
      if (i === 0) label = 'Hoy'
      else if (i === 1) label = 'Ayer'
      else label = d.toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: '2-digit' })
      result.push({ iso, label })
    }
    return result
  }, [today])

  const parteByDate = useMemo(() => {
    const m = new Map<string, ParteRow>()
    for (const p of partes) m.set(p.fecha, p)
    return m
  }, [partes])

  const assignmentByDate = useMemo(() => {
    const m = new Map<string, AssignmentRow>()
    for (const a of assignments) m.set(a.fecha, a)
    return m
  }, [assignments])

  const [fecha, setFecha] = useState<string>(today)
  const parteDia = parteByDate.get(fecha) ?? null
  const assignmentDia = assignmentByDate.get(fecha) ?? null
  const assignmentProj = singleProj(assignmentDia?.project)

  const [projectId, setProjectId] = useState<string>(
    parteDia?.project_id ?? assignmentDia?.project_id ?? '',
  )
  const [horasOrd, setHorasOrd] = useState<string>(
    parteDia?.horas_ordinarias != null ? String(parteDia.horas_ordinarias) : '',
  )
  const [horasExt, setHorasExt] = useState<string>(
    parteDia?.horas_extra != null && Number(parteDia.horas_extra) > 0
      ? String(parteDia.horas_extra)
      : '',
  )
  const [horasNoc, setHorasNoc] = useState<string>(
    parteDia?.horas_nocturnas != null && Number(parteDia.horas_nocturnas) > 0
      ? String(parteDia.horas_nocturnas)
      : '',
  )
  const [horasExtraModo, setHorasExtraModo] = useState<'compensar' | 'pagar'>(
    parteDia?.horas_extra_modo ?? 'compensar',
  )
  const [observaciones, setObservaciones] = useState<string>(parteDia?.observaciones ?? '')
  const [confirmaVeracidad, setConfirmaVeracidad] = useState(false)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Cuando cambia día, reset state del form al parte/assignment de ese día
  const [projectTouched, setProjectTouched] = useState(false)
  useEffect(() => {
    const p = parteByDate.get(fecha)
    const a = assignmentByDate.get(fecha)
    setProjectId(p?.project_id ?? a?.project_id ?? '')
    setProjectTouched(false)
    setHorasOrd(p?.horas_ordinarias != null ? String(p.horas_ordinarias) : '')
    setHorasExt(
      p?.horas_extra != null && Number(p.horas_extra) > 0 ? String(p.horas_extra) : '',
    )
    setHorasNoc(
      p?.horas_nocturnas != null && Number(p.horas_nocturnas) > 0
        ? String(p.horas_nocturnas)
        : '',
    )
    setHorasExtraModo(p?.horas_extra_modo ?? 'compensar')
    setObservaciones(p?.observaciones ?? '')
    setConfirmaVeracidad(false)
    setError(null)
    setSuccess(null)
  }, [fecha, parteByDate, assignmentByDate])

  // Foto avance opcional
  const [fotoAvancePreview, setFotoAvancePreview] = useState<string | null>(null)
  const [fotoAvanceUploading, setFotoAvanceUploading] = useState(false)
  const [fotoAvanceAttachmentId, setFotoAvanceAttachmentId] = useState<string | null>(null)

  async function uploadFotoAvance(file: File) {
    setFotoAvanceUploading(true)
    setError(null)
    try {
      let toUpload: File = file
      if (file.type.startsWith('image/')) {
        try {
          toUpload = (await imageCompression(file, {
            maxSizeMB: 1,
            maxWidthOrHeight: 2000,
            useWebWorker: true,
            fileType: 'image/jpeg',
            initialQuality: 0.85,
          })) as File
        } catch {
          // ignore, usar original
        }
      }
      const fd = new FormData()
      fd.append('file', toUpload)
      fd.append('doc_type', 'foto_obra')
      if (projectId) fd.append('project_id', projectId)
      const res = await fetch(`/api/portal/trabajador/${token}/upload-receipt`, {
        method: 'POST',
        body: fd,
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'No se pudo subir la foto')
        return
      }
      setFotoAvanceAttachmentId(json.attachment.id)
      setFotoAvancePreview(json.preview_url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red')
    } finally {
      setFotoAvanceUploading(false)
    }
  }

  const horasOrdNum = parseFloat(horasOrd) || 0
  const horasExtNum = parseFloat(horasExt) || 0
  const horasNocNum = parseFloat(horasNoc) || 0
  const total = horasOrdNum + horasExtNum + horasNocNum

  async function guardar() {
    setSaving(true)
    setError(null)
    setSuccess(null)

    let geoData: { geo_lat?: number; geo_lng?: number; geo_accuracy?: number } = {}
    if (typeof navigator !== 'undefined' && navigator.geolocation && projectId && fecha === today) {
      try {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => resolve(), 2000)
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              clearTimeout(timer)
              geoData = {
                geo_lat: pos.coords.latitude,
                geo_lng: pos.coords.longitude,
                geo_accuracy: Math.round(pos.coords.accuracy),
              }
              resolve()
            },
            () => {
              clearTimeout(timer)
              resolve()
            },
            { timeout: 1500, maximumAge: 60000 },
          )
        })
      } catch {
        // ignore
      }
    }

    const payload = {
      fecha,
      project_id: projectId || null,
      horas_ordinarias: horasOrdNum,
      horas_extra: horasExtNum,
      horas_nocturnas: horasNocNum,
      horas_extra_modo: horasExtNum > 0 ? horasExtraModo : undefined,
      observaciones: observaciones.trim() || undefined,
      foto_avance_attachment_id: fotoAvanceAttachmentId ?? undefined,
      ...geoData,
    }

    try {
      const res = await fetch(`/api/portal/trabajador/${token}/parte`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'No se pudo guardar')
      } else {
        let msg =
          json.action === 'created'
            ? 'Parte registrado y firmado ✓'
            : 'Parte actualizado y firmado ✓'
        if (horasExtNum > 0 && horasExtraModo === 'compensar') {
          msg += ` · +${horasExtNum}h al banco`
        } else if (horasExtNum > 0 && horasExtraModo === 'pagar') {
          msg += ` · +${horasExtNum}h se pagan en nómina`
        }
        setSuccess(msg)
        setTimeout(() => window.location.reload(), 1500)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red')
    } finally {
      setSaving(false)
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
        <span className="text-xs text-stone-500">{employeeName.trim()}</span>
      </div>

      <h1 className="text-xl font-medium text-stone-900">Fichaje del día</h1>
      <p className="mt-1 text-sm text-stone-600">
        Apunta tus horas. Si te equivocaste un día, elige el día y modifícalo.
      </p>

      {/* Selector 7 días */}
      <div className="mt-4">
        <label className="block text-xs uppercase tracking-wider text-stone-500">¿Qué día?</label>
        <div className="mt-1 grid grid-cols-4 gap-1.5 sm:grid-cols-7">
          {last7Days.map((d) => {
            const tieneParte = parteByDate.has(d.iso)
            return (
              <button
                key={d.iso}
                type="button"
                onClick={() => setFecha(d.iso)}
                className={`relative rounded-md px-2 py-1.5 text-[11px] transition ${
                  fecha === d.iso
                    ? 'bg-stone-900 text-white'
                    : 'border border-stone-300 bg-white text-stone-700 hover:bg-stone-100'
                }`}
              >
                {d.label}
                {tieneParte && (
                  <span
                    className={`absolute right-1 top-1 h-1.5 w-1.5 rounded-full ${
                      fecha === d.iso ? 'bg-emerald-300' : 'bg-emerald-500'
                    }`}
                    title="Tiene parte"
                  />
                )}
              </button>
            )
          })}
        </div>
        <p className="mt-1 text-[10px] text-stone-500">
          🟢 días con parte guardado
        </p>
      </div>

      {/* Banner asignación si hay */}
      {assignmentDia && assignmentProj && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
          <div className="text-xs uppercase tracking-wider text-emerald-900">
            Asignación del {fecha === today ? 'día' : 'día seleccionado'}
          </div>
          <div className="mt-1 font-medium text-emerald-900">
            {assignmentProj.code}
            {assignmentProj.name ? ` · ${assignmentProj.name}` : ''}
          </div>
          {assignmentDia.jornada_esperada_horas && (
            <div className="text-xs text-emerald-800">
              Jornada esperada: {Number(assignmentDia.jornada_esperada_horas)} h
            </div>
          )}
        </div>
      )}

      {/* Estado parte ya firmado */}
      {parteDia?.worker_signed_at && (
        <div className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
          ✓ Parte firmado el{' '}
          {new Date(parteDia.worker_signed_at).toLocaleString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })}
          . Puedes editarlo si hubo algún error.
        </div>
      )}

      {/* Form */}
      <div className="mt-5 rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-medium uppercase tracking-wider text-stone-700">
          {parteDia ? 'Editar parte' : 'Nuevo parte'}
        </h2>

        <div className="mt-4 space-y-3">
          {/* Proyecto */}
          <div>
            <label className="block text-xs uppercase tracking-wider text-stone-500">
              Proyecto donde has trabajado
            </label>
            <select
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value)
                setProjectTouched(true)
              }}
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-base"
            >
              <option value="">— Sin proyecto específico</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} {p.name ? `· ${p.name}` : ''}
                </option>
              ))}
            </select>
            {!projectTouched && assignmentDia?.project_id && (
              <p className="mt-1 text-xs text-stone-500">
                💡 Pre-rellenado desde el cuadrante. Cámbialo si trabajaste en otro sitio.
              </p>
            )}
          </div>

          {/* Horas */}
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
                inputMode="decimal"
                placeholder={jornadaEsperadaHoy > 0 && fecha === today ? String(jornadaEsperadaHoy) : '0'}
                value={horasOrd}
                onChange={(e) => setHorasOrd(e.target.value)}
                onFocus={(e) => e.target.select()}
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-center text-lg tabular-nums placeholder:text-stone-300"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-stone-500">Extra</label>
              <input
                type="number"
                step="0.25"
                min="0"
                max="24"
                inputMode="decimal"
                placeholder="0"
                value={horasExt}
                onChange={(e) => setHorasExt(e.target.value)}
                onFocus={(e) => e.target.select()}
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-center text-lg tabular-nums placeholder:text-stone-300"
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
                inputMode="decimal"
                placeholder="0"
                value={horasNoc}
                onChange={(e) => setHorasNoc(e.target.value)}
                onFocus={(e) => e.target.select()}
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-center text-lg tabular-nums placeholder:text-stone-300"
              />
            </div>
          </div>

          <div className="rounded bg-stone-100 p-2 text-center text-sm text-stone-600">
            Total: <span className="font-medium tabular-nums">{total.toFixed(2)} h</span>
          </div>

          {/* Toggle modo extras */}
          {horasExtNum > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <div className="text-xs uppercase tracking-wider text-amber-900">
                Las {horasExtNum}h extra ¿qué prefieres?
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setHorasExtraModo('compensar')}
                  className={`rounded-lg border px-3 py-2 text-sm transition ${
                    horasExtraModo === 'compensar'
                      ? 'border-stone-900 bg-stone-900 text-white'
                      : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
                  }`}
                >
                  🪙 Compensar
                  <div className="mt-0.5 text-[10px] font-normal opacity-80">
                    Descansas otro día
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setHorasExtraModo('pagar')}
                  className={`rounded-lg border px-3 py-2 text-sm transition ${
                    horasExtraModo === 'pagar'
                      ? 'border-stone-900 bg-stone-900 text-white'
                      : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
                  }`}
                >
                  💰 Pagar
                  <div className="mt-0.5 text-[10px] font-normal opacity-80">Importe nómina</div>
                </button>
              </div>
            </div>
          )}

          {/* Observaciones */}
          <div>
            <label className="block text-xs uppercase tracking-wider text-stone-500">
              Observaciones <span className="text-stone-400">(opcional)</span>
            </label>
            <textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              rows={2}
              placeholder="¿Qué has hecho? ej: solado planta 2…"
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
            />
          </div>

          {/* Foto avance */}
          {fecha === today && (
            <div className="rounded-lg border border-stone-200 bg-stone-50 p-3">
              <label className="block text-xs uppercase tracking-wider text-stone-500">
                📸 Foto avance <span className="text-stone-400">(opcional)</span>
              </label>
              {fotoAvancePreview ? (
                <div className="mt-2">
                  <img
                    src={fotoAvancePreview}
                    alt="Avance"
                    className="h-32 w-auto rounded border border-stone-200 object-contain"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setFotoAvancePreview(null)
                      setFotoAvanceAttachmentId(null)
                    }}
                    className="mt-1 text-xs text-red-600 hover:text-red-800"
                  >
                    Quitar foto
                  </button>
                </div>
              ) : (
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic"
                  capture="environment"
                  onChange={async (e) => {
                    const f = e.target.files?.[0]
                    if (!f) return
                    await uploadFotoAvance(f)
                  }}
                  disabled={fotoAvanceUploading}
                  className="mt-2 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-stone-200 file:px-3 file:py-1 file:text-sm disabled:opacity-50"
                />
              )}
              {fotoAvanceUploading && <p className="mt-1 text-xs text-blue-700">Subiendo…</p>}
            </div>
          )}

          {/* Checkbox firma */}
          <label className="flex items-start gap-2 rounded-lg border border-stone-300 bg-stone-50 p-3 text-sm">
            <input
              type="checkbox"
              checked={confirmaVeracidad}
              onChange={(e) => setConfirmaVeracidad(e.target.checked)}
              className="mt-0.5 h-5 w-5 cursor-pointer"
            />
            <span className="text-stone-700">
              <strong>Confirmo</strong> que las horas y proyecto son correctos.
            </span>
          </label>

          {error && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
              ⚠️ {error}
            </div>
          )}
          {success && (
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">
              {success}
            </div>
          )}

          <button
            type="button"
            onClick={guardar}
            disabled={saving || total === 0 || !confirmaVeracidad}
            className="w-full rounded-lg bg-stone-900 px-4 py-3 text-base font-medium text-white transition hover:bg-stone-800 disabled:opacity-50"
          >
            {saving
              ? 'Guardando…'
              : !confirmaVeracidad
                ? 'Marca la casilla para firmar y guardar'
                : parteDia
                  ? 'Actualizar y firmar parte'
                  : 'Firmar y guardar parte'}
          </button>
        </div>
      </div>
    </div>
  )
}
