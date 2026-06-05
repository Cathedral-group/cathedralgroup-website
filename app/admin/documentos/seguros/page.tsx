import { redirect } from 'next/navigation'

// Consolidación Fase 4: hogar canónico de seguros = vista tipada (tabla `seguros`).
// La página vieja leía `documents` (vacío).
export default function SegurosRedirect() {
  redirect('/admin/documentos/tipados/seguros')
}
