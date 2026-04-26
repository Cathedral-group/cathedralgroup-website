'use client'

import { useState, useMemo } from 'react'
import TabPanel from '@/components/admin/TabPanel'

type SortField = 'name' | 'specialty' | 'created_at'

interface Supplier { id?: string; name: string; nif?: string; email?: string; phone?: string; specialty?: string; address?: string; contact_person?: string; bank_account?: string; payment_terms?: string; active?: boolean; iban?: string; notes?: string; created_at?: string; [k: string]: unknown }
interface Invoice { id: string; number?: string; concept?: string; amount_base?: number; vat_amount?: number; amount_total?: number; payment_status?: string; direction?: string; supplier_nif?: string; [k: string]: unknown }

function getNetAmt(inv: Pick<Invoice, 'amount_base' | 'vat_amount' | 'amount_total'>): number {
  if (inv.amount_base != null) return Number(inv.amount_base)
  const total = inv.amount_total ? Number(inv.amount_total) : 0
  const vat = inv.vat_amount ? Number(inv.vat_amount) : 0
  return total > 0 && vat > 0 ? total - vat : total
}

function formatEur(v: number | null | undefined) { return v == null ? '—' : v.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }) }

const SPECIALTIES = ['electricidad','fontaneria','pintura','carpinteria','marmol','cristaleria','climatizacion','domotica','reformas','otro']
const SPECIALTY_LABELS: Record<string, string> = {
  electricidad: 'Electricidad',
  fontaneria: 'Fontanería',
  pintura: 'Pintura',
  carpinteria: 'Carpintería',
  marmol: 'Mármol',
  cristaleria: 'Cristalería',
  climatizacion: 'Climatización',
  domotica: 'Domótica',
  reformas: 'Reformas',
  otro: 'Otro',
}
const TABS = [{ key: 'datos', label: 'Datos' }, { key: 'facturas', label: 'Facturas' }]

function KpiCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-white border border-neutral-100 px-4 py-3">
      <p className="text-[9px] font-bold uppercase tracking-widest text-neutral-400">{label}</p>
      <p className="text-lg font-medium text-neutral-900 mt-0.5">{value}</p>
      {hint && <p className="text-[10px] text-neutral-400 mt-0.5">{hint}</p>}
    </div>
  )
}

