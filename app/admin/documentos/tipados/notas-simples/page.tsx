import TypedDocsView from '../../_shared/TypedDocsView'
import { NOTAS_SIMPLES_CONFIG } from '../../_shared/configs/notas-simples'
import { loadTypedInitialData } from '../../_shared/loadTyped'

export const dynamic = 'force-dynamic'

export default async function NotasSimplesPage() {
  const { initialData } = await loadTypedInitialData(NOTAS_SIMPLES_CONFIG)
  return <TypedDocsView config={NOTAS_SIMPLES_CONFIG} initialData={initialData} />
}
