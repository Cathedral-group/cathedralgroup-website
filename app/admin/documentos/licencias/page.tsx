import { redirect } from 'next/navigation'

// Consolidación Fase 4: licencias no tiene vista tipada; hogar = hub filtrado.
// La página vieja leía `documents` (vacío).
export default function LicenciasRedirect() {
  redirect('/admin/documentos?tipo=licencia')
}
