import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { getActiveCompanyForPage } from '@/lib/company-aware-server'
import CuadranteView from './CuadranteView'

type SP = { semana?: string }

export default async function CuadrantePage({
  searchParams,
}: {
  searchParams: Promise<SP>
}) {
  const authClient = await createServerSupabaseClient()
  const { data: userData, error: authError } = await authClient.auth.getUser()
  if (authError || !userData?.user) redirect('/admin/login')

  const sp = await searchParams
  // Calcular lunes de la semana objetivo (sp.semana en formato YYYY-MM-DD = lunes)
  let monday: Date
  if (sp.semana && /^\d{4}-\d{2}-\d{2}$/.test(sp.semana)) {
    monday = new Date(sp.semana + 'T00:00:00')
  } else {
    monday = new Date()
    const day = monday.getDay() // 0=dom, 1=lun, ..., 6=sab
    const offset = day === 0 ? -6 : 1 - day
    monday.setDate(monday.getDate() + offset)
  }
  monday.setHours(0, 0, 0, 0)

  const days: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    days.push(d.toISOString().slice(0, 10))
  }
  const desde = days[0]
  const hasta = days[6]

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
    />
  )
}