export default function SuppliersView({ suppliers: initial, invoices }: { suppliers: Supplier[]; invoices: Invoice[] }) {
  const [data, setData] = useState(initial)
  const [selected, setSelected] = useState<Supplier | null>(null)
  const [form, setForm] = useState<Supplier | null>(null)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('datos')
  const [saving, setSaving] = useState(false)
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  // ─── Patrón coherente Cathedral: 4 modos
  const [viewMode, setViewMode] = useState<'especialidad' | 'volumen' | 'activos' | 'lista'>('especialidad')

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir(field === 'created_at' ? 'desc' : 'asc')
    }
  }

  const sortIcon = (field: SortField) =>
    sortField === field ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'

  const thCls = (field: SortField, extra = '') =>
    `text-left px-4 py-4 text-[10px] font-bold uppercase tracking-widest cursor-pointer select-none transition-colors ${
      sortField === field ? 'text-neutral-800' : 'text-neutral-400 hover:text-neutral-600'
    } ${extra}`

  const filtered = useMemo(() => {
    let list = !search ? data : data.filter(s => `${s.name} ${s.specialty ?? ''} ${s.nif ?? ''}`.toLowerCase().includes(search.toLowerCase()))
    list = [...list].sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'name':
          cmp = (a.name ?? '').localeCompare(b.name ?? '', 'es', { sensitivity: 'base' })
          break
        case 'specialty':
          cmp = (a.specialty ?? '').localeCompare(b.specialty ?? '', 'es', { sensitivity: 'base' })
          break
        case 'created_at':
          cmp = (a.created_at ?? '').localeCompare(b.created_at ?? '')
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [data, search, sortField, sortDir])

  /* ───────── Map: NIF → estadísticas de facturación (cache única) ───────── */
  const supplierStats = useMemo(() => {
    const stats: Record<string, { count: number; total: number; pendiente: number }> = {}
    for (const inv of invoices) {
      if (inv.direction !== 'recibida' || !inv.supplier_nif) continue
      const nif = inv.supplier_nif
      if (!stats[nif]) stats[nif] = { count: 0, total: 0, pendiente: 0 }
      stats[nif].count += 1
      stats[nif].total += getNetAmt(inv)
      if (inv.payment_status === 'pendiente') stats[nif].pendiente += getNetAmt(inv)
    }
    return stats
  }, [invoices])

  /* ───────── KPIs (cabecera Cathedral) ───────── */
  const kpis = useMemo(() => {
    const activos = data.filter(s => s.active !== false).length
    const gastadoTotal = Object.values(supplierStats).reduce((s, st) => s + st.total, 0)
    const pendienteTotal = Object.values(supplierStats).reduce((s, st) => s + st.pendiente, 0)
    return { total: data.length, activos, gastadoTotal, pendienteTotal }
  }, [data, supplierStats])

  /* ───────── Agrupación según viewMode ───────── */
  function groupKey(s: Supplier): { key: string; label: string } {
    if (viewMode === 'especialidad') {
      const k = s.specialty || 'sin_especialidad'
      return { key: k, label: SPECIALTY_LABELS[k] || k }
    }
    if (viewMode === 'volumen') {
      const total = (s.nif && supplierStats[s.nif]?.total) || 0
      if (total >= 50000) return { key: '1_top', label: 'Top (>50.000€)' }
      if (total >= 10000) return { key: '2_alto', label: 'Alto (10.000–50.000€)' }
      if (total >= 1000) return { key: '3_medio', label: 'Medio (1.000–10.000€)' }
      if (total > 0) return { key: '4_bajo', label: 'Bajo (<1.000€)' }
      return { key: '5_sin', label: 'Sin facturas' }
    }
    if (viewMode === 'activos') {
      return s.active === false
        ? { key: 'inactivos', label: 'Inactivos' }
        : { key: 'activos', label: 'Activos' }
    }
    return { key: 'all', label: 'Todos' }
  }

  const grouped = useMemo(() => {
    if (viewMode === 'lista') return null
    const groups: Record<string, { label: string; items: Supplier[] }> = {}
    for (const s of filtered) {
      const { key, label } = groupKey(s)
      if (!groups[key]) groups[key] = { label, items: [] }
      groups[key].items.push(s)
    }
    return groups
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, viewMode, supplierStats])

  const set = (k: string, v: unknown) => setForm(f => f ? { ...f, [k]: v } : f)

  const supplierInv = useMemo(() => form?.nif ? invoices.filter(i => i.supplier_nif === form.nif && i.direction === 'recibida') : [], [form, invoices])
  const totalGastado = supplierInv.reduce((s, i) => s + getNetAmt(i), 0)
  const totalPendiente = supplierInv.filter(i => i.payment_status === 'pendiente').reduce((s, i) => s + getNetAmt(i), 0)

  const openDetail = (s: Supplier) => { setSelected(s); setForm({ ...s }); setTab('datos') }
  const openNew = () => { setSelected(null); setForm({ name: '', specialty: '', active: true }); setTab('datos') }
  const close = () => { setForm(null); setSelected(null) }

  const handleSave = async () => {
    if (!form?.name) return
    setSaving(true)
    // Check for duplicate NIF before saving
    if (form.nif && form.nif.trim()) {
      const normalizedNif = form.nif.trim().toUpperCase()
      const duplicate = data.find(s =>
        s.nif && s.nif.trim().toUpperCase() === normalizedNif &&
        s.id !== (selected?.id ?? '')
      )
      if (duplicate) {
        setSaving(false)
        alert(`Ya existe un proveedor con este NIF/CIF: "${duplicate.name}". No se pueden tener dos proveedores con el mismo NIF.`)
        return
      }
    }
    const payload = { ...form }; delete payload.id
    try {
      if (selected?.id) {
        const res = await fetch('/api/db/suppliers', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: selected.id, ...payload }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || `Error ${res.status}`)
        }
        const { data: u } = await res.json()
        setData(p => p.map(r => r.id === selected.id ? (u ?? { ...selected, ...payload }) as Supplier : r))
      } else {
        const res = await fetch('/api/db/suppliers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || `Error ${res.status}`)
        }
        const { data: c } = await res.json()
        if (c) setData(p => [c as Supplier, ...p])
      }
      close()
    } catch (err) {
      console.error('handleSave:', err)
      alert('Error al guardar: ' + (err instanceof Error ? err.message : 'Error desconocido'))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!selected?.id || !confirm('Mover a la papelera?')) return
    try {
      const res = await fetch('/api/db/suppliers', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Error ${res.status}`)
      }
      setData(p => p.filter(r => r.id !== selected.id))
      close()
    } catch (err) {
      console.error('handleDelete:', err)
      alert('Error al eliminar: ' + (err instanceof Error ? err.message : 'Error desconocido'))
    }
  }

  const lbl = 'text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-2'
  const inp = 'w-full bg-neutral-50 border-0 focus:ring-1 focus:ring-primary p-3 text-sm'

  return (
    <div>
      <div className="flex justify-between items-center mb-5">
        <h1 className="text-xl font-medium uppercase tracking-wide">Proveedores</h1>
        <button onClick={openNew} className="bg-neutral-900 text-white px-6 py-2.5 text-xs font-bold uppercase tracking-widest hover:bg-primary transition-colors">+ Nuevo</button>
      </div>

      {/* ─── KPIs (patrón coherente Cathedral) ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <KpiCard label="Proveedores" value={String(kpis.total)} />
        <KpiCard label="Activos" value={String(kpis.activos)} />
        <KpiCard label="Gastado total" value={formatEur(kpis.gastadoTotal)} />
        <KpiCard label="Pendiente pago" value={formatEur(kpis.pendienteTotal)} />
      </div>

      {/* ─── Selector de modos + buscador ─── */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mr-1">Vista:</span>
        {(['especialidad', 'volumen', 'activos', 'lista'] as const).map((mode) => (
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
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." className="bg-neutral-50 border-0 focus:ring-1 focus:ring-primary px-4 py-2 text-sm w-52 ml-auto" />
      </div>

      {/* ─── Vista lista (tabla original) ─── */}
      {viewMode === 'lista' && (
      <div className="bg-white border border-neutral-100 overflow-x-auto">
        <table className="w-full">
          <thead><tr className="border-b border-neutral-100">
            <th onClick={() => handleSort('name')} className={thCls('name')}>Nombre{sortIcon('name')}</th>
            <th onClick={() => handleSort('specialty')} className={`${thCls('specialty')} hidden sm:table-cell`}>Especialidad{sortIcon('specialty')}</th>
            <th className="hidden lg:table-cell text-left px-4 py-4 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Contacto</th>
            <th className="hidden md:table-cell text-left px-4 py-4 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Teléfono</th>
            <th className="hidden lg:table-cell text-left px-4 py-4 text-[10px] font-bold uppercase tracking-widest text-neutral-400">NIF</th>
            <th className="hidden sm:table-cell text-left px-4 py-4 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Facturas</th>
            <th className="text-left px-4 py-4 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Pendiente</th>
          </tr></thead>
          <tbody className="divide-y divide-neutral-50">
            {filtered.length === 0 ? <tr><td colSpan={7} className="px-6 py-8 text-center text-sm text-neutral-400">Sin proveedores</td></tr> :
            filtered.map(s => {
              const st = (s.nif && supplierStats[s.nif]) || { count: 0, pendiente: 0, total: 0 }
              return (<tr key={s.id} onClick={() => openDetail(s)} className="cursor-pointer hover:bg-neutral-50 transition-colors">
                <td className="px-4 py-3 text-sm font-medium">{s.name}{s.active === false && <span className="ml-2 text-[9px] font-bold uppercase tracking-wider text-neutral-400 bg-neutral-100 px-1.5 py-0.5">Inactivo</span>}</td>
                <td className="hidden sm:table-cell px-4 py-3"><span className="text-[10px] font-bold uppercase tracking-wider bg-neutral-100 text-neutral-600 px-2 py-0.5">{s.specialty ? (SPECIALTY_LABELS[s.specialty] ?? s.specialty) : '—'}</span></td>
                <td className="hidden lg:table-cell px-4 py-3 text-sm text-neutral-500">{s.contact_person || '—'}</td>
                <td className="hidden md:table-cell px-4 py-3 text-sm">{s.phone || '—'}</td>
                <td className="hidden lg:table-cell px-4 py-3 text-sm text-neutral-500">{s.nif || '—'}</td>
                <td className="hidden sm:table-cell px-4 py-3 text-sm">{st.count}</td>
                <td className="px-4 py-3 text-sm font-medium">{st.pendiente > 0 ? <span className="text-amber-600">{formatEur(st.pendiente)}</span> : '—'}</td>
              </tr>)
            })}
          </tbody>
        </table>
      </div>
      )}

      {/* ─── Vista agrupada (modos especialidad/volumen/activos) ─── */}
      {viewMode !== 'lista' && grouped && (
        <div className="space-y-4">
          {Object.keys(grouped).length === 0 && (
            <div className="bg-white border border-neutral-100 px-4 py-8 text-center text-sm text-neutral-400">
              Sin proveedores
            </div>
          )}
          {Object.entries(grouped)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([key, group]) => {
              const totalGrupo = group.items.reduce((sum, s) => sum + ((s.nif && supplierStats[s.nif]?.total) || 0), 0)
              return (
                <div key={key} className="bg-white border border-neutral-100">
                  <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/60">
                    <div className="flex items-center gap-3">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-700">{group.label}</h3>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                        {group.items.length} prov{group.items.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <span className="text-xs tabular-nums text-neutral-500">{formatEur(totalGrupo)} gastado</span>
                  </div>
                  <div className="divide-y divide-neutral-50">
                    {group.items.map((s) => {
                      const st = (s.nif && supplierStats[s.nif]) || { count: 0, pendiente: 0, total: 0 }
                      return (
                        <div key={s.id} onClick={() => openDetail(s)} className="px-4 py-3 cursor-pointer hover:bg-neutral-50 transition-colors flex items-center gap-3">
                          <span className="text-sm font-medium flex-1 truncate">{s.name}
                            {s.active === false && <span className="ml-2 text-[9px] font-bold uppercase tracking-wider text-neutral-400 bg-neutral-100 px-1.5 py-0.5">Inactivo</span>}
                          </span>
                          <span className="hidden sm:inline text-xs text-neutral-400 w-32 truncate">{s.nif || '—'}</span>
                          <span className="text-xs text-neutral-500 w-16 text-right tabular-nums">{st.count} fac</span>
                          <span className="text-xs tabular-nums w-24 text-right">{formatEur(st.total)}</span>
                          <span className={`text-xs tabular-nums w-24 text-right ${st.pendiente > 0 ? 'text-amber-600 font-medium' : 'text-neutral-300'}`}>
                            {st.pendiente > 0 ? formatEur(st.pendiente) : '—'}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
        </div>
      )}

      {form && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/20" onClick={close} />
          <div className="relative w-full sm:max-w-md bg-white h-full overflow-y-auto shadow-xl pb-[env(safe-area-inset-bottom)]">
            <div className="sticky top-0 bg-white border-b border-neutral-100 p-6 flex justify-between items-center z-10">
              <h2 className="text-sm font-bold uppercase tracking-widest">{selected ? 'Editar' : 'Nuevo'} proveedor</h2>
              <button onClick={close} className="text-neutral-400 hover:text-neutral-600 text-xl">×</button>
            </div>
            <div className="p-6">
              <TabPanel tabs={TABS} activeTab={tab} onTabChange={setTab}>
                {tab === 'datos' && (
                  <div className="space-y-4 pt-4">
                    <div><label className={lbl}>Nombre *</label><input type="text" value={form.name} onChange={e => set('name', e.target.value)} className={inp} /></div>
                    <div><label className={lbl}>NIF/CIF</label><input type="text" value={form.nif || ''} onChange={e => set('nif', e.target.value)} className={inp} /></div>
                    <div><label className={lbl}>Email</label><input type="email" value={form.email || ''} onChange={e => set('email', e.target.value)} className={inp} /></div>
                    <div><label className={lbl}>Teléfono</label><input type="tel" value={form.phone || ''} onChange={e => set('phone', e.target.value)} className={inp} /></div>
                    <div><label className={lbl}>Especialidad</label><input type="text" value={form.specialty || ''} onChange={e => set('specialty', e.target.value)} className={inp} placeholder="Ej: Reformas, Climatización…" /></div>
                    <div><label className={lbl}>Contacto</label><input type="text" value={form.contact_person || ''} onChange={e => set('contact_person', e.target.value)} className={inp} /></div>
                    <div><label className={lbl}>Dirección</label><input type="text" value={form.address || ''} onChange={e => set('address', e.target.value)} className={inp} /></div>
                    <div><label className={lbl}>IBAN</label><input type="text" value={form.bank_account || ''} onChange={e => set('bank_account', e.target.value)} className={inp} placeholder="ES00 0000 0000 0000 0000 0000" /></div>
                    <div><label className={lbl}>Condiciones pago</label><select value={form.payment_terms || ''} onChange={e => set('payment_terms', e.target.value)} className={inp}><option value="">Sin especificar</option><option value="al_contado">Al contado</option><option value="30d">30 días</option><option value="60d">60 días</option></select></div>
                    <div><label className={lbl}>Notas</label><textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} rows={3} className={inp} /></div>
                    <div className="space-y-3 pt-4 border-t border-neutral-100">
                      <button onClick={handleSave} disabled={saving || !form.name} className="w-full bg-neutral-900 text-white py-3 text-sm font-bold uppercase tracking-widest hover:bg-primary transition-colors disabled:opacity-50">{saving ? '...' : selected ? 'Guardar' : 'Crear'}</button>
                      {selected && <button onClick={handleDelete} className="w-full border border-red-200 text-red-500 py-2.5 text-xs font-bold uppercase tracking-widest hover:bg-red-50 transition-colors">Eliminar</button>}
                    </div>
                  </div>
                )}
                {tab === 'facturas' && (
                  <div className="pt-4">
                    <div className="grid grid-cols-2 gap-4 mb-6">
                      <div className="bg-neutral-50 p-4 text-center"><p className="text-lg font-bold">{formatEur(totalGastado)}</p><p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mt-1">Total</p></div>
                      <div className="bg-neutral-50 p-4 text-center"><p className="text-lg font-bold text-amber-600">{formatEur(totalPendiente)}</p><p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mt-1">Pendiente</p></div>
                    </div>
                    {supplierInv.length === 0 ? <p className="text-sm text-neutral-400 text-center py-6">Sin facturas</p> :
                    <div className="space-y-2">{supplierInv.map(inv => (
                      <div key={inv.id} className="flex justify-between items-center p-3 bg-neutral-50">
                        <div><p className="text-sm font-medium">{inv.number || '—'}</p><p className="text-xs text-neutral-500">{inv.concept || '—'}</p></div>
                        <div className="text-right"><p className="text-sm font-medium">{formatEur(Number(inv.amount_total))}</p><span className={`text-[10px] font-bold uppercase ${inv.payment_status === 'pagada' ? 'text-green-600' : 'text-amber-600'}`}>{inv.payment_status}</span></div>
                      </div>
                    ))}</div>}
                  </div>
                )}
              </TabPanel>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
