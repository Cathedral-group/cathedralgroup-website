import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import QuotesView from './QuotesView'

export default async function PresupuestosPage() {
  const authClient = await createServerSupabaseClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/admin/login')

  const supabase = createAdminSupabaseClient()

  const [quotesRes, clientsRes, projectsRes] = await Promise.all([
    supabase.from('quotes').select('*').order('created_at', { ascending: false }),
    supabase.from('clients').select('id, name'),
    supabase.from('projects').select('id, code, name'),
  ])

  // Handle case where quotes table doesn't exist yet
  if (quotesRes.error && quotesRes.error.code === '42P01') {
    return (
      <div>
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-xl font-medium uppercase tracking-wide">Presupuestos</h1>
        </div>
        <div className="bg-amber-50 border border-amber-200 p-8 text-center">
          <p className="text-sm font-medium text-amber-800 mb-2">Tabla de presupuestos no configurada</p>
          <p className="text-xs text-amber-600">
            Ejecuta la migracion <code className="bg-amber-100 px-1 py-0.5 rounded">create_quotes_table.sql</code> en Supabase para habilitar este modulo.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-xl font-medium uppercase tracking-wide">Presupuestos</h1>
      </div>
      <QuotesView
        quotes={quotesRes.data || []}
        clients={clientsRes.data || []}
        projects={projectsRes.data || []}
        userEmail={user.email || ''}
      />
    </div>
  )
}
