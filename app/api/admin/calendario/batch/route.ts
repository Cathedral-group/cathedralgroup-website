/**
 * POST /api/admin/calendario/batch
 *
 * Crea múltiples ítems en 1 request (feedback David sesión 21/05 noche:
 * "poder colocar a Rafa en una obra con X tareas y a otro trabajador en otra
 * obra con otras tareas en el mismo panel").
 *
 * Body:
 *   {
 *     fecha: 'YYYY-MM-DD',
 *     asignaciones?: [{ employee_id, project_id, observaciones? }, ...],
 *     tareas?:        [{ project_id, texto, prioridad?, fecha_objetivo? }, ...],
 *     ausencias?:     [{ employee_id, tipo, fecha_fin, motivo_detalle? }, ...],
 *     festivos?:      [{ nombre, ambito? }, ...],
 *   }
 *
 * Insertados a 4 tablas:
 *   - time_records (asignaciones)
 *   - project_tasks (tareas)
 *   - worker_absences (ausencias)
 *   - holidays (festivos Cathedral, ambito='empresa')
 *
 * Auth: admin AAL2 + activeCompany filter + audit log.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/auth-allowlist'
import { getActiveCompanyForPage } from '@/lib/company-aware-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VALID_ABS_TIPOS = ['vacaciones', 'baja_medica', 'permiso_retribuido', 'asuntos_propios', 'ausencia_no_justificada', 'banco_horas']
const VALID_PRIORIDADES = ['baja', 'media', 'alta', 'critica']

async function authCheck() {
  const c = await createServerSupabaseClient()
  const { data, error } = await c.auth.getUser()
  if (error || !data?.user?.email) return null
  if (!isAdminEmail(data.user.email)) return null
  const { data: aal } = await c.auth.mfa.getAuthenticatorAssuranceLevel()
  if (!aal || aal.currentLevel !== 'aal2') return null
  return data.user
}

interface AsigInput { employee_id: string; project_id?: string | null; observaciones?: string }
interface TareaInput { project_id?: string | null; texto: string; prioridad?: string; fecha_objetivo?: string | null }
interface AusenciaInput { employee_id: string; tipo: string; fecha_fin: string; motivo_detalle?: string }
interface FestivoInput { nombre: string; ambito?: string }

interface Body {
  fecha: string
  asignaciones?: AsigInput[]
  tareas?: TareaInput[]
  ausencias?: AusenciaInput[]
  festivos?: FestivoInput[]
}

export async function POST(request: NextRequest) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: Body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const { fecha } = body
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ error: 'fecha YYYY-MM-DD requerida' }, { status: 400 })
  }

  const companyId = await getActiveCompanyForPage()
  const supabase = createAdminSupabaseClient()

  const results: Record<string, { ok: number; errors: string[] }> = {
    asignaciones: { ok: 0, errors: [] },
    tareas: { ok: 0, errors: [] },
    ausencias: { ok: 0, errors: [] },
    festivos: { ok: 0, errors: [] },
  }

  // ───── 1. Asignaciones → time_records ─────
  if (body.asignaciones && Array.isArray(body.asignaciones)) {
    const rows = body.asignaciones
      .filter((a) => a.employee_id)
      .map((a) => ({
        employee_id: a.employee_id,
        fecha,
        project_id: a.project_id || null,
        observaciones: a.observaciones || null,
      }))
    if (rows.length > 0) {
      const { error, data } = await supabase.from('time_records').insert(rows).select()
      if (error) results.asignaciones.errors.push(error.message)
      else results.asignaciones.ok = data?.length ?? rows.length
    }
  }

  // ───── 2. Tareas → project_tasks ─────
  if (body.tareas && Array.isArray(body.tareas)) {
    const rows = body.tareas
      .filter((t) => t.texto && t.texto.trim())
      .map((t) => ({
        company_id: companyId,
        project_id: t.project_id || null,
        texto: t.texto.trim(),
        prioridad: VALID_PRIORIDADES.includes(t.prioridad || '') ? t.prioridad : 'media',
        estado: 'pendiente',
        fecha_objetivo: t.fecha_objetivo || fecha,
      }))
    if (rows.length > 0) {
      const { error, data } = await supabase.from('project_tasks').insert(rows).select()
      if (error) results.tareas.errors.push(error.message)
      else results.tareas.ok = data?.length ?? rows.length
    }
  }

  // ───── 3. Ausencias → worker_absences ─────
  if (body.ausencias && Array.isArray(body.ausencias)) {
    const rows = body.ausencias
      .filter((a) => a.employee_id && VALID_ABS_TIPOS.includes(a.tipo))
      .map((a) => ({
        company_id: companyId,
        employee_id: a.employee_id,
        tipo: a.tipo,
        fecha_inicio: fecha,
        fecha_fin: a.fecha_fin && /^\d{4}-\d{2}-\d{2}$/.test(a.fecha_fin) ? a.fecha_fin : fecha,
        motivo_detalle: a.motivo_detalle || null,
        status: 'approved',
        solicitud_fuente: 'admin',
      }))
    if (rows.length > 0) {
      const { error, data } = await supabase.from('worker_absences').insert(rows).select()
      if (error) results.ausencias.errors.push(error.message)
      else results.ausencias.ok = data?.length ?? rows.length
    }
  }

  // ───── 4. Festivos → holidays (custom Cathedral) ─────
  if (body.festivos && Array.isArray(body.festivos)) {
    const rows = body.festivos
      .filter((f) => f.nombre && f.nombre.trim())
      .map((f) => ({
        company_id: companyId,
        fecha,
        nombre: f.nombre.trim(),
        ambito: f.ambito || 'empresa',
        fuente: 'admin_calendario',
      }))
    if (rows.length > 0) {
      const { error, data } = await supabase.from('holidays').insert(rows).select()
      if (error) results.festivos.errors.push(error.message)
      else results.festivos.ok = data?.length ?? rows.length
    }
  }

  const totalOk = Object.values(results).reduce((s, r) => s + r.ok, 0)
  const totalErrors = Object.values(results).reduce((s, r) => s + r.errors.length, 0)

  return NextResponse.json({
    ok: totalErrors === 0,
    total_created: totalOk,
    fecha,
    results,
  })
}
