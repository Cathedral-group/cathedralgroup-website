'use client'

import { useState, useMemo } from 'react'
import DataTable from '@/components/admin/DataTable'
import StatusBadge from '@/components/admin/StatusBadge'

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
  source_page?: string
  zona?: string
  metros_cuadrados?: number
  presupuesto_rango?: string
  created_at: string
  [key: string]: unknown
}

const STATUSES = ['nuevo', 'contactado', 'presupuestado', 'aceptado', 'rechazado', 'completado']

const ORIGENES = [
  'Web (cathedralgroup.es)',
  'WhatsApp',
  'Instagram',
  'LinkedIn',
  'Pinterest',
  'Google Ads',
  'Google Business',
  'Referido / Boca a boca',
  'Llamada telefónica',
  'Email directo',
  'Evento / Feria',
  'Idealista / Portal inmobiliario',
  'Otro',
]

function KpiCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-white border border-neutral-100 px-4 py-3">
      <p className="text-[9px] font-bold uppercase tracking-widest text-neutral-400">{label}</p>
      <p className="text-lg font-medium text-neutral-900 mt-0.5">{value}</p>
      {hint && <p className="text-[10px] text-neutral-400 mt-0.5">{hint}</p>}
    </div>
  )
}

export default function LeadsTable({ leads: initialLeads }: { leads: Lead[] }) {
  const [leads, setLeads] = useState(initialLeads)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [filter, setFilter] = useState('')
  // ─── Patrón coherente Cathedral: 4 modos
  const [viewMode, setViewMode] = useState<'estado' | 'origen' | 'zona' | 'lista'>('estado')
  const [search, setSearch] = useState('')
  const [editingNotes, setEditingNotes] = useState('')
  const [converting, setConverting] = useState(false)
  const [converted, setConverted] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showNewForm, setShowNewForm] = useState(false)
  const [newLead, setNewLead] = useState({ nombre: '', email: '', phone: '', tipo_proyecto: '', zona: '', origen: 'Referido / Boca a boca', mensaje: '' })
  const [savingNewLead, setSavingNewLead] = useState(false)
  const [updatingOrigen, setUpdatingOrigen] = useState(false)
  const [deletingInline, setDeletingInline] = useState<string | null>(null)

  /* ───────── KPIs (patrón Cathedral) ───────── */
  const kpis = useMemo(() => {
    const nuevos = leads.filter(l => (l.lead_status || 'nuevo') === 'nuevo').length
    const contactados = leads.filter(l => l.lead_status === 'contactado').length
    const presupuestados = leads.filter(l => l.lead_status === 'presupuestado').length
    const aceptados = leads.filter(l => l.lead_status === 'aceptado' || l.lead_status === 'completado').length
    return { total: leads.length, nuevos, contactados, presupuestados, aceptados }
  }, [leads])

  /* ───────── Agrupación según viewMode ───────── */
  function leadGroupKey(l: Lead): { key: string; label: string } {
    if (viewMode === 'estado') {
      const k = l.lead_status || 'nuevo'
      return { key: k, label: k.charAt(0).toUpperCase() + k.slice(1) }
    }
    if (viewMode === 'origen') {
      const k = (l as Record<string, unknown>).origen as string || 'sin_origen'
      return { key: k, label: k === 'sin_origen' ? 'Sin origen' : k }
    }
    if (viewMode === 'zona') {
      const k = (l as Record<string, unknown>).zona as string || 'sin_zona'
      return { key: k, label: k === 'sin_zona' ? 'Sin zona' : k }
    }
    return { key: 'all', label: 'Todos' }
  }

  const filteredLeads = useMemo(() => {
    let result = filter ? leads.filter((l) => (l.lead_status || 'nuevo') === filter) : leads
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(l =>
        `${l.nombre} ${l.email} ${l.tipo_proyecto ?? ''} ${l.mensaje ?? ''} ${l.zona ?? ''}`.toLowerCase().includes(q)
      )
    }
    return result
  }, [leads, filter, search])

  const groupedLeads = useMemo(() => {
    if (viewMode === 'lista') return null
    const groups: Record<string, { label: string; items: Lead[] }> = {}
    for (const l of filteredLeads) {
      const { key, label } = leadGroupKey(l)
      if (!groups[key]) groups[key] = { label, items: [] }
      groups[key].items.push(l)
    }
    return groups
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredLeads, viewMode])

  const updateStatus = async (id: string, newStatus: string) => {
    try {
      const res = await fetch('/api/db/leads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, lead_status: newStatus }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Error ${res.status}`)
      }
      setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, lead_status: newStatus } : l)))
      if (selectedLead?.id === id) setSelectedLead({ ...selectedLead, lead_status: newStatus })
    } catch (err) {
      console.error('updateStatus:', err)
      alert('Error al cambiar estado: ' + (err instanceof Error ? err.message : 'Error desconocido'))
    }
  }

  const saveNotes = async () => {
    if (!selectedLead) return
    try {
      const res = await fetch('/api/db/leads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedLead.id, notes: editingNotes }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Error ${res.status}`)
      }
      setLeads(prev => prev.map(l => l.id === selectedLead.id ? { ...l, notes: editingNotes } : l))
      setSelectedLead({ ...selectedLead, notes: editingNotes })
    } catch (err) {
      console.error('saveNotes:', err)
      alert('Error al guardar notas: ' + (err instanceof Error ? err.message : 'Error desconocido'))
    }
  }

  const convertToClient = async () => {
    if (!selectedLead) return
    setConverting(true)
    try {
      const res = await fetch('/api/db/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: selectedLead.nombre,
          email: selectedLead.email,
          phone: selectedLead.phone || null,
          source: selectedLead.origen || 'directo',
          lead_id: selectedLead.id,
          type: 'particular',
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Error ${res.status}`)
      }
      const { data: client } = await res.json()
      if (client) {
        // Escribir converted_client_id de vuelta al lead para mantener el vínculo
        await fetch('/api/db/leads', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: selectedLead.id, converted_client_id: client.id }),
        })
        await updateStatus(selectedLead.id, 'aceptado')
        setConverted(true)
      }
    } catch (err) {
      console.error('convertToClient:', err)
      alert('Error al convertir a cliente: ' + (err instanceof Error ? err.message : 'Error desconocido'))
    } finally {
      setConverting(false)
    }
  }

  const deleteLeadInline = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('¿Mover este lead a la papelera?')) return
    setDeletingInline(id)
    try {
      const res = await fetch('/api/db/leads', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (res.ok) {
        setLeads(prev => prev.filter(l => l.id !== id))
        if (selectedLead?.id === id) setSelectedLead(null)
      } else {
        const { error } = await res.json()
        alert('Error: ' + (error || 'No se pudo eliminar'))
      }
    } catch { alert('Error de red') }
    setDeletingInline(null)
  }

  const openDetail = (lead: Lead) => {
    setSelectedLead(lead)
    setEditingNotes(lead.notes || '')
    setConverted(false)
  }

  const columns = [
    { key: 'nombre', label: 'Nombre' },
    { key: 'email', label: 'Email' },
    { key: 'tipo_proyecto', label: 'Tipo' },
    { key: 'zona', label: 'Zona' },
    {
      key: 'origen',
      label: 'Origen',
      render: (val: unknown) => {
        if (!val) return <span className="text-neutral-300">—</span>
        const s = String(val)
        // Shorten common origins for table display
        const short: Record<string, string> = {
          'Web (cathedralgroup.es)': 'Web',
          'Referido / Boca a boca': 'Referido',
          'Google Ads': 'G. Ads',
          'Google Business': 'G. Business',
          'Llamada telefónica': 'Llamada',
          'Email directo': 'Email',
          'Idealista / Portal inmobiliario': 'Idealista',
        }
        return <span className="text-xs text-neutral-500">{short[s] ?? s}</span>
      },
    },
    {
      key: 'lead_score',
      label: 'Score',
      render: (val: unknown) => {
        if (val == null || val === '') return <span className="text-neutral-300">—</span>
        const score = Number(val)
        const color = score >= 70 ? 'text-green-600' : score >= 40 ? 'text-amber-500' : 'text-red-500'
        return <span className={`text-xs font-bold tabular-nums ${color}`}>{score}</span>
      },
    },
    {
      key: 'lead_status',
      label: 'Estado',
      render: (val: unknown) => <StatusBadge status={String(val || 'nuevo')} />,
    },
    {
      key: 'created_at',
      label: 'Fecha',
      render: (val: unknown) => {
        if (!val) return '—'
        const d = new Date(String(val))
        return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-ES')
      },
    },
    {
      key: '_actions',
      label: '',
      render: (_: unknown, row: Record<string, unknown>) => (
        <button
          onClick={(e) => deleteLeadInline(String(row.id), e as React.MouseEvent)}
          disabled={deletingInline === String(row.id)}
          className="text-neutral-300 hover:text-red-500 transition-colors disabled:opacity-50"
          title="Eliminar lead"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      ),
    },
  ]

  return (
    <>
      {/* Search + New lead button */}
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, email, tipo, zona..."
          className="bg-neutral-50 border-0 focus:ring-1 focus:ring-primary px-4 py-2 text-sm w-full sm:w-80"
        />
        <button
          onClick={() => setShowNewForm(true)}
          className="bg-neutral-900 text-white px-5 py-2 text-xs font-bold uppercase tracking-widest hover:bg-[#5A5550] transition-colors ml-auto"
        >
          + Nuevo lead
        </button>
      </div>

      {/* New lead form */}
      {showNewForm && (
        <div className="bg-white border border-neutral-200 p-6 mb-6">
          <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-4">Nuevo lead manual</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">Nombre *</label>
              <input value={newLead.nombre} onChange={e => setNewLead({...newLead, nombre: e.target.value})} className="w-full bg-neutral-50 border-0 focus:ring-1 focus:ring-primary p-2 text-sm" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">Email</label>
              <input type="email" value={newLead.email} onChange={e => setNewLead({...newLead, email: e.target.value})} className="w-full bg-neutral-50 border-0 focus:ring-1 focus:ring-primary p-2 text-sm" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">Teléfono</label>
              <input value={newLead.phone} onChange={e => setNewLead({...newLead, phone: e.target.value})} className="w-full bg-neutral-50 border-0 focus:ring-1 focus:ring-primary p-2 text-sm" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">Tipo proyecto</label>
              <select value={newLead.tipo_proyecto} onChange={e => setNewLead({...newLead, tipo_proyecto: e.target.value})} className="w-full bg-neutral-50 border-0 focus:ring-1 focus:ring-primary p-2 text-sm">
                <option value="">Seleccionar</option>
                <option value="Reforma integral">Reforma integral</option>
                <option value="Reforma parcial">Reforma parcial</option>
                <option value="Interiorismo">Interiorismo</option>
                <option value="Cambio de uso">Cambio de uso</option>
                <option value="Obra nueva">Obra nueva</option>
                <option value="Otro">Otro</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">Zona</label>
              <input value={newLead.zona} onChange={e => setNewLead({...newLead, zona: e.target.value})} className="w-full bg-neutral-50 border-0 focus:ring-1 focus:ring-primary p-2 text-sm" placeholder="Ej: Salamanca" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">Origen *</label>
              <select value={newLead.origen} onChange={e => setNewLead({...newLead, origen: e.target.value})} className="w-full bg-neutral-50 border-0 focus:ring-1 focus:ring-primary p-2 text-sm">
                {ORIGENES.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>
          <div className="mb-4">
            <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">Notas</label>
            <textarea value={newLead.mensaje} onChange={e => setNewLead({...newLead, mensaje: e.target.value})} rows={2} className="w-full bg-neutral-50 border-0 focus:ring-1 focus:ring-primary p-2 text-sm" />
          </div>
          <div className="flex gap-3">
            <button
              onClick={async () => {
                if (!newLead.nombre || savingNewLead) return
                setSavingNewLead(true)
                try {
                  const res = await fetch('/api/db/leads', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      nombre: newLead.nombre,
                      email: newLead.email || '',
                      phone: newLead.phone || null,
                      tipo_proyecto: newLead.tipo_proyecto || null,
                      zona: newLead.zona || null,
                      origen: newLead.origen,
                      mensaje: newLead.mensaje || '',
                      lead_status: 'nuevo',
                    }),
                  })
                  if (!res.ok) {
                    const errBody = await res.json().catch(() => ({}))
                    alert('Error al guardar lead: ' + (errBody.error || `Error ${res.status}`))
                    return
                  }
                  const { data } = await res.json()
                  if (data) {
                    setLeads(prev => [data as Lead, ...prev])
                    setShowNewForm(false)
                    setNewLead({ nombre: '', email: '', phone: '', tipo_proyecto: '', zona: '', origen: 'Referido / Boca a boca', mensaje: '' })
                  }
                } finally {
                  setSavingNewLead(false)
                }
              }}
              disabled={savingNewLead}
              className="bg-[#5A5550] text-white px-6 py-2 text-xs font-bold uppercase tracking-widest hover:bg-neutral-700 transition-colors disabled:opacity-50"
            >
              {savingNewLead ? 'Guardando...' : 'Guardar lead'}
            </button>
            <button
              onClick={() => setShowNewForm(false)}
              className="text-neutral-500 hover:text-neutral-700 text-xs font-bold uppercase tracking-widest"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ─── KPIs Cathedral ─── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        <KpiCard label="Leads" value={String(kpis.total)} />
        <KpiCard label="Nuevos" value={String(kpis.nuevos)} hint="sin contactar" />
        <KpiCard label="Contactados" value={String(kpis.contactados)} />
        <KpiCard label="Presupuestados" value={String(kpis.presupuestados)} />
        <KpiCard label="Aceptados" value={String(kpis.aceptados)} />
      </div>

      {/* ─── Selector de modos coherente ─── */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mr-1">Vista:</span>
        {(['estado', 'origen', 'zona', 'lista'] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 transition-colors ${
              viewMode === mode
                ? 'bg-neutral-900 text-white'
                : 'bg-white border border-neutral-200 text-neutral-600 hover:border-neutral-400'
            }`}
          >
            Por {mode}
          </button>
        ))}

        {viewMode === 'lista' && (
          <>
            <div className="w-px h-5 bg-neutral-200 mx-1" />
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
          </>
        )}

        <span className="text-xs text-neutral-400 ml-auto self-center">
          {filteredLeads.length} resultados
        </span>
      </div>

      {/* ─── Vista lista (DataTable original) ─── */}
      {viewMode === 'lista' && (
        <DataTable
          columns={columns}
          data={filteredLeads as Record<string, unknown>[]}
          onRowClick={(row) => openDetail(row as Lead)}
        />
      )}

      {/* ─── Vista agrupada (estado/origen/zona) ─── */}
      {viewMode !== 'lista' && groupedLeads && (
        <div className="space-y-4">
          {Object.keys(groupedLeads).length === 0 && (
            <div className="bg-white border border-neutral-100 px-4 py-8 text-center text-sm text-neutral-400">
              Sin leads
            </div>
          )}
          {Object.entries(groupedLeads)
            .sort((a, b) => a[1].label.localeCompare(b[1].label, 'es'))
            .map(([key, group]) => (
              <div key={key} className="bg-white border border-neutral-100">
                <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/60">
                  <div className="flex items-center gap-3">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-700">{group.label}</h3>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                      {group.items.length} lead{group.items.length === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>
                <div className="divide-y divide-neutral-50">
                  {group.items.map((l) => (
                    <div
                      key={l.id}
                      onClick={() => openDetail(l)}
                      className="px-4 py-3 cursor-pointer hover:bg-neutral-50 transition-colors flex items-center gap-3"
                    >
                      <span className="text-sm font-medium flex-1 truncate">{l.nombre}</span>
                      <span className="hidden sm:inline text-xs text-neutral-400 w-40 truncate">{l.email || l.phone || '—'}</span>
                      <span className="hidden md:inline text-xs text-neutral-500 w-32 truncate">{l.tipo_proyecto || '—'}</span>
                      <span className="text-xs text-neutral-400 w-24 truncate">{(l as Record<string, unknown>).zona as string || '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Detail panel */}
      {selectedLead && (
        <div className="fixed inset-0 bg-black/30 z-50 flex justify-end" onClick={() => setSelectedLead(null)}>
          <div
            className="w-full md:max-w-md bg-white h-full overflow-y-auto pb-[env(safe-area-inset-bottom)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-neutral-100 p-6 flex justify-between items-start z-10">
              <div>
                <h2 className="text-lg font-medium">{selectedLead.nombre}</h2>
                <p className="text-sm text-neutral-500">{selectedLead.email}</p>
                {selectedLead.phone && (
                  <div className="flex items-center gap-3 mt-2">
                    <p className="text-sm">{selectedLead.phone}</p>
                    <a
                      href={`https://wa.me/${selectedLead.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent('Hola, le contactamos desde Cathedral Group respecto a su consulta.')}`}
                      target="_blank"
                      rel="noopener"
                      className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-green-600 hover:text-green-800 bg-green-50 px-2 py-1 rounded"
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                      </svg>
                      WhatsApp
                    </a>
                  </div>
                )}
              </div>
              <button onClick={() => setSelectedLead(null)} className="text-neutral-400 hover:text-neutral-900 text-xl">×</button>
            </div>

            <div className="p-6 space-y-4">
              {/* Key info */}
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
                  <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1">Superficie</p>
                  <p className="text-sm">{selectedLead.metros_cuadrados} m²</p>
                </div>
              )}
              {selectedLead.presupuesto_rango && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1">Presupuesto</p>
                  <p className="text-sm">{selectedLead.presupuesto_rango}</p>
                </div>
              )}
              {selectedLead.lead_score != null && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1">Puntuación</p>
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
              {/* Editable origen */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1">Origen</p>
                <select
                  value={selectedLead.origen || ''}
                  onChange={async (e) => {
                    if (updatingOrigen) return
                    const val = e.target.value
                    setUpdatingOrigen(true)
                    try {
                      const res = await fetch('/api/db/leads', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: selectedLead.id, origen: val }),
                      })
                      if (!res.ok) {
                        const errBody = await res.json().catch(() => ({}))
                        alert('Error al actualizar origen: ' + (errBody.error || `Error ${res.status}`))
                        return
                      }
                      setLeads(prev => prev.map(l => l.id === selectedLead.id ? { ...l, origen: val } : l))
                      setSelectedLead({ ...selectedLead, origen: val })
                    } finally {
                      setUpdatingOrigen(false)
                    }
                  }}
                  disabled={updatingOrigen}
                  className="w-full bg-neutral-50 border-0 focus:ring-1 focus:ring-primary p-2 text-sm disabled:opacity-50"
                >
                  <option value="">Sin origen</option>
                  {ORIGENES.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                {selectedLead.source_page && (
                  <p className="text-[10px] text-neutral-400 mt-1">Página: {selectedLead.source_page}</p>
                )}
              </div>

              {/* Editable notes */}
              <div className="pt-4 border-t border-neutral-100">
                <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-2">Notas internas</p>
                <textarea
                  value={editingNotes}
                  onChange={(e) => setEditingNotes(e.target.value)}
                  onBlur={saveNotes}
                  rows={3}
                  placeholder="Añadir notas sobre este lead..."
                  className="w-full bg-neutral-50 border-0 focus:ring-1 focus:ring-primary p-3 text-sm"
                />
                <p className="text-[10px] text-neutral-300 mt-1">Se guarda automáticamente</p>
              </div>

              {/* Status changer */}
              <div className="pt-4 border-t border-neutral-100">
                <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-3">Cambiar estado</p>
                <div className="flex flex-wrap gap-2">
                  {STATUSES.map((s) => (
                    <button
                      key={s}
                      onClick={() => updateStatus(selectedLead.id, s)}
                      className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 transition-colors ${
                        (selectedLead.lead_status || 'nuevo') === s
                          ? 'bg-neutral-900 text-white'
                          : 'bg-white border border-neutral-200 text-neutral-500 hover:border-primary'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Convert to client */}
              {selectedLead.lead_status !== 'aceptado' && selectedLead.lead_status !== 'completado' && !converted && (
                <div className="pt-4 border-t border-neutral-100">
                  <button
                    onClick={convertToClient}
                    disabled={converting}
                    className="w-full bg-green-600 text-white py-3 text-sm font-bold uppercase tracking-widest hover:bg-green-700 transition-colors disabled:opacity-50"
                  >
                    {converting ? '...' : 'Convertir a cliente'}
                  </button>
                  <p className="text-[10px] text-neutral-400 mt-2 text-center">
                    Crea un nuevo cliente con los datos de este lead
                  </p>
                </div>
              )}
              {converted && (
                <div className="pt-4 border-t border-neutral-100">
                  <div className="bg-green-50 p-4 text-center">
                    <p className="text-sm font-medium text-green-700">Cliente creado correctamente</p>
                    <a href="/admin/clientes" className="text-xs text-green-600 hover:underline mt-1 inline-block">
                      Ver en clientes →
                    </a>
                  </div>
                </div>
              )}

              {/* Delete lead */}
              <div className="pt-4 border-t border-neutral-100">
                <button
                  onClick={async () => {
                    if (!confirm('Mover este lead a la papelera?')) return
                    setDeleting(true)
                    const res = await fetch('/api/db/leads', {
                      method: 'DELETE',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ id: selectedLead.id }),
                    })
                    if (res.ok) {
                      setLeads(prev => prev.filter(l => l.id !== selectedLead.id))
                      setSelectedLead(null)
                    } else {
                      const { error } = await res.json()
                      alert('Error al eliminar: ' + (error || res.status))
                    }
                    setDeleting(false)
                  }}
                  disabled={deleting}
                  className="w-full text-red-500 hover:text-red-700 hover:bg-red-50 py-2 text-xs font-bold uppercase tracking-widest transition-colors disabled:opacity-50"
                >
                  {deleting ? '...' : 'Eliminar lead'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
