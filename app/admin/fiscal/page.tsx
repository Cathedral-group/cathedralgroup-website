import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { getActiveCompanyForPage } from '@/lib/company-aware-server'
import FiscalView from './FiscalView'

export const dynamic = 'force-dynamic'

export default async function FiscalPage() {
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user) redirect('/admin/login')

  const activeCompanyId = await getActiveCompanyForPage()
  const supabase = createAdminSupabaseClient()

  const currentYear = new Date().getFullYear()

  const [filingsRes, upcomingRes, modelosRes, companyRes] = await Promise.all([
    supabase
      .from('tax_filings')
      .select('id, modelo, ejercicio, periodo, fecha_limite, fecha_presentacion, importe_a_ingresar, importe_a_devolver, csv_aeat, justificante_aeat_url, estado, notes, created_at')
      .eq('company_id', activeCompanyId)
      .is('deleted_at', null)
      .order('ejercicio', { ascending: false })
      .order('fecha_limite', { ascending: false })
      .limit(100),
    supabase.rpc('upcoming_fiscal_deadlines', {
      days_ahead: 90,
      days_overdue: 30,
      company_cif: null,
    }),
    supabase.from('fiscal_models').select('codigo, nombre, descripcion, frecuencia').order('codigo'),
    supabase.from('companies').select('cif, razon_social').eq('id', activeCompanyId).single(),
  ])

  const filings = filingsRes.data ?? []
  const deadlines = upcomingRes.data ?? []
  const modelos = modelosRes.data ?? []
  const company = companyRes.data

  // Stats año actual
  const filingsCurrentYear = filings.filter((f) => f.ejercicio === currentYear)
  const presentados = filingsCurrentYear.filter((f) => f.estado === 'presentado')
  const totalIngresadoYear = presentados.reduce(
    (sum, f) => sum + (Number(f.importe_a_ingresar) || 0),
    0,
  )
  const overdue = (deadlines as Array<{ is_overdue: boolean }>).filter((d) => d.is_overdue).length

  return (
    <FiscalView
      activeCompanyId={activeCompanyId}
      company={company}
      filings={filings}
      deadlines={deadlines}
      modelos={modelos}
      stats={{
        currentYear,
        totalFilings: filingsCurrentYear.length,
        presentados: presentados.length,
        totalIngresado: totalIngresadoYear,
        overdue,
        deadlinesNext: deadlines.length,
      }}
    />
  )
}
