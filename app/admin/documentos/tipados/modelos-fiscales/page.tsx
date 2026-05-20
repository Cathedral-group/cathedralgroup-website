import TypedDocsView from '../../_shared/TypedDocsView'
import { MODELOS_FISCALES_CONFIG } from '../../_shared/configs/modelos-fiscales'
import { loadTypedInitialData } from '../../_shared/loadTyped'

export const dynamic = 'force-dynamic'

export default async function ModelosFiscalesPage() {
  const { initialData } = await loadTypedInitialData(MODELOS_FISCALES_CONFIG)
  return <TypedDocsView config={MODELOS_FISCALES_CONFIG} initialData={initialData} />
}
