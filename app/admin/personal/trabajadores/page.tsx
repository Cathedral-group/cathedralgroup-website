import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getActiveCompanyForPage } from '@/lib/company-aware-server'

interface PortalRow {
  employee_id: string
  revoked_at: string | null
  expires_at: string | null
  last_used_at: string | null
  uses_count: number
}

export default async function TrabajadoresPortalIndexPage() {
  const authClient = await createServerSupabaseClient()
  const { data: userData, error: authError } = await authClient.auth.getUser()
  if (authError || !userData?.user) redirect('/admin/login')

  const activeCompanyId = await getActiveCompanyForPage()
  const supabase = createAdminSupabaseClient()

  const [employeesRes, tokensRes] = await Promise.all([
    supabase
      .from('employees')
      .select('id, nombre, nif, email')
      .eq('company_id', activeCompanyId)
      .is('deleted_at', null)
      .order('nombre'),
    supabase
      .from('worker_portal_access')
      .select('employee_id, revoked_at, expires_at, last_used_at, uses_count')
      .eq('company_id', activeCompanyId)
      .order('created_at', { ascending: false }),
  ])

  const tokensByEmployee = new Map<string, PortalRow>()
  for (const t of (tokensRes.data ?? []) as PortalRow[]) {
    if (!tokensByEmployee.has(t.employee_id)) {
      tokensByEmployee.set(t.employee_id, t)
    }
  }

  const employees = (employeesRes.data ?? []).map((e) => ({
    ...e,
    portal: tokensByEmployee.get(e.id) ?? null,
  }))

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-5">
          <div className="flex items-center gap-3 text-sm text-stone-500">
            <Link href="/admin/personal" className="hover:text-stone-900">
              Personal
            </Link>
            <span>›</span>
            <span className="text-stone-900">Accesos portal trabajador</span>
          </div>
          <h1 className="mt-2 text-2xl font-light tracking-tight text-stone-900">
            Accesos portal trabajador
          </h1>
          <p className="mt-1 text-sm text-stone-600">
            Gestiona los links de portal para que cada trabajador apunte sus partes de horas. El
            portal del trabajador es independiente del panel admin (ningún trabajador puede acceder
            a información de la empresa).
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-8">
        {employees.length === 0 ? (
          <div className="rounded border border-dashed border-stone-300 p-8 text-center text-sm text-stone-500">
            No hay trabajadores en la empresa activa.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wider text-stone-500">
                <tr>
                  <th className="px-4 py-2.5">Trabajador</th>
                  <th className="px-4 py-2.5">NIF</th>
                  <th className="px-4 py-2.5">Estado portal</th>
                  <th className="px-4 py-2.5">Último uso</th>
                  <th className="px-4 py-2.5 text-right">Usos</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {employees.map((e) => {
                  const portal = e.portal
                  const active = portal && !portal.revoked_at
                  return (
                    <tr key={e.id}>
                      <td className="px-4 py-2.5">
                        {(e.nombre ?? '').trim() || '—'}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs">{e.nif ?? '—'}</td>
                      <td className="px-4 py-2.5">
                        {active ? (
                          <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                            Activo
                          </span>
                        ) : portal ? (
                          <span className="rounded bg-stone-100 px-2 py-0.5 text-xs text-stone-600">
                            Revocado
                          </span>
                        ) : (
                          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                            Sin generar
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-stone-500">
                        {portal?.last_used_at
                          ? new Date(portal.last_used_at).toLocaleString('es-ES', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {portal?.uses_count ?? 0}
                      </td>
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/admin/personal/trabajadores/${e.id}/portal`}
                          className="text-xs text-stone-600 underline hover:text-stone-900"
                        >
                          Gestionar →
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
