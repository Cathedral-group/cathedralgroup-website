import TypedDocsView from '../../_shared/TypedDocsView'
import { ALBARANES_CONFIG } from '../../_shared/configs/albaranes'
import { loadTypedInitialData } from '../../_shared/loadTyped'

export const dynamic = 'force-dynamic'

export default async function AlbaranesPage() {
  const { initialData } = await loadTypedInitialData(ALBARANES_CONFIG)
  return <TypedDocsView config={ALBARANES_CONFIG} initialData={initialData} />
}
