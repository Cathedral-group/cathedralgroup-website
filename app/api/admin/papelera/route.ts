import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'

async function authCheck() {
  const authClient = await createServerSupabaseClient()
  const { data: { user } } = await authClient.auth.getUser()
  return user
}

// Restore item (set deleted_at = null)
export async function PATCH(request: NextRequest) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id, table } = await request.json()
  if (!id || !table) return NextResponse.json({ error: 'ID y tabla requeridos' }, { status: 400 })

  const ALLOWED_TABLES = ['leads', 'clients', 'suppliers', 'projects', 'invoices', 'quotes']
  if (!ALLOWED_TABLES.includes(table)) return NextResponse.json({ error: 'Tabla no permitida' }, { status: 400 })

  const supabase = createAdminSupabaseClient()
  const { error } = await supabase.from(table).update({ deleted_at: null }).eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// Permanently delete item
export async function DELETE(request: NextRequest) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id, table } = await request.json()
  if (!id || !table) return NextResponse.json({ error: 'ID y tabla requeridos' }, { status: 400 })

  const ALLOWED_TABLES = ['leads', 'clients', 'suppliers', 'projects', 'invoices', 'quotes']
  if (!ALLOWED_TABLES.includes(table)) return NextResponse.json({ error: 'Tabla no permitida' }, { status: 400 })

  const supabase = createAdminSupabaseClient()
  const { error } = await supabase.from(table).delete().eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
