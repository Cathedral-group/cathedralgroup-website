import { notFound } from 'next/navigation'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import HistorialView from './HistorialView'

type SearchParams = { anio?: string; mes?: string }

export default async function HistorialPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<SearchParams>
}) {
  const { token } = await params
  if (!token || token.length < 30) notFound()

  const sp = await searchParams
  const today = new Date()
  const anio = parseInt(sp.anio ?? String(today.getFullYear()), 10)
  const mes = parseInt(sp.mes ?? String(today.getMonth() + 1), 10)

  const supabase = createAdminSupabaseClient()
  const { data: validation } = await supabase.rpc('validate_and_track_worker_token', {
    p_token: token,
    p_ip: null,
    p_user_agent: null,
  })
  if (!validation?.valid) notFound()

  const employeeId: string = validation.employee_id

  const desde = `${anio}-${String(mes).padStart(2, '0')}-01`
  const lastDay = new Date(anio, mes, 0).getDate()
  const hasta = `${anio}-${String(mes).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const { data: rows } = await supabase
    .from('time_records')
    .select(
      `id, fecha, project_id, horas_ordinarias, horas_extra, horas_nocturnas,
       observaciones, fuente, hash_registro, worker_signed_at, modificado_at, modificado_motivo,
       project:project_id (code, name)`,
    )
    .eq('employee_id', employeeId)
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .is('deleted_at', null)
    .order('fecha', { ascending: true })

  return (
    <HistorialView
      token={token}
      employee={{
        nombre: validation.employee_nombre ?? '',
        nif: validation.employee_nif ?? '',
      }}
      anio={anio}
      mes={mes}
      desde={desde}
      hasta={hasta}
      rows={rows ?? []}
    />
  )
}
