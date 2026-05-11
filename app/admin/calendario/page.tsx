/**
 * Calendario admin — pantalla operativa central.
 *
 * Vistas: día / semana / mes con capas toggleables.
 * Absorbe la pantalla anterior /admin/personal/cuadrante (vista Semana).
 *
 * Capas:
 *   - 👷 Asignaciones cuadrante (planificado)
 *   - 📍 Fichajes reales (lo que de verdad pasó)
 *   - 🏖️ Ausencias aprobadas
 *   - 🇪🇸 Festivos
 *   - 📋 Tareas con fecha
 *
 * Click en celda día → drawer lateral con TODO lo del día agrupado por obra.
 *
 * Una sola query: SELECT * FROM calendar_events WHERE company_id = X AND fecha BETWEEN ...
 */

import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { getActiveCompanyForPage } from '@/lib/company-aware-server'
import CalendarioView from './CalendarioView'

type SP = { vista?: 'dia' | 'semana' | 'mes'; fecha?: string }

export default async function CalendarioPage({
  searchParams,
}: {
  searchParams: Promise<SP>
}) {
  const authClient = await createServerSupabaseClient()
  const { data: userData, error: authError } = await authClient.auth.getUser()
  if (authError || !userData?.user) redirect('/admin/login')

  const sp = await searchParams
  const vista = (['dia', 'semana', 'mes'] as const).includes(sp.vista as never)
    ? (sp.vista as 'dia' | 'semana' | 'mes')
    : 'semana'

  // Calcular rango según la vista
  const ref = sp.fecha && /^\d{4}-\d{2}-\d{2}$/.test(sp.fecha)
    ? new Date(sp.fecha + 'T00:00:00')
    : new Date()
  ref.setHours(0, 0, 0, 0)

  let desde: Date, hasta: Date
  if (vista === 'dia') {
    desde = new Date(ref); hasta = new Date(ref)
  } else if (vista === 'semana') {
    // Lunes a domingo
    const d = ref.getDay()
    const offset = d === 0 ? -6 : 1 - d
    desde = new Date(ref); desde.setDate(ref.getDate() + offset)
    hasta = new Date(desde); hasta.setDate(desde.getDate() + 6)
  } else {
    // mes
    desde = new Date(ref.getFullYear(), ref.getMonth(), 1)
    hasta = new Date(ref.getFullYear(), ref.getMonth() + 1, 0)
    // Expandir a lunes-domingo del primer/último día para grid completo
    const dStart = desde.getDay()
    const offsetStart = dStart === 0 ? -6 : 1 - dStart
    desde.setDate(desde.getDate() + offsetStart)
    const dEnd = hasta.getDay()
    const offsetEnd = dEnd === 0 ? 0 : 7 - dEnd
    hasta.setDate(hasta.getDate() + offsetEnd)
  }
  const desdeIso = desde.toISOString().slice(0, 10)
  const hastaIso = hasta.toISOString().slice(0, 10)

  const activeCompanyId = await getActiveCompanyForPage()
  const supabase = createAdminSupabaseClient()

  const [eventsRes, employeesRes, projectsRes] = await Promise.all([
    supabase
      .from('calendar_events')
      .select('*')
      .eq('company_id', activeCompanyId)
      .gte('fecha', desdeIso)
      .lte('fecha', hastaIso)
      .limit(5000),
    supabase
      .from('employees')
      .select('id, nombre, fecha_baja')
      .eq('company_id', activeCompanyId)
      .is('deleted_at', null)
      .order('nombre'),
    supabase
      .from('projects')
      .select('id, code, name, status')
      .eq('company_id', activeCompanyId)
      .is('deleted_at', null)
      .not('status', 'in', '(cancelado,completado,finalizado)')
      .order('code', { ascending: false })
      .limit(100),
  ])

  const todayStr = new Date().toISOString().slice(0, 10)
  const employees = (employeesRes.data ?? []).filter(
    (e) => !e.fecha_baja || (e.fecha_baja as string) > todayStr,
  ).map((e) => ({ id: e.id, nombre: e.nombre }))

  return (
    <CalendarioView
      vista={vista}
      desde={desdeIso}
      hasta={hastaIso}
      refFecha={ref.toISOString().slice(0, 10)}
      events={eventsRes.data ?? []}
      employees={employees}
      projects={projectsRes.data ?? []}
    />
  )
}
