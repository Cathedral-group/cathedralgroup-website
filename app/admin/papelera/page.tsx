import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import PapeleraView from './PapeleraView'

export default async function PapeleraPage() {
  const authClient = await createServerSupabaseClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/admin/login')

  const supabase = createAdminSupabaseClient()

  const [leadsRes, clientsRes, suppliersRes, projectsRes, invoicesRes, quotesRes] = await Promise.all([
    supabase.from('leads').select('id, nombre, email, created_at, deleted_at').not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
    supabase.from('clients').select('id, name, email, created_at, deleted_at').not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
    supabase.from('suppliers').select('id, name, nif, created_at, deleted_at').not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
    supabase.from('projects').select('id, code, name, created_at, deleted_at').not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
    supabase.from('invoices').select('id, number, concept, direction, amount_total, created_at, deleted_at').not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
    supabase.from('quotes').select('id, number, total, status, created_at, deleted_at').not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
  ])

  const items = [
    ...(leadsRes.data || []).map(r => ({ ...r, _table: 'leads' as const, _type: 'Lead', _label: r.nombre || r.email || 'Sin nombre' })),
    ...(clientsRes.data || []).map(r => ({ ...r, _table: 'clients' as const, _type: 'Cliente', _label: r.name || r.email || 'Sin nombre' })),
    ...(suppliersRes.data || []).map(r => ({ ...r, _table: 'suppliers' as const, _type: 'Proveedor', _label: r.name || r.nif || 'Sin nombre' })),
    ...(projectsRes.data || []).map(r => ({ ...r, _table: 'projects' as const, _type: 'Proyecto', _label: r.code ? `${r.code} - ${r.name}` : r.name || 'Sin nombre' })),
    ...(invoicesRes.data || []).map(r => ({ ...r, _table: 'invoices' as const, _type: 'Factura', _label: r.number || r.concept || 'Sin numero' })),
    ...(quotesRes.data || []).map(r => ({ ...r, _table: 'quotes' as const, _type: 'Presupuesto', _label: r.number || 'Sin numero' })),
  ]

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-xl font-medium uppercase tracking-wide">Papelera</h1>
        <p className="text-sm text-neutral-500">{items.length} elementos eliminados</p>
      </div>
      <PapeleraView items={items} />
    </div>
  )
}
