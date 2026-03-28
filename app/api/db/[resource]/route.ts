import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'

async function authCheck() {
  const authClient = await createServerSupabaseClient()
  const { data: { user } } = await authClient.auth.getUser()
  return user
}

// Resources that support soft delete (deleted_at field)
const SOFT_DELETE_TABLES = new Set(['leads', 'clients', 'suppliers', 'projects', 'invoices', 'quotes'])

// Map URL segment to actual table name
function tableFor(resource: string): string | null {
  const map: Record<string, string> = {
    leads: 'leads',
    clients: 'clients',
    suppliers: 'suppliers',
    projects: 'projects',
    invoices: 'invoices',
    quotes: 'quotes',
    'project-phases': 'project_phases',
    communications: 'communications',
    papelera: 'papelera', // handled separately
  }
  return map[resource] ?? null
}

type Ctx = { params: Promise<{ resource: string }> }

export async function POST(request: NextRequest, ctx: Ctx) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { resource } = await ctx.params
  const table = tableFor(resource)
  if (!table || table === 'papelera') return NextResponse.json({ error: 'Ruta no válida' }, { status: 404 })

  const body = await request.json()
  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase.from(table).insert(body).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { resource } = await ctx.params

  // Papelera: restore item (set deleted_at = null)
  if (resource === 'papelera') {
    const { id, table } = await request.json()
    if (!id || !table) return NextResponse.json({ error: 'ID y tabla requeridos' }, { status: 400 })
    if (!SOFT_DELETE_TABLES.has(table)) return NextResponse.json({ error: 'Tabla no permitida' }, { status: 400 })
    const supabase = createAdminSupabaseClient()
    const { error } = await supabase.from(table).update({ deleted_at: null }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  const table = tableFor(resource)
  if (!table) return NextResponse.json({ error: 'Ruta no válida' }, { status: 404 })

  const { id, ...updates } = await request.json()
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase.from(table).update(updates).eq('id', id).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, data })
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { resource } = await ctx.params

  // Papelera: permanent delete
  if (resource === 'papelera') {
    const { id, table } = await request.json()
    if (!id || !table) return NextResponse.json({ error: 'ID y tabla requeridos' }, { status: 400 })
    if (!SOFT_DELETE_TABLES.has(table)) return NextResponse.json({ error: 'Tabla no permitida' }, { status: 400 })
    const supabase = createAdminSupabaseClient()
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  const table = tableFor(resource)
  if (!table) return NextResponse.json({ error: 'Ruta no válida' }, { status: 404 })

  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

  const supabase = createAdminSupabaseClient()

  if (SOFT_DELETE_TABLES.has(table)) {
    // Soft delete
    const { error } = await supabase.from(table).update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    // Hard delete (project_phases, communications)
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
