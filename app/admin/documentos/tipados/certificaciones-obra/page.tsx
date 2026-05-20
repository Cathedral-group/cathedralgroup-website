import TypedDocsView from '../../_shared/TypedDocsView'
import { CERTIFICACIONES_OBRA_CONFIG } from '../../_shared/configs/certificaciones-obra'
import { loadTypedInitialData } from '../../_shared/loadTyped'

export const dynamic = 'force-dynamic'

export default async function CertificacionesObraPage() {
  const { initialData } = await loadTypedInitialData(CERTIFICACIONES_OBRA_CONFIG)
  return <TypedDocsView config={CERTIFICACIONES_OBRA_CONFIG} initialData={initialData} />
}
