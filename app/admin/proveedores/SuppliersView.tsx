'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import TabPanel from '@/components/admin/TabPanel'

interface Supplier { id?: string; name: string; nif?: string; email?: string; phone?: string; specialty?: string; address?: string; contact_person?: string; bank_account?: string; payment_terms?: string; active?: boolean; iban?: string; notes?: string; [k: string]: unknown }
interface Invoice { id: string; number?: string; concept?: string; amount_total?: number; payment_status?: string; direction?: string; supplier_nif?: string; [k: string]: unknown }

function formatEur(v: number | null | undefined) { return v == null ? '—' : v.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }) }

const SPECIALTIES = ['electricidad','fontaneria','pintura','carpinteria','marmol','cristaleria','climatizacion','domotica','reformas','otro']
const TABS = [{ key: 'datos', label: 'Datos' }, { key: 'facturas', label: 'Facturas' }]

export default function SuppliersView({ suppliers: initial, invoices }: { suppliers: Supplier[]; invoices: Invoice[] }) {
  const [data, setData] = useState(initial)
  const [selected, setSelected] = useState<Supplier | null>(null)
  const [form, setForm] = useState<Supplier | null>(null)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('datos')
  const [saving, setSaving] = useState(false)

  const filtered = useMemo(() => !search ? data : data.filter(s => `${s.name} ${s.specialty ?? ''} ${s.nif ?? ''}`.toLowerCase().includes(search.toLowerCase())), [data, search])
  const set = (k: string, v: unknown) => setForm(f => f ? { ...f, [k]: v } : f)

  const supplierInv = useMemo(() => form?.nif ? invoices.filter(i => i.supplier_nif === form.nif && i.direction === 'recibida') : [], [form, invoices])
  const totalGastado = supplierInv.reduce((s, i) => s + (Number(i.amount_total) || 0), 0)
  const totalPendiente = supplierInv.filter(i => i.payment_status === 'pendiente').reduce((s, i) => s + (Number(i.amount_total) || 0), 0)

  const openDetail = (s: Supplier) => { setSelected(s); setForm({ ...s }); setTab('datos') }
  const openNew = () => { setSelected(null); setForm({ name: '', specialty: '', active: true }); setTab('datos') }
  const close = () => { setForm(null); setSelected(null) }

  const handleSave = async () => {
    if (!form?.name) return; setSaving(true)
    const supabase = createClient(); const payload = { ...form }; delete payload.id
    if (selected?.id) { const { data: u } = await supabase.from('suppliers').update(payload).eq('id', selected.id).select().single(); if (u) setData(p => p.map(r => r.id === selected.id ? u as Supplier : r)) }
    else { const { data: c } = await supabase.from('suppliers').insert(payload).select().single(); if (c) setData(p => [c as Supplier, ...p]) }
    setSaving(false); close()
  }

  const handleDelete = async () => {
    if (!selected?.id || !confirm('¿Eliminar?')) return
    await createClient().from('suppliers').delete().eq('id', selected.id)
    setData(p => p.filter(r => r.id !== selected.id)); close()
  }

  const lbl = 'text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-2'
  const inp = 'w-full bg-neutral-50 border-0 focus:ring-1 focus:ring-primary p-3 text-sm'

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-medium uppercase tracking-wide">Proveedores</h1>
        <button onClick={openNew} className="bg-neutral-900 text-white px-6 py-2.5 text-xs font-bold uppercase tracking-widest hover:bg-primary transition-colors">+ Nuevo</button>
      </div>
      <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." className="bg-neutral-50 border-0 focus:ring-1 focus:ring-primary px-4 py-2 text-sm w-64 mb-6" />
      <div className="bg-white border border-neutral-100 overflow-x-auto">
        <table className="w-full">
          <thead><tr className="border-b border-neutral-100">
            {['Nombre','Especialidad','Teléfono','NIF','Facturas','Pendiente'].map(h => <th key={h} className="text-left px-4 py-4 text-[10px] font-bold uppercase tracking-widest text-neutral-400">{h}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-neutral-50">
            {filtered.length === 0 ? <tr><td colSpan={6} className="px-6 py-8 text-center text-sm text-neutral-400">Sin proveedores</td></tr> :
            filtered.map(s => {
              const sInv = invoices.filter(i => i.supplier_nif === s.nif && i.direction === 'recibida')
              const sPend = sInv.filter(i => i.payment_status === 'pendiente').reduce((sum, i) => sum + (Number(i.amount_total) || 0), 0)
              return (<tr key={s.id} onClick={() => openDetail(s)} className="cursor-pointer hover:bg-neutral-50 transition-colors">
                <td className="px-4 py-3 text-sm font-medium">{s.name}</td>
                <td className="px-4 py-3"><span className="text-[10px] font-bold uppercase tracking-wider bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded">{s.specialty || '—'}</span></td>
                <td className="px-4 py-3 text-sm">{s.phone || '—'}</td>
                <td className="px-4 py-3 text-sm text-neutral-500">{s.nif || '—'}</td>
                <td className="px-4 py-3 text-sm">{sInv.length}</td>
                <td className="px-4 py-3 text-sm font-medium">{sPend > 0 ? <span className="text-amber-600">{formatEur(sPend)}</span> : '—'}</td>
              </tr>)
            })}
          </tbody>
        </table>
      </div>

      {form && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/20" onClick={close} />
          <div className="relative w-full max-w-md bg-white h-full overflow-y-auto shadow-xl">
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
                    <div><label className={lbl}>Especialidad</label><select value={form.specialty || ''} onChange={e => set('specialty', e.target.value)} className={inp}><option value="">Seleccionar</option>{SPECIALTIES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                    <div><label className={lbl}>Contacto</label><input type="text" value={form.contact_person || ''} onChange={e => set('contact_person', e.target.value)} className={inp} /></div>
                    <div><label className={lbl}>Dirección</label><input type="text" value={form.address || ''} onChange={e => set('address', e.target.value)} className={inp} /></div>
                    <div><label className={lbl}>IBAN</label><input type="text" value={form.bank_account || form.iban || ''} onChange={e => set('bank_account', e.target.value)} className={inp} /></div>
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
