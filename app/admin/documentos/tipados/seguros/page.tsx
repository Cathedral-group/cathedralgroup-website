import TypedDocsView from '../../_shared/TypedDocsView'
import { SEGUROS_CONFIG } from '../../_shared/configs/seguros'
import { loadTypedInitialData } from '../../_shared/loadTyped'

export const dynamic = 'force-dynamic'

export default async function SegurosTipadosPage() {
  const { initialData } = await loadTypedInitialData(SEGUROS_CONFIG)
  return <TypedDocsView config={SEGUROS_CONFIG} initialData={initialData} />
}
