import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect, notFound } from 'next/navigation'
import { getActiveCompanyForPage } from '@/lib/company-aware-server'
import GanttProjectView from './GanttProjectView'

interface PageProps {
  params: Promise<{ code: string }>
}

export const dynamic = 'force-dynamic'

export default async function ProjectGanttPage({ params }: PageProps) {
  const authClient = await createServerSupabaseClient()
  const { data: userData, error: authError } = await authClient.auth.getUser()
  if (authError || !userData?.user) redirect('/admin/login')

  const { code } = await params
  const activeCompanyId = await getActiveCompanyForPage()
  const supabase = createAdminSupabaseClient()

  const { data: project } = await supabase
    .from('projects')
    .select('id, code, name, status, start_date, end_date_planned, end_date_real, company_id, gantt_inicio_previsto, gantt_fin_previsto, gantt_horas_previstas, gantt_trabajadores_previstos')
    .eq('code', code)
    .eq('company_id', activeCompanyId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!project) notFound()

  const { data: tasks } = await supabase
    .from('project_tasks')
    .select(
      `id, texto, estado, prioridad, subtipo, tipo, phase_id,
       fecha_objetivo, fecha_inicio_plan, fecha_fin_plan, orden, parent_task_id, dependencias, pausas, dias_extra, segmentos,
       hora_inicio, hora_fin`,
    )
    .eq('project_id', project.id)
    .is('deleted_at', null)
    .order('orden', { ascending: true, nullsFirst: false })
    .order('fecha_inicio_plan', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  // Festivos de la empresa (para marcarlos en el Gantt y no contar como horas)
  const { data: holidays } = await supabase
    .from('holidays')
    .select('fecha, nombre')
    .eq('company_id', activeCompanyId)
    .order('fecha')

  return (
    <GanttProjectView
      project={project}
      tasks={(tasks ?? []) as never}
      holidays={(holidays ?? []) as Array<{ fecha: string; nombre: string }>}
    />
  )
}
