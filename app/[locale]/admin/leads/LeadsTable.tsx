'use client'

import { useState } from 'react'
import DataTable from '@/components/admin/DataTable'
import StatusBadge from '@/components/admin/StatusBadge'
import { createClient } from '@/lib/supabase'

interface Lead {
  id: string
  nombre: string
  email: string
  telefono?: string
  tipo_proyecto?: string
  zona?: string
  metros_cuadrados?: number
  presupuesto_rango?: string
  mensaje?: string
  estado?: string
  source_page?: string
  created_at: string
  [key: string]: unknown
}

const STATUSES = ['nuevo', 'contactado', 'presupuestado', 'aceptado', 'rechazado', 'completado']

export default function LeadsTable({ leads: initialLeads }: { leads: Lead[] }) {
  const [leads, setLeads] = useState(initialLeads)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [filter, setFilter] = useState('')

  const filteredLeads = filter
    ? leads.filter((l) => l.estado === filter)
    : leads

  const updateStatus = async (id: string, estado: string) => {
    const supabase = createClient()
    await supabase.from('leads').update({ estado }).eq('id', id)
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, estado } : l)))
    if (selectedLead?.id === id) setSelectedLead({ ...selectedLead, estado })
  }

  const columns = [
    { key: 'nombre', label: 'Nombre' },
    { key: 'email', label: 'Email' },
    { key: 'tipo_proyecto', label: 'Tipo' },
    { key: 'zona', label: 'Zona' },
    {
      key: 'estado',
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
          const count = leads.filter((l) => (l.estado || 'nuevo') === s).length
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
              {selectedLead.telefono && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1">Teléfono</p>
                  <p className="text-sm">{selectedLead.telefono}</p>
                </div>
              )}
              {selectedLead.tipo_proyecto && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1">Tipo proyecto</p>
                  <p className="text-sm">{selectedLead.tipo_proyecto}</p>
                </div>
              )}
              {selectedLead.zona && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1">Zona</p>
                  <p className="text-sm">{selectedLead.zona}</p>
                </div>
              )}
              {selectedLead.metros_cuadrados && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1">m²</p>
                  <p className="text-sm">{selectedLead.metros_cuadrados}</p>
                </div>
              )}
              {selectedLead.presupuesto_rango && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1">Presupuesto</p>
                  <p className="text-sm">{selectedLead.presupuesto_rango}</p>
                </div>
              )}
              {selectedLead.mensaje && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1">Mensaje</p>
                  <p className="text-sm bg-neutral-50 p-3">{selectedLead.mensaje}</p>
                </div>
              )}
              {selectedLead.source_page && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1">Origen</p>
                  <p className="text-sm">{selectedLead.source_page}</p>
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
                        (selectedLead.estado || 'nuevo') === s
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
