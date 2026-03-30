import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

// Lightweight keep-alive endpoint — called by UptimeRobot every 5 min
// Makes a real DB query so Supabase never auto-pauses (Free tier threshold: 7 days)
export async function GET() {
  try {
    const supabase = createAdminSupabaseClient()
    const { count, error } = await supabase
      .from('invoices')
      .select('*', { count: 'exact', head: true })
      .is('deleted_at', null)

    if (error) throw error

    return NextResponse.json({
      ok: true,
      ts: new Date().toISOString(),
      invoices: count ?? 0,
    })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
