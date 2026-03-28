import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'

async function authCheck() {
  const authClient = await createServerSupabaseClient()
  const { data: { user } } = await authClient.auth.getUser()
  return user
}

export async function GET() {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase
    .from('quote_items_catalog')
    .select('*')
    .eq('active', true)
    .order('chapter_code')
    .order('subcategory')
    .order('description')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function PATCH(request: NextRequest) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id, ...updates } = await request.json()
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase
    .from('quote_items_catalog')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
