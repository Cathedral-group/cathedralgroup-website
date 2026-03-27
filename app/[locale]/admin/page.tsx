import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'

async function getStats() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/admin/login')

    const { count: totalLeads } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })

    const { count: newLeads } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())

    const { data: recentLeads } = await supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5)

    return { totalLeads: totalLeads || 0, newLeads: newLeads || 0, recentLeads: recentLeads || [] }
  } catch {
    return { totalLeads: 0, newLeads: 0, recentLeads: [] }
  }
}

export default async function AdminDashboard() {
  const { totalLeads, newLeads, recentLeads } = await getStats()

  const stats = [
    { label: 'Leads totales', value: totalLeads, color: 'text-neutral-900' },
    { label: 'Nuevos (7 días)', value: newLeads, color: 'text-primary' },
  ]

  return (
    <div>
      <h1 className="text-xl font-medium uppercase tracking-wide mb-8">Dashboard</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        {stats.map(({ label, value, color }) => (
          <div key={label} className="bg-white p-6 border border-neutral-100">
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Recent Leads */}
      <div className="bg-white border border-neutral-100">
        <div className="p-6 border-b border-neutral-100">
          <div className="flex justify-between items-center">
            <h2 className="text-sm font-bold uppercase tracking-widest">Leads recientes</h2>
            <a href="/admin/leads" className="text-xs text-primary font-bold uppercase tracking-widest hover:underline">
              Ver todos
            </a>
          </div>
        </div>

        <div className="divide-y divide-neutral-50">
          {recentLeads.length === 0 ? (
            <div className="p-6 text-center text-sm text-neutral-400">
              No hay leads todavía
            </div>
          ) : (
            recentLeads.map((lead: Record<string, string>) => (
              <div key={lead.id} className="px-6 py-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{lead.nombre}</p>
                  <p className="text-xs text-neutral-500">{lead.email}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-neutral-500">{lead.tipo_proyecto || '—'}</p>
                  <p className="text-[10px] text-neutral-400">
                    {new Date(lead.created_at).toLocaleDateString('es-ES')}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
