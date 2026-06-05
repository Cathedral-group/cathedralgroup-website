import { redirect } from 'next/navigation'

// Consolidación Fase 4: "corporativo" no es un doc_type del registry y no tiene datos
// (leía `documents`, vacío) → al hub global.
export default function CorporativoRedirect() {
  redirect('/admin/documentos')
}
