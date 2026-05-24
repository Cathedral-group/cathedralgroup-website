/**
 * POST /api/admin/proyectos/gantt/dia-extra
 *
 * Activa/desactiva un día extra de trabajo (sábado/domingo/festivo) para una
 * tarea. Toggle: si ya está, lo quita; si no, lo añade.
 *
 * body: { task_id: uuid, fecha: 'YYYY-MM-DD', horas?: number }
 *   horas omitido o 0 → quita el día. Con horas → lo añade (p.ej. sábado 4h).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/auth-allowlist'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

async function authCheck() {
  const c = await createServerSupabaseClient()
  const { data, error } = await c.auth.getUser()
  if (error || !data?.user?.email) return null
  if (!isAdminEmail(data.user.email)) return null
  const { data: aal } = await c.auth.mfa.getAuthenticatorAssuranceLevel()
  if (!aal || aal.currentLevel !== 'aal2') return null
  return data.user
}

export async function POST(request: NextRequest) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: { task_id?: string; fecha?: string; horas?: number }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  if (!body.task_id || !UUID_RE.test(body.task_id)) return NextResponse.json({ error: 'task_id inválido' }, { status: 400 })
  if (!body.fecha || !DATE_RE.test(body.fecha)) return NextResponse.json({ error: 'fecha inválida' }, { status: 400 })
  const horas = Math.max(0, Math.min(24, Number(body.horas) || 0))

  const supabase = createAdminSupabaseClient()
  const { data: t } = await supabase
    .from('project_tasks').select('dias_extra').eq('id', body.task_id).is('deleted_at', null).maybeSingle()
  if (!t) return NextResponse.json({ error: 'Tarea no encontrada' }, { status: 404 })

  // Normaliza formato (legacy string[] → [{fecha,horas}])
  type Dia = { fecha: string; horas: number }
  const raw = Array.isArray(t.dias_extra) ? (t.dias_extra as unknown[]) : []
  const arr: Dia[] = raw.map((x) => (typeof x === 'string' ? { fecha: x, horas: 8 } : x as Dia))
  const existe = arr.some((d) => d.fecha === body.fecha)

  // horas=0 → quitar. Con horas → añadir (o actualizar las horas si ya existe).
  let next: Dia[]
  if (horas === 0) {
    next = arr.filter((d) => d.fecha !== body.fecha)
  } else if (existe) {
    next = arr.map((d) => (d.fecha === body.fecha ? { fecha: d.fecha, horas } : d))
  } else {
    next = [...arr, { fecha: body.fecha!, horas }]
  }

  const { error } = await supabase.from('project_tasks').update({ dias_extra: next }).eq('id', body.task_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, activo: horas > 0, dias_extra: next })
}
