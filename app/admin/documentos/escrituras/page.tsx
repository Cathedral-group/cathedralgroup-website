import { redirect } from 'next/navigation'

// Consolidación Fase 4: escrituras no tiene vista tipada; su hogar es el hub
// filtrado (los datos canónicos se ven vía matview). La página vieja leía `documents` (vacío).
export default function EscriturasRedirect() {
  redirect('/admin/documentos?tipo=escritura')
}
