import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { getActiveCompanyForPage } from '@/lib/company-aware-server'
import CuadranteView from './CuadranteView'

type SP = { semana?: string; mes?: string; vista?: 'semana' | 'mes' }

export default async function CuadrantePage({
  searchParams,
}: {
  searchParams: Promise<SP>
}) {
  const authClient = await createServerSupabaseClient()
  const { data: userData, error: authError } = await authClient.auth.getUser()
  if (authError || !userData?.user) redirect('/admin/login')

  const sp = await searchParams
  const vista = sp.vista === 'mes' ? 'mes' : 'semana'

  let days: string[] = []
  let desde: string
  let hasta: string

  if (vista === 'mes') {
    // Vista mensual: del lunes de la primera semana al domingo de la última
    let firstOfMonth: Date
    if (sp.mes && /^\d{4}-\d{2}$/.test(sp.mes)) {
      const [y, m] = sp.mes.split('-').map(Number)
      firstOfMonth = new Date(y, m - 1, 1)
    } else {
      const now = new Date()
      firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    }
    const lastOfMonth = new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth() + 1, 0)

    // Lunes de la semana del primer día
    const startMon = new Date(firstOfMonth)
    const sd = startMon.getDay()
    const sOffset = sd === 0 ? -6 : 1 - sd
    startMon.setDate(startMon.getDate() + sOffset)
    startMon.setHours(0, 0, 0, 0)

    // Domingo de la semana del último día
    const endSun = new Date(lastOfMonth)
    const ed = endSun.getDay()
    const eOffset = ed === 0 ? 0 : 7 - ed
    endSun.setDate(endSun.getDate() + eOffset)
    endSun.setHours(0, 0, 0, 0)

    let cur = new Date(startMon)
    while (cur <= endSun) {
      days.push(cur.toISOString().slice(0, 10))
      cur.setDate(cur.getDate() + 1)
    }
    desde = days[0]
    hasta = days[days.length - 1]
  } else {
    // Vista semanal (default): lunes a domingo
    let monday: Date
    if (sp.semana && /^\d{4}-\d{2}-\d{2}$/.test(sp.semana)) {
      monday = new Date(sp.semana + 'T00:00:00')
    } else {
      monday = new Date()
      const day = monday.getDay()
      const offset = day === 0 ? -6 : 1 - day
      monday.setDate(monday.getDate() + offset)
    }
    monday.setHours(0, 0, 0, 0)
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday)
      d.setDate(monday.getDate() + i)
      days.push(d.toISOString().slice(0, 10))
    }
    desde = days[0]
    hasta = days[6]
  }

  const activeCompanyId = await getActiveCompanyForPage()
  const supabase = createAdminSupabaseClient()

  const [employeesRes, projectsRes, assignmentsRes, holidaysRes, jornadasRes] = await Promise.all([
    supabase
      .from('employees')
      .select('id, nombre, nif, fecha_baja')
      .eq('company_id', activeCompanyId)
      .is('deleted_at', null)
      .order('nombre'),
    supabase
      .from('projects')
      .select('id, code, name, status')
      .eq('company_id', activeCompanyId)
      .is('deleted_at', null)
      .order('code', { ascending: false }),
    supabase
      .from('worker_assignments')
      .select(
        `id, fecha, employee_id, project_id, jornada_esperada_horas, notas,
         project:project_id (id, code, name)`,
      )
      .eq('company_id', activeCompanyId)
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .is('deleted_at', null),
    supabase
      .from('holidays')
      .select('fecha, nombre, ambito')
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .or(
        'ambito.eq.nacional,and(ambito.eq.autonomico,comunidad_autonoma.eq.MADRID),' +
          `and(ambito.eq.local,municipio.eq.Madrid),and(ambito.eq.convenio,comunidad_autonoma.eq.MADRID),` +
          `and(ambito.eq.no_laborable,comunidad_autonoma.eq.MADRID),and(ambito.eq.empresa,company_id.eq.${activeCompanyId})`,
      ),
    // Calcular jornada esperada por cada día (RPC)
    Promise.all(
      days.map(async (d) => {
        const { data } = await supabase.rpc('get_jornada_esperada_horas', {
          p_fecha: d,
          p_company_id: activeCompanyId,
        })
        return { fecha: d, horas: Number(data ?? 0) }
      }),
    ),
  ])

  const employeesActivos = (employeesRes.data ?? []).filter((e) => !e.fecha_baja)

  return (
    <CuadranteView
      employees={employeesActivos}
      projects={projectsRes.data ?? []}
      assignments={assignmentsRes.data ?? []}
      days={days}
      mondayIso={desde}
      holidays={holidaysRes.data ?? []}
      jornadas={jornadasRes}
      vista={vista}
    />
  )
}
