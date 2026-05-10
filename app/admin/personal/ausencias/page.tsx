import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { getActiveCompanyForPage } from '@/lib/company-aware-server'
import AusenciasAdminView from './AusenciasAdminView'

export default async function AusenciasAdminPage() {
  const authClient = await createServerSupabaseClient()
  const { data: userData, error: authError } = await authClient.auth.getUser()
  if (authError || !userData?.user) redirect('/admin/login')

  const activeCompanyId = await getActiveCompanyForPage()
  const supabase = createAdminSupabaseClient()

  const [absencesRes, employeesRes] = await Promise.all([
    supabase
      .from('worker_absences')
      .select(
        `id, tipo, motivo_detalle, fecha_inicio, fecha_fin, dias_total, horas_total,
         solicitado_at, solicitado_por, solicitud_fuente, status, decided_at,
         decided_by_email, decision_notes, justificante_attachment_id, created_at,
         employee:employee_id (id, nombre, nif)`,
      )
      .eq('company_id', activeCompanyId)
      .is('deleted_at', null)
      .order('fecha_inicio', { ascending: false })
      .limit(200),
    supabase
      .from('employees')
      .select('id, nombre, nif, fecha_baja')
      .eq('company_id', activeCompanyId)
      .is('deleted_at', null)
      .order('nombre'),
  ])

  const activos = (employeesRes.data ?? []).filter((e) => !e.fecha_baja)

  return (
    <AusenciasAdminView
      initialAbsences={absencesRes.data ?? []}
      employees={activos}
    />
  )
}
