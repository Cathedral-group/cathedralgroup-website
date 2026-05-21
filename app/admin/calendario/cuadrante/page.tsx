/**
 * /admin/calendario/cuadrante
 *
 * Cuadrante semanal Excel-like: filas = trabajadores, columnas = 7 días.
 * Drag proyecto desde sidebar → celda asigna. Shift+drag = copia.
 *
 * Feedback David sesión 22/05: reemplazo digital del Excel donde
 * "copy-paste era súper rápido". Pragmatic DnD + grid spreadsheet-like.
 */
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { isAdminEmail } from '@/lib/auth-allowlist'
import { getActiveCompanyForPage } from '@/lib/company-aware-server'
import CuadranteView from './CuadranteView'

export const dynamic = 'force-dynamic'

function toLocalISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default async function CuadrantePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const authClient = await createServerSupabaseClient()
  const { data: userData } = await authClient.auth.getUser()
  if (!userData?.user?.email || !isAdminEmail(userData.user.email)) redirect('/admin/login')
  const { data: aal } = await authClient.auth.mfa.getAuthenticatorAssuranceLevel()
  if (!aal || aal.currentLevel !== 'aal2') redirect('/admin/login')

  const sp = await searchParams
  const refIso = typeof sp.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sp.fecha)
    ? sp.fecha
    : toLocalISODate(new Date())
  const ref = new Date(refIso + 'T00:00:00')

  // Calcula lunes-domingo de la semana
  const dRef = ref.getDay()
  const offsetMon = dRef === 0 ? -6 : 1 - dRef
  const weekStart = new Date(ref)
  weekStart.setDate(ref.getDate() + offsetMon)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)

  const weekDays: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    weekDays.push(toLocalISODate(d))
  }
  const desdeIso = toLocalISODate(weekStart)
  const hastaIso = toLocalISODate(weekEnd)

  const activeCompanyId = await getActiveCompanyForPage()
  const supabase = createAdminSupabaseClient()

  // Usage stats: proyectos con asignaciones últimas 8 semanas → orden uso-reciente
  const recentSince = new Date(weekStart)
  recentSince.setDate(weekStart.getDate() - 56)
  const recentSinceIso = toLocalISODate(recentSince)

  const [employeesRes, projectsRes, assignmentsRes, holidaysRes, absencesRes, recentUsageRes] = await Promise.all([
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
    supabase
      .from('time_records')
      .select('id, employee_id, fecha, project_id, horas_ordinarias, horas_extra')
      .gte('fecha', desdeIso)
      .lte('fecha', hastaIso),
    supabase
      .from('holidays')
      .select('fecha, nombre, ambito')
      .eq('company_id', activeCompanyId)
      .gte('fecha', desdeIso)
      .lte('fecha', hastaIso),
    supabase
      .from('worker_absences')
      .select('employee_id, tipo, fecha_inicio, fecha_fin, status')
      .eq('company_id', activeCompanyId)
      .in('status', ['approved', 'pending'])
      .lte('fecha_inicio', hastaIso)
      .gte('fecha_fin', desdeIso),
    // Stats uso reciente últimas 8 semanas (orden inteligente sidebar)
    supabase
      .from('time_records')
      .select('project_id, fecha')
      .gte('fecha', recentSinceIso)
      .not('project_id', 'is', null),
  ])

  // Construir mapa project_id → max(fecha) y count
  const usageMap: Record<string, { lastUse: string; count: number }> = {}
  for (const r of (recentUsageRes.data ?? []) as Array<{ project_id: string; fecha: string }>) {
    if (!r.project_id) continue
    const ex = usageMap[r.project_id]
    if (!ex || r.fecha > ex.lastUse) {
      usageMap[r.project_id] = { lastUse: r.fecha, count: (ex?.count || 0) + 1 }
    } else {
      ex.count++
    }
  }
  // Ordenar project_ids por uso reciente desc
  const recentProjectIds = Object.entries(usageMap)
    .sort((a, b) => {
      if (a[1].lastUse !== b[1].lastUse) return a[1].lastUse > b[1].lastUse ? -1 : 1
      return b[1].count - a[1].count
    })
    .map(([id]) => id)

  const todayStr = toLocalISODate(new Date())
  const employees = (employeesRes.data ?? [])
    .filter((e) => !e.fecha_baja || (e.fecha_baja as string) > todayStr)
    .map((e) => ({ id: e.id, nombre: e.nombre ?? '—' }))

  return (
    <CuadranteView
      refFecha={refIso}
      weekDays={weekDays}
      employees={employees}
      projects={(projectsRes.data ?? []).map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        status: p.status,
        address: (p as { address?: string | null }).address ?? null,
      }))}
      assignments={(assignmentsRes.data ?? []) as Array<{
        id: string
        employee_id: string
        fecha: string
        project_id: string | null
        horas_ordinarias: number | null
        horas_extra: number | null
      }>}
      holidays={(holidaysRes.data ?? []) as Array<{ fecha: string; nombre: string; ambito: string }>}
      absences={(absencesRes.data ?? []) as Array<{
        employee_id: string
        tipo: string
        fecha_inicio: string
        fecha_fin: string
        status: string
      }>}
      today={todayStr}
      recentProjectIds={recentProjectIds}
    />
  )
}
