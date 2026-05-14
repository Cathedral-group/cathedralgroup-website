/**
 * Vercel Cron: ejecuta /api/health/workflow y, si el estado es 'critical' o
 * 'warning', registra una alerta en BD para que se vea destacada en /admin/sistema.
 *
 * Vercel llama a este endpoint según el schedule en vercel.json.
 * Schedule actual (plan Hobby — solo permite 1 cron/día):
 *   "schedule": "0 9 * * *"  (1× al día, 09:00 UTC ≈ 10/11 Madrid)
 *
 * IMPORTANTE: ventana de detección real = 24h. Si plan Vercel pasa a Pro,
 * cambiar a "*/30 * * * *" (cada 30 min) o "0,30 * * * *" en vercel.json
 * + actualizar este docstring.
 *
 * Vercel firma la request con el header 'x-vercel-cron' = '1' (en producción)
 * para evitar ejecuciones manuales no autorizadas. En desarrollo no se valida.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

// Comparación timing-safe del Bearer token. Evita que un atacante pueda
// inferir caracteres correctos midiendo tiempos de respuesta (`===` corta
// en el primer mismatch, timingSafeEqual tarda lo mismo siempre).
function safeEqualBearer(actualHeader: string | null, expectedSecret: string): boolean {
  if (!actualHeader || !expectedSecret) return false
  const expectedHeader = `Bearer ${expectedSecret}`
  const a = Buffer.from(actualHeader)
  const b = Buffer.from(expectedHeader)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function GET(request: NextRequest) {
  // Verificación de origen Vercel Cron (solo en producción)
  const isProd = process.env.NODE_ENV === 'production'
  const cronHeader = request.headers.get('x-vercel-cron')
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  const isLegit =
    cronHeader === '1' ||
    (cronSecret ? safeEqualBearer(authHeader, cronSecret) : false)

  if (isProd && !isLegit) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Llamar al healthcheck (mismo origen)
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://cathedralgroup.es'
  let healthRes: Response
  try {
    healthRes = await fetch(`${baseUrl}/api/health/workflow`, { cache: 'no-store' })
  } catch (e) {
    console.error('[cron healthcheck] fetch /api/health/workflow failed:',
      e instanceof Error ? e.message : String(e))
    return NextResponse.json(
      { cron_executed_at: new Date().toISOString(), error: 'health endpoint unreachable' },
      { status: 502 },
    )
  }

  // FP17 fix: verificar HTTP status antes de parsear JSON
  if (!healthRes.ok) {
    const bodyText = await healthRes.text().catch(() => '')
    console.error(`[cron healthcheck] /api/health/workflow HTTP ${healthRes.status}:`, bodyText.slice(0, 300))
    // Registrar alerta crítica — el propio healthcheck endpoint está roto
    try {
      const supabase = createAdminSupabaseClient()
      await supabase.from('exceptions_log').insert({
        source: 'workflow_healthcheck',
        severity: 'critical',
        message: `Health endpoint returned HTTP ${healthRes.status}`,
        metadata: { status: healthRes.status, body: bodyText.slice(0, 500) },
      })
    } catch (e) {
      console.error('[cron healthcheck] exceptions_log insert failed:',
        e instanceof Error ? e.message : String(e))
    }
    return NextResponse.json(
      { cron_executed_at: new Date().toISOString(), health_status: 'endpoint_error', http_status: healthRes.status },
      { status: 502 },
    )
  }

  const health = await healthRes.json()

  // Solo guardar log si hay alarma (warning o critical)
  if (health.status === 'critical' || health.status === 'warning') {
    try {
      const supabase = createAdminSupabaseClient()
      // Registrar en exceptions_log (tabla ya existente)
      const { error: insertErr } = await supabase.from('exceptions_log').insert({
        source: 'workflow_healthcheck',
        severity: health.status === 'critical' ? 'critical' : 'warning',
        message: health.reasons?.join(' | ') || 'Workflow healthcheck alert',
        metadata: health,
      })
      if (insertErr) {
        console.error('[cron healthcheck] exceptions_log INSERT failed:', insertErr.message)
      }
    } catch (e) {
      console.error('[cron healthcheck] exceptions_log unexpected:',
        e instanceof Error ? e.message : String(e))
    }
    // TODO (próxima sesión): enviar email a David + socios cuando tengamos
    // RESEND_API_KEY o similar configurado.
  }

  return NextResponse.json({
    cron_executed_at: new Date().toISOString(),
    health_status: health.status,
    health_reasons: health.reasons,
  })
}
