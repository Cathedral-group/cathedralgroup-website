import { redirect } from 'next/navigation'

// La sección "Laboral" se consolidó en /admin/personal (sesión 19-21).
// Todo (contratos, nóminas, finiquitos, RNT/RLC, PRL) vive ahí con tablas estructuradas.
export default function LaboralRedirect() {
  redirect('/admin/personal')
}
