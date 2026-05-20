import TypedDocsView from '../../_shared/TypedDocsView'
import { INFORMES_CONFIG } from '../../_shared/configs/informes'
import { loadTypedInitialData } from '../../_shared/loadTyped'

export const dynamic = 'force-dynamic'

export default async function InformesPage() {
  const { initialData } = await loadTypedInitialData(INFORMES_CONFIG)
  return <TypedDocsView config={INFORMES_CONFIG} initialData={initialData} />
}
