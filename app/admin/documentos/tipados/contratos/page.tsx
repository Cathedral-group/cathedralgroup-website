import TypedDocsView from '../../_shared/TypedDocsView'
import { CONTRATOS_CONFIG } from '../../_shared/configs/contratos'
import { loadTypedInitialData } from '../../_shared/loadTyped'

export const dynamic = 'force-dynamic'

export default async function ContratosTipadosPage() {
  const { initialData } = await loadTypedInitialData(CONTRATOS_CONFIG)
  return <TypedDocsView config={CONTRATOS_CONFIG} initialData={initialData} />
}
