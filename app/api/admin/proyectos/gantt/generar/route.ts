/**
 * POST /api/admin/proyectos/gantt/generar
 *
 * Genera automáticamente las tareas del Gantt a partir del presupuesto del
 * proyecto: agrupa las partidas por capítulo, calcula la duración de cada uno
 * (horas ÷ jornada ÷ trabajadores) y las coloca en cascada de días laborables
 * en orden constructivo. Reemplaza las auto-generadas previas (gantt_auto).
 *
 * body: { project_id: uuid, num_trabajadores?: int }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/auth-allowlist'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Orden constructivo + nombre por capítulo (mismo criterio que orden_montaje)
const CAP: Record<string, { orden: number; nombre: string }> = {
  '20': { orden: 5, nombre: 'Gestión de obra' },
  '21': { orden: 8, nombre: 'Maquinaria y medios auxiliares' },
  '01': { orden: 10, nombre: 'Demoliciones y trabajos previos' },
  '16': { orden: 20, nombre: 'Estructura y refuerzo' },
  '15': { orden: 30, nombre: 'Impermeabilización' },
  '02': { orden: 40, nombre: 'Tabiquería' },
  '09': { orden: 50, nombre: 'Fontanería' },
  '08': { orden: 55, nombre: 'Electricidad' },
  '19': { orden: 57, nombre: 'Gas' },
  '10': { orden: 60, nombre: 'Climatización' },
  '22': { orden: 65, nombre: 'Ayudas de oficio' },
  '05': { orden: 70, nombre: 'Techos' },
  '04': { orden: 80, nombre: 'Revestimientos paredes' },
  '03': { orden: 90, nombre: 'Revestimientos suelos' },
  '07': { orden: 100, nombre: 'Carpintería exterior' },
  '06': { orden: 110, nombre: 'Carpintería interior' },
  '17': { orden: 120, nombre: 'Cerrajería y metalistería' },
  '12': { orden: 130, nombre: 'Cocinas' },
  '13': { orden: 135, nombre: 'Baños' },
  '11': { orden: 140, nombre: 'Pintura' },
  '18': { orden: 160, nombre: 'Iluminación' },
  '23': { orden: 170, nombre: 'Revestimientos exteriores' },
  '24': { orden: 175, nombre: 'Urbanización y exteriores' },
  '14': { orden: 180, nombre: 'Varios' },
  '25': { orden: 185, nombre: 'Varios' },
}

function isWeekend(d: Date) { const x = d.getDay(); return x === 0 || x === 6 }
function nextBusinessDay(d: Date): Date {
  const r = new Date(d)
  while (isWeekend(r)) r.setDate(r.getDate() + 1)
  return r
}
function addBusinessDays(start: Date, n: number): Date {
  const d = new Date(start)
  let added = 0
  while (added < n) { d.setDate(d.getDate() + 1); if (!isWeekend(d)) added++ }
  return d
}
function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function authCheck() {
  const c = await createServerSupabaseClient()
  const { data, error } = await c.auth.getUser()
  if (error || !data?.user?.email) return null
  if (!isAdminEmail(data.user.email)) return null
  const { data: aal } = await c.auth.mfa.getAuthenticatorAssuranceLevel()
  if (!aal || aal.currentLevel !== 'aal2') return null
  return data.user
}

interface QuoteItem { chapter_code?: string; chapter_name?: string; quantity?: number; horas_por_unidad?: number | null }

export async function POST(request: NextRequest) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: { project_id?: string; num_trabajadores?: number }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  if (!body.project_id || !UUID_RE.test(body.project_id)) return NextResponse.json({ error: 'project_id inválido' }, { status: 400 })
  const numTrab = Math.max(1, Math.trunc(body.num_trabajadores ?? 2))

  const supabase = createAdminSupabaseClient()

  const { data: project } = await supabase
    .from('projects').select('id, start_date').eq('id', body.project_id).is('deleted_at', null).maybeSingle()
  if (!project) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 })

  // Presupuesto más reciente del proyecto
  const { data: quote } = await supabase
    .from('quotes').select('items').eq('project_id', body.project_id).is('deleted_at', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  const items = (quote?.items ?? []) as QuoteItem[]
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'El proyecto no tiene presupuesto con partidas' }, { status: 400 })
  }

  // Agrupar horas por capítulo
  const horasPorCap: Record<string, number> = {}
  const nombrePorCap: Record<string, string> = {}
  for (const it of items) {
    const ch = it.chapter_code
    if (!ch || !CAP[ch]) continue
    const horas = (Number(it.quantity) || 0) * (Number(it.horas_por_unidad) || 0)
    horasPorCap[ch] = (horasPorCap[ch] ?? 0) + horas
    nombrePorCap[ch] = it.chapter_name || CAP[ch].nombre
  }
  const caps = Object.keys(horasPorCap)
    .filter((ch) => horasPorCap[ch] > 0)
    .sort((a, b) => CAP[a].orden - CAP[b].orden)
  if (caps.length === 0) {
    return NextResponse.json({ error: 'Las partidas no tienen rendimientos (horas) para planificar' }, { status: 400 })
  }

  // Cascada de fechas laborables desde start_date (o hoy)
  const startBase = project.start_date ? new Date(project.start_date + 'T00:00:00') : new Date()
  let cursor = nextBusinessDay(startBase)
  const tasks = caps.map((ch) => {
    const dur = Math.max(1, Math.ceil(horasPorCap[ch] / (8 * numTrab)))
    const fini = nextBusinessDay(cursor)
    const ffin = addBusinessDays(fini, dur - 1)
    cursor = addBusinessDays(ffin, 1)
    return {
      texto: nombrePorCap[ch] || CAP[ch].nombre,
      orden: CAP[ch].orden,
      fecha_inicio_plan: toDateStr(fini),
      fecha_fin_plan: toDateStr(ffin),
    }
  })

  const { data: count, error } = await supabase.rpc('replace_gantt_tasks', {
    p_project_id: body.project_id,
    p_tasks: tasks,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, tareas: count, capitulos: caps.length, fin: tasks[tasks.length - 1]?.fecha_fin_plan })
}
