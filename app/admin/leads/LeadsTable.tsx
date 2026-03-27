'use client'

import { useState } from 'react'
import DataTable from '@/components/admin/DataTable'
import StatusBadge from '@/components/admin/StatusBadge'
import { createClient } from '@/lib/supabase'

interface Lead {
  id: string
  nombre: string
  email: string
  phone?: string
  tipo_proyecto?: string
  mensaje?: string
  lead_status?: string
  lead_score?: number
  lead_summary?: string
  budget_estimate?: string
  assigned_to?: string
  notes?: string
  origen?: string
  created_at: string
  [key: string]: unknown
}

const STATUSES = ['nuevo', 'contactado', 'presupuestado', 'aceptado', 'rechazado', 'completado']

export default function LeadsTable({ leads: initialLeads }: { leads: Lead[] }) {
  const [leads, setLeads] = useState(initialLeads)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [filter, setFilter] = useState('')

  const filteredLeads = filter
    ? leads.filter((l) => l.lead_status === filter)
    : leads

  const updateStatus = async (id: string, estado: string) => {
    const supabase = createClient()
    await supabase.from('leads').update({ lead_status: estado }).eq('id', id)
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, estado } : l)))
    if (selectedLead?.id === id) setSelectedLead({ ...selectedLead, estado })
  }

  const columns = [
    { key: 'nombre', label: 'Nombre' },
    { key: 'email', label: 'Email' },
    { key: 'tipo_proyecto', label: 'Tipo' },
    { key: 'budget_estimate', label: 'Presupuesto' },
    {
      key: 'lead_status',
      label: 'Estado',
      render: (val: unknown) => <StatusBadge status={String(val || 'nuevo')} />,
    },
    {
      key: 'created_at',
      label: 'Fecha',
      render: (val: unknown) => new Date(String(val)).toLocaleDateString('es-ES'),
    },
  ]

  return (
    <>
      {/* Filters */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <button
          onClick={() => setFilter('')}
          className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1 transition-colors ${
            !filter ? 'bg-neutral-900 text-white' : 'bg-white border border-neutral-200 text-neutral-600 hover:border-primary'
          }`}
        >
          Todos ({leads.length})
        </button>
        {STATUSES.map((s) => {
          const count = leads.filter((l) => (l.lead_status || 'nuevo') === s).length
          if (count === 0) return null
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1 transition-colors ${
                filter === s ? 'bg-neutral-900 text-white' : 'bg-white border border-neutral-200 text-neutral-600 hover:border-primary'
              }`}
            >
              {s} ({count})
            </button>
          )
        })}
      </div>

      <DataTable
        columns={columns}
        data={filteredLeads as Record<string, unknown>[]}
        onRowClick={(row) => setSelectedLead(row as Lead)}
      />

      {/* Detail panel */}
      {selectedLead && (
        <div className="fixed inset-0 bg-black/30 z-50 flex justify-end" onClick={() => setSelectedLead(null)}>
          <div
            className="w-full max-w-md bg-white h-full overflow-y-auto p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-8">
              <div>
                <h2 className="text-lg font-medium">{selectedLead.nombre}</h2>
                <p className="text-sm text-neutral-500">{selectedLead.email}</p>
              </div>
              <button onClick={() => setSelectedLead(null)} className="text-neutral-400 hover:text-neutral-900">
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {selectedLead.phone && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1">Teléfono</p>
                  <p className="text-sm">{selectedLead.phone}</p>
                </div>
              )}
              {selectedLead.tipo_proyecto && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1">Tipo proyecto</p>
                  <p className="text-sm">{selectedLead.tipo_proyecto}</p>
                </div>
              )}
              {selectedLead.budget_estimate && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1">Presupuesto</p>
                  <p className="text-sm">{selectedLead.budget_estimate}</p>
                </div>
              )}
              {selectedLead.lead_score != null && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1">Score</p>
                  <p className="text-sm">{selectedLead.lead_score}/100</p>
                </div>
              )}
              {selectedLead.lead_summary && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1">Resumen IA</p>
                  <p className="text-sm bg-neutral-50 p-3">{selectedLead.lead_summary}</p>
                </div>
              )}
              {selectedLead.mensaje && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1">Mensaje</p>
                  <p className="text-sm bg-neutral-50 p-3">{selectedLead.mensaje}</p>
                </div>
              )}
              {selectedLead.origen && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1">Origen</p>
                  <p className="text-sm">{selectedLead.origen}</p>
                </div>
              )}
              {selectedLead.notes && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1">Notas</p>
                  <p className="text-sm">{selectedLead.notes}</p>
                </div>
              )}

              {/* Status changer */}
              <div className="pt-4 border-t border-neutral-100">
                <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-3">Cambiar estado</p>
                <div className="flex flex-wrap gap-2">
                  {STATUSES.map((s) => (
                    <button
                      key={s}
                      onClick={() => updateStatus(selectedLead.id, s)}
                      className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 border transition-colors ${
                        (selectedLead.lead_status || 'nuevo') === s
                          ? 'bg-primary text-white border-primary'
                          : 'border-neutral-200 hover:border-primary'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
