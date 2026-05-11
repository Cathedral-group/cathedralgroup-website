/**
 * Gantt multi-proyecto — vista temporal horizontal de todos los proyectos activos.
 *
 * Muestra:
 *   - Una fila por proyecto activo (status != cancelado/finalizado/completado)
 *   - Barra horizontal: start_date → end_date_planned
 *   - Sub-toggle: carga de personal (cuántos trabajadores por día encima de la barra)
 *
 * David: 'tener un diagrama de Gantt para ir viendo los tiempos y controlándolo
 * todo en cada proyecto. Y una visión conjunta de todos los proyectos para ver
 * recursos utilizados.'
 *
 * Implementación CSS-puro, sin librería externa.
 */

import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { getActiveCompanyForPage } from '@/lib/company-aware-server'
import GanttMultiView from './GanttMultiView'

export default async function GanttMultiPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>
}) {
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user) redirect('/admin/login')

  const sp = await searchParams
  const today = new Date()
  const desde = sp.desde && /^\d{4}-\d{2}-\d{2}$/.test(sp.desde)
    ? sp.desde
    : new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString().slice(0, 10)
  const hasta = sp.hasta && /^\d{4}-\d{2}-\d{2}$/.test(sp.hasta)
    ? sp.hasta
    : new Date(today.getFullYear(), today.getMonth() + 4, 0).toISOString().slice(0, 10)

  const activeCompanyId = await getActiveCompanyForPage()
  const supabase = createAdminSupabaseClient()

  const [projectsRes, assignmentsRes] = await Promise.all([
    supabase
      .from('projects')
      .select('id, code, name, status, start_date, end_date_planned, end_date_real')
      .eq('company_id', activeCompanyId)
      .is('deleted_at', null)
      .not('status', 'in', '(cancelado,completado,finalizado)')
      .order('start_date', { ascending: true, nullsFirst: false }),
    supabase
      .from('worker_assignments')
      .select('fecha, employee_id, project_id')
      .eq('company_id', activeCompanyId)
      .is('deleted_at', null)
      .gte('fecha', desde)
      .lte('fecha', hasta),
  ])

  return (
    <GanttMultiView
      desde={desde}
      hasta={hasta}
      projects={projectsRes.data ?? []}
      assignments={assignmentsRes.data ?? []}
    />
  )
}
