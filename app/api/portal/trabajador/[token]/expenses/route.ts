/**
 * Gastos del día apuntados por trabajador — Fase 5
 *
 * GET    /api/portal/trabajador/[token]/expenses?desde=&hasta=
 *        Lista gastos del trabajador con filtros opcionales.
 *
 * POST   /api/portal/trabajador/[token]/expenses
 *        Body: { fecha, tipo, ...campos según tipo }
 *        Crea un gasto. Tipos: dieta, kilometraje, material, aparcamiento, peaje, otro
 *
 * DELETE /api/portal/trabajador/[token]/expenses?id=...
 *        Soft-delete (solo si todavía no ha sido confirmed/reimbursed por admin).
 *
 * Aislamiento: NO usa Supabase Auth.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

const ALLOWED_TIPOS = ['dieta', 'kilometraje', 'material', 'aparcamiento', 'peaje', 'otro']

interface ExpenseBody {
  fecha?: string
  tipo?: string
  project_id?: string | null
  importe?: number
  km_recorridos?: number
  km_origen?: string
  km_destino?: string
  material_descripcion?: string
  material_cantidad?: number
  material_unidad?: string
  observaciones?: string
}

async function validateToken(supabase: ReturnType<typeof createAdminSupabaseClient>, token: string, ip: string | null, ua: string | null) {
  const { data, error } = await supabase.rpc('validate_and_track_worker_token', {
    p_token: token,
    p_ip: ip,
    p_user_agent: ua,
  })
  if (error || !data?.valid) return null
  return { employeeId: data.employee_id as string, companyId: data.company_id as string }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  if (!token || token.length < 30) return NextResponse.json({ error: 'Token inválido' }, { status: 401 })

  const supabase = createAdminSupabaseClient()
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
  const ua = request.headers.get('user-agent') ?? null
  const validation = await validateToken(supabase, token, ip, ua)
  if (!validation) return NextResponse.json({ error: 'Token inválido o expirado' }, { status: 401 })

  const url = new URL(request.url)
  const desde = url.searchParams.get('desde')
  const hasta = url.searchParams.get('hasta')

  let query = supabase
    .from('worker_expense_items')
    .select(
      `id, fecha, tipo, project_id, importe, km_recorridos, km_origen, km_destino,
       material_descripcion, material_cantidad, material_unidad, observaciones,
       fuente, status, reviewed_at, created_at,
       project:project_id (code, name)`,
    )
    .eq('employee_id', validation.employeeId)
    .is('deleted_at', null)

  if (desde) query = query.gte('fecha', desde)
  if (hasta) query = query.lte('fecha', hasta)

  const { data, error } = await query.order('fecha', { ascending: false }).limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rows: data ?? [] })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  if (!token || token.length < 30) return NextResponse.json({ error: 'Token inválido' }, { status: 401 })

  const supabase = createAdminSupabaseClient()
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
  const ua = request.headers.get('user-agent') ?? null
  const validation = await validateToken(supabase, token, ip, ua)
  if (!validation) return NextResponse.json({ error: 'Token inválido o expirado' }, { status: 401 })

  let body: ExpenseBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  if (!body.fecha) return NextResponse.json({ error: 'fecha requerida' }, { status: 400 })
  if (!body.tipo || !ALLOWED_TIPOS.includes(body.tipo)) {
    return NextResponse.json({ error: 'tipo inválido' }, { status: 400 })
  }

  // Restricción anti-manipulación: solo hoy o ayer
  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().slice(0, 10)
  if (body.fecha !== today && body.fecha !== yesterdayStr) {
    return NextResponse.json({ error: 'Solo se permite registrar hoy o ayer' }, { status: 400 })
  }

  // Validar project si se da
  if (body.project_id) {
    const { data: proj } = await supabase
      .from('projects')
      .select('id')
      .eq('id', body.project_id)
      .eq('company_id', validation.companyId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!proj) return NextResponse.json({ error: 'Proyecto no válido' }, { status: 400 })
  }

  // Validaciones por tipo
  if (body.tipo === 'kilometraje') {
    if (!body.km_recorridos || body.km_recorridos <= 0) {
      return NextResponse.json({ error: 'km_recorridos requerido (>0)' }, { status: 400 })
    }
    if (body.km_recorridos > 1000) {
      return NextResponse.json({ error: 'km_recorridos sospechoso (>1000)' }, { status: 400 })
    }
  } else if (body.tipo === 'material') {
    if (!body.material_descripcion?.trim()) {
      return NextResponse.json({ error: 'material_descripcion requerida' }, { status: 400 })
    }
  } else {
    if (!body.importe || body.importe <= 0) {
      return NextResponse.json({ error: 'importe requerido (>0)' }, { status: 400 })
    }
    if (body.importe > 10000) {
      return NextResponse.json({ error: 'importe sospechoso (>10.000€)' }, { status: 400 })
    }
  }

  const { data, error } = await supabase
    .from('worker_expense_items')
    .insert({
      company_id: validation.companyId,
      employee_id: validation.employeeId,
      project_id: body.project_id ?? null,
      fecha: body.fecha,
      tipo: body.tipo,
      importe: body.importe ?? null,
      km_recorridos: body.km_recorridos ?? null,
      km_origen: body.km_origen ?? null,
      km_destino: body.km_destino ?? null,
      material_descripcion: body.material_descripcion ?? null,
      material_cantidad: body.material_cantidad ?? null,
      material_unidad: body.material_unidad ?? null,
      observaciones: body.observaciones ?? null,
      fuente: 'app_movil',
      status: 'pending',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, row: data })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  if (!token || token.length < 30) return NextResponse.json({ error: 'Token inválido' }, { status: 401 })

  const supabase = createAdminSupabaseClient()
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
  const ua = request.headers.get('user-agent') ?? null
  const validation = await validateToken(supabase, token, ip, ua)
  if (!validation) return NextResponse.json({ error: 'Token inválido o expirado' }, { status: 401 })

  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  // Solo borrar si está pending (no confirmed/reimbursed)
  const { data: item } = await supabase
    .from('worker_expense_items')
    .select('id, status')
    .eq('id', id)
    .eq('employee_id', validation.employeeId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!item) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (item.status !== 'pending') {
    return NextResponse.json({ error: 'Ya revisado por la administración, no se puede borrar' }, { status: 403 })
  }

  const { error } = await supabase
    .from('worker_expense_items')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export const dynamic = 'force-dynamic'
