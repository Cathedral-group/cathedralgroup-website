import { redirect } from 'next/navigation'

// Consolidación Fase 4: "flota" no es un doc_type del registry y no tiene datos
// (leía `documents`, vacío) → al hub global.
export default function FlotaRedirect() {
  redirect('/admin/documentos')
}
