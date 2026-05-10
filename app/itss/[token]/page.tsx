import { notFound } from 'next/navigation'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import ItssView from './ItssView'

type Params = { params: Promise<{ token: string }> }

interface ItssRecord {
  id: string
  fecha: string
  employee_id: string
  employee_nombre: string | null
  employee_nif: string | null
  horas_ordinarias: number | null
  horas_extra: number | null
  horas_nocturnas: number | null
  horas_total: number | null
  fuente: string | null
  worker_signed_at: string | null
  hash_registro: string | null
  modificado_at: string | null
  modificado_motivo: string | null
  project_code: string | null
}

export default async function ItssPage({ params }: Params) {
  const { token } = await params
  if (!token || token.length < 30) notFound()

  const supabase = createAdminSupabaseClient()
  const { data: validation } = await supabase.rpc('validate_itss_token', {
    p_token: token,
    p_ip: null,
  })

  if (!validation?.valid) notFound()

  let query = supabase
    .from('vw_itss_time_records')
    .select('*')
    .eq('company_id', validation.company_id)

  if (validation.scope_desde) query = query.gte('fecha', validation.scope_desde)
  if (validation.scope_hasta) query = query.lte('fecha', validation.scope_hasta)
  if (validation.scope_employee_id) query = query.eq('employee_id', validation.scope_employee_id)

  const { data: records } = await query.order('fecha', { ascending: false }).limit(2000)

  return (
    <ItssView
      token={token}
      company={{
        razon_social: validation.company_razon_social ?? '',
        cif: validation.company_cif ?? '',
      }}
      inspector={validation.inspector_nombre ?? ''}
      scope={{
        desde: validation.scope_desde,
        hasta: validation.scope_hasta,
        employee_id: validation.scope_employee_id,
      }}
      expiresAt={validation.expires_at}
      records={(records ?? []) as ItssRecord[]}
    />
  )
}
