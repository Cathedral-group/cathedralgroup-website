import { redirect } from 'next/navigation'

// Consolidación Fase 4: los modelos fiscales (documento) viven en su vista tipada;
// el hub filtra por modelo_fiscal. (Ojo: /admin/fiscal es el calendario AEAT, otra cosa.)
// La página vieja leía `documents` doc_category='fiscal' (vacío).
export default function DocsFiscalRedirect() {
  redirect('/admin/documentos?tipo=modelo_fiscal')
}
