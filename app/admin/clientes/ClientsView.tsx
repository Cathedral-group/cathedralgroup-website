'use client'

import { useState, useMemo } from 'react'
import DataTable from '@/components/admin/DataTable'
import TabPanel from '@/components/admin/TabPanel'

/* ───────── Types ───────── */

interface Client {
  id: string
  name: string
  email?: string | null
  phone?: string | null
  address?: string | null
  nif_cif?: string | null
  company_name?: string | null
  type?: string | null
  preferred_contact?: string | null
  source?: string | null
  notes?: string | null
  created_at: string
  [key: string]: unknown
}

interface Project {
  id: string
  code: string
  name: string
  client_id?: string | null
  status?: string | null
}

interface Invoice {
  id: string
  numero?: string | null
  number?: string | null
  concepto?: string | null
  concept?: string | null
  tipo?: string | null
  direction?: string | null
  total?: number | null
  amount_total?: number | null
  estado?: string | null
  payment_status?: string | null
  proyecto_code?: string | null
  issue_date?: string | null
}

interface Communication {
  id: string
  entity_type: string
  entity_id: string
  date: string
  type: string
  summary: string
}

/* ───────── Constants ───────── */

const CLIENT_TYPES = ['particular', 'empresa', 'inversor']
const PREFERRED_CONTACTS = ['email', 'phone', 'whatsapp']
const SOURCES = ['web', 'referido', 'directo', 'otro']
const COMM_TYPES = ['llamada', 'email', 'whatsapp', 'reunion']

const TYPE_STYLES: Record<string, string> = {
  particular: 'bg-blue-50 text-blue-700',
  empresa: 'bg-purple-50 text-purple-700',
  inversor: 'bg-green-50 text-green-700',
}

const STATUS_STYLES: Record<string, string> = {
  presupuesto: 'bg-neutral-100 text-neutral-700',
  en_curso: 'bg-blue-50 text-blue-700',
  completado: 'bg-green-50 text-green-700',
  cancelado: 'bg-red-50 text-red-700',
}

/* ───────── Helpers ───────── */

function Badge({ value, styles }: { value: string; styles: Record<string, string> }) {
  const s = styles[value] || 'bg-neutral-100 text-neutral-600'
  return (
    <span className={`inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${s}`}>
      {value.replace(/_/g, ' ')}
    </span>
  )
}

function currency(v?: number | null) {
  if (v == null) return '\u2014'
  return v.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}

