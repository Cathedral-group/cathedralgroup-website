'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

interface Diagnosis {
  id: string
  dispatch_id: number | null
  agent_name: string
  diagnosis: string
  proposed_fix: string | null
  confidence: number | null
  citations: unknown
  model_version: string | null
  tokens_used: number | null
  cost_usd: string | number | null
  status: string
  is_test: boolean
  created_at: string
}

interface Props {
  initialDiagnoses: Diagnosis[]
}

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Pendiente', cls: 'bg-amber-100 text-amber-800' },
  approved: { label: 'Aprobado', cls: 'bg-emerald-100 text-emerald-800' },
  rejected: { label: 'Rechazado', cls: 'bg-red-100 text-red-800' },
  applied: { label: 'Aplicado', cls: 'bg-blue-100 text-blue-800' },
  reverted: { label: 'Revertido', cls: 'bg-stone-100 text-stone-600' },
}

const AGENT_LABELS: Record<string, string> = {
  health_monitor: '🩺 Health Monitor',
  bug_diagnose: '🐛 Bug Diagnose',
  pre_deploy_validator: '✅ Pre-Deploy Validator',
  project_classifier: '📂 Project Classifier',
  director: '🎯 Director',
  slo_monitor: '📊 SLO Monitor',
}

function confidenceBadge(c: number | null): string {
  if (c === null || c === undefined) return 'bg-stone-100 text-stone-600'
  if (c < 0.5) return 'bg-red-100 text-red-800'
  if (c < 0.8) return 'bg-amber-100 text-amber-800'
  return 'bg-emerald-100 text-emerald-800'
}

function formatDate(s: string): string {
  try {
    return new Date(s).toLocaleString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return s
  }
}

function formatCost(c: string | number | null): string {
  if (c === null || c === undefined) return '—'
  const n = typeof c === 'string' ? parseFloat(c) : c
  if (!Number.isFinite(n)) return '—'
  return `$${n.toFixed(6)}`
}

export default function DiagnosesView({ initialDiagnoses }: Props) {
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>(initialDiagnoses)
  const [filter, setFilter] = useState<'pending' | 'all'>('pending')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const filtered = useMemo(() => {
    if (filter === 'all') return diagnoses
    return diagnoses.filter((d) => d.status === filter)
  }, [diagnoses, filter])

  const counts = useMemo(
    () => ({
      pending: diagnoses.filter((d) => d.status === 'pending').length,
      total: diagnoses.length,
    }),
    [diagnoses],
  )

  async function approve(id: string) {
    setBusyId(id)
    setError(null)
    try {
      const res = await fetch(`/api/agents/diagnoses/${id}/approve`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Error al aprobar')
        return
      }
      setDiagnoses((prev) => prev.map((d) => (d.id === id ? { ...d, ...json.diagnosis } : d)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red')
    } finally {
      setBusyId(null)
    }
  }

  async function reject(id: string) {
    const reason = prompt('Motivo del rechazo (opcional):')
    if (reason === null) return
    setBusyId(id)
    setError(null)
    try {
      const res = await fetch(`/api/agents/diagnoses/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() || null }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Error al rechazar')
        return
      }
      setDiagnoses((prev) => prev.map((d) => (d.id === id ? { ...d, ...json.diagnosis } : d)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-5">
          <div className="flex items-center gap-3 text-sm text-stone-500">
            <Link href="/admin" className="hover:text-stone-900">
              Admin
            </Link>
            <span>›</span>
            <span className="text-stone-900">Agentes › Diagnósticos</span>
          </div>
          <h1 className="mt-2 text-2xl font-light text-stone-900">Diagnósticos agentes IA</h1>
          <p className="mt-1 text-sm text-stone-600">
            Op 2 event-driven. Cada diagnóstico requiere tu revisión antes de aplicar. {' '}
            <span className="font-medium text-stone-900">Aprobado</span> = autorizado;{' '}
            <strong className="text-stone-900">no implica fix desplegado al repo</strong>.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-6">
        <div className="mb-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFilter('pending')}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              filter === 'pending'
                ? 'bg-stone-900 text-white'
                : 'bg-white text-stone-700 hover:bg-stone-100'
            }`}
          >
            Pendientes ({counts.pending})
          </button>
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              filter === 'all'
                ? 'bg-stone-900 text-white'
                : 'bg-white text-stone-700 hover:bg-stone-100'
            }`}
          >
            Todos ({counts.total})
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="rounded-lg border border-stone-200 bg-white p-8 text-center text-sm text-stone-500">
            No hay diagnósticos {filter === 'pending' ? 'pendientes' : ''}.
          </div>
        ) : (
          <ul className="space-y-3">
            {filtered.map((d) => {
              const sl = STATUS_LABELS[d.status] ?? { label: d.status, cls: 'bg-stone-100 text-stone-700' }
              const agent = AGENT_LABELS[d.agent_name] ?? d.agent_name
              const confPct = d.confidence !== null && d.confidence !== undefined
                ? `${Math.round(d.confidence * 100)}%`
                : '—'
              const isPending = d.status === 'pending'
              const isBusy = busyId === d.id
              return (
                <li key={d.id} className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-stone-900">{agent}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${sl.cls}`}>{sl.label}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${confidenceBadge(d.confidence)}`}>
                        confianza {confPct}
                      </span>
                      {d.model_version && (
                        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600">
                          {d.model_version}
                        </span>
                      )}
                    </div>
                    <div className="text-right text-xs text-stone-500">
                      <div>{formatDate(d.created_at)}</div>
                      <div className="mt-0.5">
                        {formatCost(d.cost_usd)} · {d.tokens_used ?? 0} tokens
                      </div>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="text-xs font-medium uppercase tracking-wide text-stone-500">
                      Diagnóstico
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-stone-900">{d.diagnosis}</p>
                  </div>

                  {d.proposed_fix && (
                    <div className="mt-3">
                      <div className="text-xs font-medium uppercase tracking-wide text-stone-500">
                        Fix propuesto
                      </div>
                      <pre className="mt-1 overflow-x-auto rounded bg-stone-50 p-3 text-xs font-mono text-stone-800 whitespace-pre-wrap">
                        {d.proposed_fix}
                      </pre>
                    </div>
                  )}

                  {isPending && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => approve(d.id)}
                        disabled={isBusy}
                        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {isBusy ? 'Aprobando…' : 'Aprobar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => reject(d.id)}
                        disabled={isBusy}
                        className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        Rechazar
                      </button>
                    </div>
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
