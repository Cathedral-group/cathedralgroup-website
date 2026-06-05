import { redirect } from 'next/navigation'

// Consolidación Fase 4: el hogar canónico de contratos es la vista tipada
// (lee la tabla `contratos`). La página vieja leía `documents` (vacío).
export default function ContratosRedirect() {
  redirect('/admin/documentos/tipados/contratos')
}