function formatDate(d: string | null | undefined) {
  if (!d) return '\u2014'
  const dateStr = d.includes('T') ? d : d + 'T00:00:00'
  return new Date(dateStr).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

function whatsappLink(phone: string) {
  const clean = phone.replace(/\D/g, '')
  return `https://wa.me/${clean}`
}

/* ───────── Component ───────── */

interface Props {
  clients: Client[]
  projects: Project[]
  invoices: Invoice[]
  communications: Communication[]
}

export default function ClientsView({ clients: initialClients, projects, invoices, communications: initialComms }: Props) {
  const [clients, setClients] = useState(initialClients)
  const [comms, setComms] = useState(initialComms)
  const [selected, setSelected] = useState<Client | null>(null)
  const [typeFilter, setTypeFilter] = useState('')
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState('datos')
  const [saving, setSaving] = useState(false)
  const [editForm, setEditForm] = useState<Partial<Client>>({})
  const [deletingInline, setDeletingInline] = useState<string | null>(null)

  // Communications inline form
  const [commForm, setCommForm] = useState({ type: 'llamada', summary: '', date: new Date().toISOString().slice(0, 10) })
  const [savingComm, setSavingComm] = useState(false)

  /* ───────── Derived data ───────── */

  const projectsByClient = useMemo(() => {
    const m: Record<string, Project[]> = {}
    projects.forEach((p) => {
      if (p.client_id) {
        if (!m[p.client_id]) m[p.client_id] = []
        m[p.client_id].push(p)
      }
    })
    return m
  }, [projects])

  // Map project codes to client IDs
  const projectCodeToClientId = useMemo(() => {
    const m: Record<string, string> = {}
    projects.forEach((p) => {
      if (p.client_id && p.code) m[p.code] = p.client_id
    })
    return m
  }, [projects])

  const invoiceTotalsByClient = useMemo(() => {
    const m: Record<string, number> = {}
    invoices.forEach((inv) => {
      if (!inv.proyecto_code) return
      const clientId = projectCodeToClientId[inv.proyecto_code]
      if (!clientId) return
      const total = inv.amount_total ?? inv.total ?? 0
      m[clientId] = (m[clientId] || 0) + total
    })
    return m
  }, [invoices, projectCodeToClientId])

  const filtered = useMemo(() => {
    let list = clients
    if (typeFilter) list = list.filter((c) => c.type === typeFilter)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(
        (c) =>
          c.name?.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q) ||
          c.phone?.includes(q) ||
          c.company_name?.toLowerCase().includes(q)
      )
    }
    return list
  }, [clients, typeFilter, search])

  /* ───────── Helpers ───────── */

  const labelCls = 'text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-2'
  const inputCls = 'w-full bg-neutral-50 border-0 focus:ring-1 focus:ring-primary p-3 text-sm'

  function openDetail(client: Client) {
    setSelected(client)
    setEditForm({ ...client })
    setActiveTab('datos')
  }

  function closeDetail() {
    setSelected(null)
    setEditForm({})
  }

  /* ───────── CRUD ───────── */

  async function saveClient() {
    if (!selected) return
    setSaving(true)
    const { id, created_at, ...rest } = editForm as Client
    void id; void created_at
    try {
      const res = await fetch('/api/db/clients', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id, ...rest }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Error ${res.status}`)
      }
      const updated = { ...selected, ...rest }
      setClients((prev) => prev.map((c) => (c.id === selected.id ? updated : c)))
      setSelected(updated)
    } catch (err) {
      console.error('saveClient:', err)
      alert('Error al guardar: ' + (err instanceof Error ? err.message : 'Error desconocido'))
    } finally {
      setSaving(false)
    }
  }

  async function deleteClient() {
    if (!selected || !confirm('Mover este cliente a la papelera?')) return
    try {
      const res = await fetch('/api/db/clients', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Error ${res.status}`)
      }
      setClients((prev) => prev.filter((c) => c.id !== selected.id))
      closeDetail()
    } catch (err) {
      console.error('deleteClient:', err)
      alert('Error al eliminar: ' + (err instanceof Error ? err.message : 'Error desconocido'))
    }
  }

  const deleteClientInline = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('¿Mover este cliente a la papelera?')) return
    setDeletingInline(id)
    try {
      const res = await fetch('/api/db/clients', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (res.ok) {
        setClients(prev => prev.filter(c => c.id !== id))
        if (selected?.id === id) closeDetail()
      } else {
        const body = await res.json().catch(() => ({}))
        alert('Error: ' + (body.error || 'No se pudo eliminar'))
      }
    } catch { alert('Error de red') }
    setDeletingInline(null)
  }

  async function addCommunication() {
    if (!selected || !commForm.summary.trim()) return
    setSavingComm(true)
    const payload = {
      entity_type: 'client',
      entity_id: selected.id,
      date: commForm.date,
      type: commForm.type,
      summary: commForm.summary.trim(),
    }
    try {
      const res = await fetch('/api/db/communications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Error ${res.status}`)
      }
      const { data } = await res.json()
      if (data) {
        setComms((prev) => [data as Communication, ...prev])
        setCommForm({ type: 'llamada', summary: '', date: new Date().toISOString().slice(0, 10) })
      }
    } catch (err) {
      console.error('addCommunication:', err)
      alert('Error al añadir comunicación: ' + (err instanceof Error ? err.message : 'Error desconocido'))
    } finally {
      setSavingComm(false)
    }
  }

  /* ───────── Field helper ───────── */

  function Field({ label, name, type = 'text' }: { label: string; name: keyof Client; type?: string }) {
    if (type === 'textarea') {
      return (
        <div>
          <label className={labelCls}>{label}</label>
          <textarea
            value={String(editForm[name] ?? '')}
            onChange={(e) => setEditForm({ ...editForm, [name]: e.target.value })}
            rows={3}
            className={inputCls}
          />
        </div>
      )
    }
    return (
      <div>
        <label className={labelCls}>{label}</label>
        <input
          type={type}
          value={String(editForm[name] ?? '')}
          onChange={(e) => setEditForm({ ...editForm, [name]: e.target.value })}
          className={inputCls}
        />
      </div>
    )
  }

  function SelectField({ label, name, options }: { label: string; name: keyof Client; options: string[] }) {
    return (
      <div>
        <label className={labelCls}>{label}</label>
        <select
          value={String(editForm[name] ?? '')}
          onChange={(e) => setEditForm({ ...editForm, [name]: e.target.value || null })}
          className={inputCls}
        >
          <option value="">Seleccionar...</option>
          {options.map((o) => (
            <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>
          ))}
        </select>
      </div>
    )
  }

  /* ───────── Derived for selected ───────── */

  const clientProjects = selected ? (projectsByClient[selected.id] || []) : []
  const clientInvoices = selected
    ? invoices.filter((inv) => {
        if (!inv.proyecto_code) return false
        return projectCodeToClientId[inv.proyecto_code] === selected.id
      })
    : []
  const clientTotalInvoiced = clientInvoices.reduce((s, i) => s + (i.amount_total ?? i.total ?? 0), 0)
  const clientComms = selected ? comms.filter((c) => c.entity_id === selected.id) : []

  /* ───────── Table columns ───────── */

  const columns = [
    { key: 'name', label: 'Nombre' },
    { key: 'email', label: 'Email' },
    {
      key: 'phone',
      label: 'Telefono',
      render: (val: unknown) => {
        const phone = String(val ?? '')
        if (!phone || phone === '\u2014') return <span>\u2014</span>
        return (
          <a
            href={whatsappLink(phone)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-green-600 hover:text-green-800 underline"
          >
            {phone}
          </a>
        )
      },
    },
    {
      key: 'type',
      label: 'Tipo',
      render: (val: unknown) =>
        val ? <Badge value={String(val)} styles={TYPE_STYLES} /> : <span>\u2014</span>,
    },
    {
      key: '_projects',
      label: 'Proyectos',
      render: (_: unknown, row: Record<string, unknown>) => {
        const count = (projectsByClient[String(row.id)] || []).length
        return <span>{count}</span>
      },
    },
    {
      key: '_total',
      label: 'Total facturado',
      render: (_: unknown, row: Record<string, unknown>) => {
        const total = invoiceTotalsByClient[String(row.id)]
        return <span className="tabular-nums">{currency(total)}</span>
      },
    },
    {
      key: '_actions',
      label: '',
      render: (_: unknown, row: Record<string, unknown>) => (
        <button
          onClick={(e) => deleteClientInline(String(row.id), e as React.MouseEvent)}
          disabled={deletingInline === String(row.id)}
          className="text-neutral-300 hover:text-red-500 transition-colors disabled:opacity-50"
          title="Eliminar cliente"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      ),
    },
  ]

  /* ───────── RENDER ───────── */

  return (
    <>
      {/* Header + Search */}
      <div className="flex flex-wrap items-center gap-3 justify-between mb-6">
        <h1 className="text-xl font-medium uppercase tracking-wide">Clientes</h1>
        <input
          type="text"
          placeholder="Buscar cliente..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-neutral-50 border-0 focus:ring-1 focus:ring-primary px-4 py-2 text-sm w-full sm:w-64"
        />
      </div>

      {/* Type filters */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <button
          onClick={() => setTypeFilter('')}
          className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1 transition-colors ${
            !typeFilter ? 'bg-neutral-900 text-white' : 'bg-white border border-neutral-200 text-neutral-600 hover:border-primary'
          }`}
        >
          Todos ({clients.length})
        </button>
        {CLIENT_TYPES.map((t) => {
          const count = clients.filter((c) => c.type === t).length
          return (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1 transition-colors ${
                typeFilter === t ? 'bg-neutral-900 text-white' : 'bg-white border border-neutral-200 text-neutral-600 hover:border-primary'
              }`}
            >
              {t} ({count})
            </button>
          )
        })}
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={filtered as Record<string, unknown>[]}
        onRowClick={(row) => openDetail(row as Client)}
      />

      {/* Detail slide-out panel */}
      {selected && (
        <div className="fixed inset-0 bg-black/30 z-50 flex justify-end" onClick={closeDetail}>
          <div
            className="w-full md:max-w-xl bg-white h-full overflow-y-auto p-4 md:p-8 pb-[env(safe-area-inset-bottom)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-lg font-medium">{selected.name}</h2>
                {selected.company_name && (
                  <p className="text-sm text-neutral-500">{selected.company_name}</p>
                )}
                {selected.type && (
                  <div className="mt-1">
                    <Badge value={selected.type} styles={TYPE_STYLES} />
                  </div>
                )}
              </div>
              <button onClick={closeDetail} className="text-neutral-400 hover:text-neutral-900 text-lg">
                ✕
              </button>
            </div>

            {/* Tabs */}
            <TabPanel
              tabs={[
                { key: 'datos', label: 'Datos' },
                { key: 'proyectos', label: 'Proyectos' },
                { key: 'facturas', label: 'Facturas' },
                { key: 'comunicaciones', label: 'Comunicaciones' },
              ]}
              activeTab={activeTab}
              onTabChange={setActiveTab}
            >
              {/* ─── Tab: Datos ─── */}
              {activeTab === 'datos' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Nombre" name="name" />
                    <Field label="Empresa" name="company_name" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Email" name="email" type="email" />
                    <Field label="Telefono" name="phone" />
                  </div>
                  <Field label="Direccion" name="address" />
                  <Field label="NIF/CIF" name="nif_cif" />
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <SelectField label="Tipo" name="type" options={CLIENT_TYPES} />
                    <SelectField label="Contacto preferido" name="preferred_contact" options={PREFERRED_CONTACTS} />
                    <SelectField label="Origen" name="source" options={SOURCES} />
                  </div>
                  <Field label="Notas" name="notes" type="textarea" />

                  <div className="flex gap-3 pt-4 border-t border-neutral-100">
                    <button
                      onClick={saveClient}
                      disabled={saving}
                      className="bg-primary text-white px-6 py-2 text-[10px] font-bold uppercase tracking-widest hover:bg-primary/90 disabled:opacity-50"
                    >
                      {saving ? 'Guardando...' : 'Guardar'}
                    </button>
                    <button
                      onClick={deleteClient}
                      className="bg-white border border-red-200 text-red-600 px-6 py-2 text-[10px] font-bold uppercase tracking-widest hover:bg-red-50"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              )}

              {/* ─── Tab: Proyectos ─── */}
              {activeTab === 'proyectos' && (
                <div className="space-y-3">
                  {clientProjects.length > 0 ? (
                    clientProjects.map((p) => (
                      <a
                        key={p.id}
                        href={`/admin/proyectos?id=${p.id}`}
                        className="flex items-center justify-between bg-neutral-50 p-3 hover:bg-neutral-100 transition-colors"
                      >
                        <div>
                          <p className="text-sm font-medium">{p.name}</p>
                          <p className="text-[10px] text-neutral-400 uppercase tracking-widest">{p.code}</p>
                        </div>
                        <Badge value={p.status || 'presupuesto'} styles={STATUS_STYLES} />
                      </a>
                    ))
                  ) : (
                    <p className="text-sm text-neutral-400 py-4 text-center">Sin proyectos vinculados</p>
                  )}
                </div>
              )}

              {/* ─── Tab: Facturas ─── */}
              {activeTab === 'facturas' && (
                <div className="space-y-4">
                  {clientInvoices.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-neutral-100">
                            <th className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-neutral-400">N</th>
                            <th className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Concepto</th>
                            <th className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Proyecto</th>
                            <th className="text-right px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Total</th>
                            <th className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Estado</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-50">
                          {clientInvoices.map((inv) => (
                            <tr key={inv.id}>
                              <td className="px-3 py-2">{inv.number || inv.numero || '\u2014'}</td>
                              <td className="px-3 py-2 max-w-[160px] truncate">{inv.concept || inv.concepto || '\u2014'}</td>
                              <td className="px-3 py-2 text-[10px] uppercase tracking-widest text-neutral-400">{inv.proyecto_code || '\u2014'}</td>
                              <td className="px-3 py-2 text-right font-medium tabular-nums">{currency(inv.amount_total ?? inv.total)}</td>
                              <td className="px-3 py-2">
                                <Badge value={inv.payment_status || inv.estado || 'pendiente'} styles={{
                                  pendiente: 'bg-amber-50 text-amber-700',
                                  pagada: 'bg-green-50 text-green-700',
                                  cobrada: 'bg-green-50 text-green-700',
                                  vencida: 'bg-red-50 text-red-700',
                                }} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="border-t-2 border-neutral-200">
                          <tr>
                            <td colSpan={3} className="px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                              Total facturado
                            </td>
                            <td className="px-3 py-3 text-right font-medium text-green-600">{currency(clientTotalInvoiced)}</td>
                            <td />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm text-neutral-400 py-4 text-center">Sin facturas vinculadas</p>
                  )}
                </div>
              )}

              {/* ─── Tab: Comunicaciones ─── */}
              {activeTab === 'comunicaciones' && (
                <div className="space-y-4">
                  {/* Add new communication */}
                  <div className="border border-neutral-200 p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>Tipo</label>
                        <select
                          value={commForm.type}
                          onChange={(e) => setCommForm({ ...commForm, type: e.target.value })}
                          className={inputCls}
                        >
                          {COMM_TYPES.map((t) => (
                            <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>Fecha</label>
                        <input
                          type="date"
                          value={commForm.date}
                          onChange={(e) => setCommForm({ ...commForm, date: e.target.value })}
                          className={inputCls}
                        />
                      </div>
                    </div>
                    <div>
                      <label className={labelCls}>Resumen</label>
                      <textarea
                        value={commForm.summary}
                        onChange={(e) => setCommForm({ ...commForm, summary: e.target.value })}
                        rows={2}
                        placeholder="Resumen de la comunicacion..."
                        className={inputCls}
                      />
                    </div>
                    <button
                      onClick={addCommunication}
                      disabled={savingComm || !commForm.summary.trim()}
                      className="bg-primary text-white px-4 py-2 text-[10px] font-bold uppercase tracking-widest hover:bg-primary/90 disabled:opacity-50"
                    >
                      {savingComm ? '...' : '+ Anadir'}
                    </button>
                  </div>

                  {/* Communications log */}
                  {clientComms.length > 0 ? (
                    clientComms.map((c) => (
                      <div key={c.id} className="bg-neutral-50 p-3">
                        <div className="flex items-center gap-3 mb-1">
                          <Badge value={c.type} styles={{
                            llamada: 'bg-blue-50 text-blue-700',
                            email: 'bg-purple-50 text-purple-700',
                            whatsapp: 'bg-green-50 text-green-700',
                            reunion: 'bg-amber-50 text-amber-700',
                          }} />
                          <span className="text-[10px] text-neutral-400">{formatDate(c.date)}</span>
                        </div>
                        <p className="text-sm">{c.summary}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-neutral-400 py-4 text-center">Sin comunicaciones registradas</p>
                  )}
                </div>
              )}
            </TabPanel>
          </div>
        </div>
      )}
    </>
  )
}
