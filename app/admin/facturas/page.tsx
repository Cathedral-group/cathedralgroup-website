import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import AdminCrudPage from '@/components/admin/AdminCrudPage'

export default async function FacturasPage() {
  const authClient = await createServerSupabaseClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/admin/login')

  const supabase = createAdminSupabaseClient()

  const { data } = await supabase
    .from('invoices')
    .select('*')
    .order('issue_date', { ascending: false })

  return (
    <AdminCrudPage
      title="Facturas"
      table="invoices"
      data={data || []}
      columns={[
        { key: 'number', label: 'Nº Factura' },
        { key: 'concept', label: 'Concepto' },
        { key: 'direction', label: 'Tipo' },
        { key: 'amount_total', label: 'Total (€)' },
        { key: 'issue_date', label: 'Fecha' },
        { key: 'payment_status', label: 'Estado' },
      ]}
      fields={[
        { name: 'number', label: 'Nº Factura', type: 'text', required: true },
        { name: 'concept', label: 'Concepto', type: 'text', required: true },
        { name: 'direction', label: 'Tipo', type: 'select', options: ['emitida', 'recibida'] },
        { name: 'doc_type', label: 'Tipo Documento', type: 'select', options: ['factura', 'proforma', 'rectificativa', 'abono'] },
        { name: 'amount_base', label: 'Base Imponible (€)', type: 'number' },
        { name: 'vat_pct', label: 'IVA (%)', type: 'number' },
        { name: 'vat_amount', label: 'IVA (€)', type: 'number' },
        { name: 'amount_total', label: 'Total (€)', type: 'number', required: true },
        { name: 'irpf_rate', label: 'IRPF (%)', type: 'number' },
        { name: 'irpf_amount', label: 'IRPF (€)', type: 'number' },
        { name: 'issue_date', label: 'Fecha Emisión', type: 'date', required: true },
        { name: 'due_date', label: 'Fecha Vencimiento', type: 'date' },
        { name: 'payment_status', label: 'Estado Pago', type: 'select', options: ['pendiente', 'pagada', 'vencida', 'parcial'] },
        { name: 'payment_date', label: 'Fecha Pago', type: 'date' },
        { name: 'payment_method', label: 'Método Pago', type: 'select', options: ['transferencia', 'tarjeta', 'efectivo', 'cheque'] },
        { name: 'supplier_nif', label: 'NIF Proveedor', type: 'text' },
        { name: 'categoria_gasto', label: 'Categoría Gasto', type: 'select', options: ['material', 'mano_obra', 'subcontrata', 'alquiler', 'servicios', 'otros'] },
        { name: 'proyecto_code', label: 'Código Proyecto', type: 'text' },
        { name: 'es_rectificativa', label: '¿Rectificativa?', type: 'select', options: ['false', 'true'] },
        { name: 'numero_factura_original', label: 'Nº Factura Original', type: 'text' },
        { name: 'notes', label: 'Notas', type: 'textarea' },
      ]}
    />
  )
}
