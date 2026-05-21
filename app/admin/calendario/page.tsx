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
    // Feedback David sesión 21/05 noche: vista semana carga rango MES completo
    // para renderizar mini-calendario mensual debajo de la semana.
    desde = new Date(ref.getFullYear(), ref.getMonth(), 1)
    hasta = new Date(ref.getFullYear(), ref.getMonth() + 1, 0)
    const dStart = desde.getDay()
    const offsetStart = dStart === 0 ? -6 : 1 - dStart
    desde.setDate(desde.getDate() + offsetStart)
    const dEnd = hasta.getDay()
    const offsetEnd = dEnd === 0 ? 0 : 7 - dEnd
    hasta.setDate(hasta.getDate() + offsetEnd)
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
  // Fix timezone bug sesión 22/05: toISOString() convierte a UTC. Si server
  // TZ != UTC (ej Vercel runtime CEST), construcciones `new Date(y,m,d)` →
  // toISOString quedaba 1-2h en UTC menor → slice(0,10) saltaba al día anterior.
  // Usar getFullYear/Month/Date locales que respetan el constructor.
  const toLocalISODate = (d: Date): string => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  const desdeIso = toLocalISODate(desde)
  const hastaIso = toLocalISODate(hasta)

  const activeCompanyId = await getActiveCompanyForPage()
  const supabase = createAdminSupabaseClient()

  // Para cuadrante embed (vista semana arriba) calculamos rango semana lunes-dom
  const refForWeek = new Date(ref)
  const dRefWeek = refForWeek.getDay()
  const offsetMonWeek = dRefWeek === 0 ? -6 : 1 - dRefWeek
  const weekStartDate = new Date(refForWeek)
  weekStartDate.setDate(refForWeek.getDate() + offsetMonWeek)
  const weekEndDate = new Date(weekStartDate)
  weekEndDate.setDate(weekStartDate.getDate() + 6)
  const weekStartIso = toLocalISODate(weekStartDate)
  const weekEndIso = toLocalISODate(weekEndDate)
  const weekDaysArr: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStartDate)
    d.setDate(weekStartDate.getDate() + i)
    weekDaysArr.push(toLocalISODate(d))
  }

  // Rango año completo para fiscalEntries (ViewAno los muestra todos)
  const yearStartIso = `${ref.getFullYear()}-01-01`
  const yearEndIso = `${ref.getFullYear() + 1}-12-31`

  const [eventsRes, employeesRes, projectsRes, assignmentsRes, holidaysRes, absencesRes, yearHolidaysRes, fiscalEntriesRes] = await Promise.all([
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
      .select('id, code, name, status, address')
      .eq('company_id', activeCompanyId)
      .is('deleted_at', null)
      .not('status', 'eq', 'cancelado')
      .order('code', { ascending: false })
      .limit(200),
    // Cuadrante: time_records semana actual
    supabase
      .from('time_records')
      .select('id, employee_id, fecha, project_id, horas_ordinarias, horas_extra')
      .gte('fecha', weekStartIso)
      .lte('fecha', weekEndIso),
    supabase
      .from('holidays')
      .select('fecha, nombre, ambito')
      .eq('company_id', activeCompanyId)
      .gte('fecha', weekStartIso)
      .lte('fecha', weekEndIso),
    supabase
      .from('worker_absences')
      .select('employee_id, tipo, fecha_inicio, fecha_fin, status')
      .eq('company_id', activeCompanyId)
      .in('status', ['approved', 'pending'])
      .lte('fecha_inicio', weekEndIso)
      .gte('fecha_fin', weekStartIso),
    // ViewAno: festivos año entero
    supabase
      .from('holidays')
      .select('fecha')
      .eq('company_id', activeCompanyId)
      .gte('fecha', `${ref.getFullYear()}-01-01`)
      .lte('fecha', `${ref.getFullYear()}-12-31`),
    // Obligaciones fiscales AEAT (fecha_inicio_plazo amarillo, fecha_limite rojo)
    supabase
      .from('fiscal_calendar_entries')
      .select('modelo, ejercicio, periodo, fecha_inicio_plazo, fecha_limite, nombre, descripcion')
      .eq('company_id', activeCompanyId)
      .gte('fecha_inicio_plazo', yearStartIso)
      .lte('fecha_limite', yearEndIso)
      .order('fecha_limite'),
  ])

  const todayStr = toLocalISODate(new Date())
  const employees = (employeesRes.data ?? []).filter(
    (e) => !e.fecha_baja || (e.fecha_baja as string) > todayStr,
  ).map((e) => ({ id: e.id, nombre: e.nombre }))

  // Socios (para asignar tareas/reuniones). RPC SECURITY DEFINER: JOIN auth.users.
  const { data: sociosData } = await supabase.rpc('get_company_members_with_email', {
    p_company_id: activeCompanyId,
  })
  // Nombre legible derivado del email: "d.vieco@..." → "D. Vieco"
  const socioLabel = (email: string): string => {
    const local = email.split('@')[0] ?? email
    return local
      .split('.')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
  }
  const socios = ((sociosData ?? []) as Array<{ user_id: string; email: string; role: string }>)
    .map((s) => ({ user_id: s.user_id, email: s.email, nombre: socioLabel(s.email) }))

  return (
    <CalendarioView
      vista={vista}
      desde={desdeIso}
      hasta={hastaIso}
      refFecha={toLocalISODate(ref)}
      events={eventsRes.data ?? []}
      employees={employees}
      socios={socios}
      projects={(projectsRes.data ?? []).map((p) => ({
        id: p.id, code: p.code, name: p.name, status: p.status,
        address: (p as { address?: string | null }).address ?? null,
      }))}
      cuadranteWeekDays={weekDaysArr}
      cuadranteAssignments={(assignmentsRes.data ?? []) as Array<{ id: string; employee_id: string; fecha: string; project_id: string | null; horas_ordinarias: number | null; horas_extra: number | null }>}
      cuadranteHolidays={(holidaysRes.data ?? []) as Array<{ fecha: string; nombre: string; ambito: string }>}
      cuadranteAbsences={(absencesRes.data ?? []) as Array<{ employee_id: string; tipo: string; fecha_inicio: string; fecha_fin: string; status: string }>}
      yearHolidays={(yearHolidaysRes.data ?? []).map((h) => h.fecha as string)}
      fiscalEntries={(fiscalEntriesRes.data ?? []) as Array<{
        modelo: string
        ejercicio: number
        periodo: string
        fecha_inicio_plazo: string
        fecha_limite: string
        nombre: string
        descripcion: string | null
      }>}
    />
  )
}
