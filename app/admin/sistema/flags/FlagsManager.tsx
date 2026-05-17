'use client'

/**
 * FlagsManager — Client Component admin feature_flags.
 *
 * Patrón Next.js 15:
 *   - useOptimistic: UI ya muestra cambio antes de confirmación servidor
 *   - useTransition: pending state durante Server Action
 *   - Si Server Action devuelve { ok: false }: revertimos optimistic + mostramos error
 *
 * Server Actions (importadas de @/app/actions/feature-flags):
 *   - updateFlagAction (toggle enabled, slider rollout_pct, edit description)
 *   - createFlagAction (formulario "nuevo flag")
 *   - deleteFlagAction (confirm + delete)
 */
import { useOptimistic, useState, useTransition } from 'react'
import {
  updateFlagAction,
  createFlagAction,
  deleteFlagAction,
} from '@/app/actions/feature-flags'
import type { FeatureFlag } from '@/lib/feature-flags'

type FlagFormState = {
  key: string
  enabled: boolean
  rollout_pct: number
  description: string
}

function formatES(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleString('es-ES', {
    timeZone: 'Europe/Madrid',
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

export default function FlagsManager({ initialFlags }: { initialFlags: FeatureFlag[] }) {
  const [pending, startTransition] = useTransition()
  const [flags, setFlags] = useState<FeatureFlag[]>(initialFlags)
  const [optimisticFlags, applyOptimistic] = useOptimistic<FeatureFlag[], FeatureFlag[]>(
    flags,
    (_current, next) => next
  )
  const [error, setError] = useState<string | null>(null)
  const [showNewForm, setShowNewForm] = useState(false)

  function patchOne(key: string, patch: Partial<FeatureFlag>) {
    const updated = optimisticFlags.map((f) =>
      f.key === key ? { ...f, ...patch } : f
    )
    startTransition(async () => {
      applyOptimistic(updated)
      const target = updated.find((f) => f.key === key)!
      const res = await updateFlagAction({
        key: target.key,
        enabled: target.enabled,
        rollout_pct: target.rollout_pct,
        description: target.description,
      })
      if (!res.ok) {
        setError(res.error)
        // revert
        applyOptimistic(flags)
      } else {
        setError(null)
        setFlags(updated)
      }
    })
  }

  function handleCreate(form: FlagFormState) {
    setError(null)
    startTransition(async () => {
      const res = await createFlagAction({
        key: form.key,
        enabled: form.enabled,
        rollout_pct: form.rollout_pct,
        description: form.description || null,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      // refrescamos lista con un row nuevo en local; el revalidateTag servidor lo dejará coherente al recargar
      const newRow: FeatureFlag = {
        key: form.key,
        enabled: form.enabled,
        rollout_pct: form.rollout_pct,
        description: form.description || null,
        metadata: {},
        updated_at: new Date().toISOString(),
        updated_by: null,
      }
      const next = [...flags, newRow].sort((a, b) => a.key.localeCompare(b.key))
      setFlags(next)
      applyOptimistic(next)
      setShowNewForm(false)
    })
  }

  function handleDelete(key: string) {
    if (!confirm(`¿Eliminar marca "${key}"? Esta acción es permanente.`)) return
    startTransition(async () => {
      const res = await deleteFlagAction({ key })
      if (!res.ok) {
        setError(res.error)
        return
      }
      const next = flags.filter((f) => f.key !== key)
      setFlags(next)
      applyOptimistic(next)
    })
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <p className="text-sm text-stone-500">
          {optimisticFlags.length} marca{optimisticFlags.length === 1 ? '' : 's'}{' '}
          {pending ? '• guardando…' : ''}
        </p>
        <button
          type="button"
          onClick={() => setShowNewForm((v) => !v)}
          className="rounded border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
        >
          {showNewForm ? 'Cancelar' : '+ Nueva marca'}
        </button>
      </div>

      {showNewForm ? <NewFlagForm onSubmit={handleCreate} disabled={pending} /> : null}

      <div className="overflow-hidden rounded border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-3 py-2">Clave</th>
              <th className="px-3 py-2">Activada</th>
              <th className="px-3 py-2 w-48">% Despliegue</th>
              <th className="px-3 py-2">Descripción</th>
              <th className="px-3 py-2">Actualizado</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {optimisticFlags.map((flag) => (
              <FlagRow
                key={flag.key}
                flag={flag}
                disabled={pending}
                onPatch={(patch) => patchOne(flag.key, patch)}
                onDelete={() => handleDelete(flag.key)}
              />
            ))}
            {optimisticFlags.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-stone-400">
                  No hay marcas. Crea una con &quot;Nueva marca&quot;.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function FlagRow({
  flag,
  disabled,
  onPatch,
  onDelete,
}: {
  flag: FeatureFlag
  disabled: boolean
  onPatch: (patch: Partial<FeatureFlag>) => void
  onDelete: () => void
}) {
  const [localPct, setLocalPct] = useState(flag.rollout_pct)
  const [localDesc, setLocalDesc] = useState(flag.description ?? '')

  return (
    <tr className="align-top">
      <td className="px-3 py-2 font-mono text-xs text-stone-800">{flag.key}</td>
      <td className="px-3 py-2">
        <label className="inline-flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={flag.enabled}
            disabled={disabled}
            onChange={(e) => onPatch({ enabled: e.target.checked })}
            className="h-4 w-4 rounded border-stone-300"
          />
          <span className={flag.enabled ? 'text-emerald-700' : 'text-stone-500'}>
            {flag.enabled ? 'activada' : 'desactivada'}
          </span>
        </label>
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={localPct}
            disabled={disabled}
            onChange={(e) => setLocalPct(Number(e.target.value))}
            onMouseUp={() => {
              if (localPct !== flag.rollout_pct) onPatch({ rollout_pct: localPct })
            }}
            onTouchEnd={() => {
              if (localPct !== flag.rollout_pct) onPatch({ rollout_pct: localPct })
            }}
            className="flex-1"
          />
          <span className="w-10 text-right tabular-nums text-stone-700">{localPct}%</span>
        </div>
      </td>
      <td className="px-3 py-2">
        <input
          type="text"
          value={localDesc}
          disabled={disabled}
          maxLength={500}
          onChange={(e) => setLocalDesc(e.target.value)}
          onBlur={() => {
            if (localDesc !== (flag.description ?? '')) {
              onPatch({ description: localDesc || null })
            }
          }}
          className="w-full rounded border border-stone-200 px-2 py-1 text-xs"
          placeholder="(sin descripción)"
        />
      </td>
      <td className="px-3 py-2 text-xs text-stone-500">
        <div>{formatES(flag.updated_at)}</div>
        {flag.updated_by ? <div className="text-[10px]">{flag.updated_by}</div> : null}
      </td>
      <td className="px-3 py-2 text-right">
        <button
          type="button"
          onClick={onDelete}
          disabled={disabled}
          className="text-xs text-red-600 hover:underline disabled:opacity-50"
        >
          Eliminar
        </button>
      </td>
    </tr>
  )
}

function NewFlagForm({
  onSubmit,
  disabled,
}: {
  onSubmit: (form: FlagFormState) => void
  disabled: boolean
}) {
  const [form, setForm] = useState<FlagFormState>({
    key: '',
    enabled: false,
    rollout_pct: 0,
    description: '',
  })
  const keyValid = /^[a-z0-9_]+$/.test(form.key) && form.key.length > 0

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!keyValid) return
        onSubmit(form)
      }}
      className="rounded border border-stone-200 bg-stone-50 p-4 space-y-3"
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-stone-600">
            Clave (snake_case, [a-z0-9_])
          </span>
          <input
            type="text"
            required
            value={form.key}
            maxLength={80}
            onChange={(e) => setForm((f) => ({ ...f, key: e.target.value.toLowerCase() }))}
            className={`w-full rounded border px-2 py-1.5 font-mono text-xs ${
              keyValid || form.key === ''
                ? 'border-stone-300'
                : 'border-red-400 bg-red-50'
            }`}
            placeholder="ej. use_new_endpoint"
          />
          {!keyValid && form.key.length > 0 ? (
            <span className="mt-1 block text-[11px] text-red-600">
              Solo minúsculas, dígitos y guiones bajos
            </span>
          ) : null}
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-stone-600">% Despliegue</span>
          <input
            type="number"
            min={0}
            max={100}
            value={form.rollout_pct}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                rollout_pct: Math.max(0, Math.min(100, Number(e.target.value))),
              }))
            }
            className="w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
          />
        </label>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block text-xs font-medium text-stone-600">Descripción</span>
        <input
          type="text"
          value={form.description}
          maxLength={500}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          className="w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
          placeholder="(opcional)"
        />
      </label>

      <label className="inline-flex items-center gap-2 text-sm text-stone-700">
        <input
          type="checkbox"
          checked={form.enabled}
          onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
          className="h-4 w-4 rounded border-stone-300"
        />
        Activada al crear
      </label>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={disabled || !keyValid}
          className="rounded bg-stone-800 px-4 py-1.5 text-sm font-medium text-white hover:bg-stone-900 disabled:opacity-50"
        >
          Crear marca
        </button>
      </div>
    </form>
  )
}
