import TypedDocsView from '../../_shared/TypedDocsView'
import { JUSTIFICANTES_PAGO_CONFIG } from '../../_shared/configs/justificantes-pago'
import { loadTypedInitialData } from '../../_shared/loadTyped'

export const dynamic = 'force-dynamic'

export default async function JustificantesPagoPage() {
  const { initialData } = await loadTypedInitialData(JUSTIFICANTES_PAGO_CONFIG)
  return <TypedDocsView config={JUSTIFICANTES_PAGO_CONFIG} initialData={initialData} />
}
