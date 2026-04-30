/**
 * GET /api/health/workflow
 *
 * Healthcheck del workflow n8n de procesamiento de emails Cathedral.
 *
 * Verifica:
 *   - Cuándo entró el último doc (last_invoice_at)
 *   - Cuántos docs en últimas 24h
 *   - Cuántos docs en últimos 7 días
 *   - Tasa de errores recientes
 *
 * Decide nivel de alarma:
 *   - 🟢 ok        → algo entró en últimas 24h en horario laboral
 *   - 🟡 warning   → 24-48h sin entrada (puede ser fin de semana)
 *   - 🔴 critical  → >48h sin entrada o errores acumulados
 *
 * Lo llama un Vercel Cron diario a las 9:00 UTC (11:00 hora España) y
 * un widget visual en /admin/sistema. NOTA: Vercel Hobby limita crons a
 * 1/día — para checks más frecuentes, upgrade a Pro o usar healthcheck
 * externo (UptimeRobot/BetterUptime).
 */

import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Devuelve la fecha actual en zona Europe/Madrid (donde opera Cathedral).
 */
function nowMadrid(): Date {
  return new Date()
}

/**
 * Detecta si una fecha cae en horario laboral en España (Mon-Fri 8:00-20:00).
 */
function isLaboralHour(d: Date): boolean {
  // Construir Date en zona Madrid usando Intl
  const formatter = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
  })
  const parts = formatter.formatToParts(d)
  const weekday = parts.find((p) => p.type === 'weekday')?.value || ''
  const hourStr = parts.find((p) => p.type === 'hour')?.value || '0'
  const hour = parseInt(hourStr, 10)
  const isWeekend = weekday.startsWith('sá') || weekday.startsWith('do')
  return !isWeekend && hour >= 8 && hour < 20
}

export async function GET() {
  const supabase = createAdminSupabaseClient()
  const now = nowMadrid()

  // 1. Último doc insertado por workflow automático en CUALQUIERA de las 3 tablas destino
  // (invoices, quotes, documents — el clasificador enruta según doc_type)
  const lastQuery = (table: 'invoices' | 'quotes' | 'documents') =>
    supabase
      .from(table)
      .select('id, created_at')
      .eq('source', 'email_automatico')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

  const [lastInv, lastQuote, lastDocs] = await Promise.all([
    lastQuery('invoices'),
    lastQuery('quotes'),
    lastQuery('documents'),
  ])

  const e1 = lastInv.error || lastQuote.error || lastDocs.error
  if (e1) {
    return NextResponse.json(
      { error: 'Error consultando BD', detail: e1.message },
      { status: 500 },
    )
  }

  const candidates = [lastInv.data?.created_at, lastQuote.data?.created_at, lastDocs.data?.created_at]
    .filter((t): t is string => Boolean(t))
    .map((t) => new Date(t))
  const lastTs = candidates.length ? new Date(Math.max(...candidates.map((d) => d.getTime()))) : null
  const hoursSinceLast = lastTs
    ? (now.getTime() - lastTs.getTime()) / (1000 * 60 * 60)
    : Infinity

  // 2. Conteos en ventanas de tiempo (sumamos las 3 tablas)
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const countQuery = (table: 'invoices' | 'quotes' | 'documents', sinceIso: string) =>
    supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('source', 'email_automatico')
      .is('deleted_at', null)
      .gte('created_at', sinceIso)

  const errorsQuery = (table: 'invoices' | 'quotes' | 'documents', sinceIso: string) =>
    supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('review_status', 'error')
      .is('deleted_at', null)
      .gte('created_at', sinceIso)

  const [
    inv24h, quo24h, doc24h,
    inv7d, quo7d, doc7d,
    errInv24h, errQuo24h,
  ] = await Promise.all([
    countQuery('invoices', since24h),
    countQuery('quotes', since24h),
    countQuery('documents', since24h),
    countQuery('invoices', since7d),
    countQuery('quotes', since7d),
    countQuery('documents', since7d),
    errorsQuery('invoices', since24h),
    errorsQuery('quotes', since24h),
  ])
  // documents no tiene review_status (no es CHECK constraint), por eso solo invoices+quotes para errors
  const count24h = (inv24h.count ?? 0) + (quo24h.count ?? 0) + (doc24h.count ?? 0)
  const count7d = (inv7d.count ?? 0) + (quo7d.count ?? 0) + (doc7d.count ?? 0)
  const errors24h = (errInv24h.count ?? 0) + (errQuo24h.count ?? 0)

  // 3. Decidir nivel de alarma
  let status: 'ok' | 'warning' | 'critical' = 'ok'
  const reasons: string[] = []
  const recommendations: string[] = []

  if (!lastTs) {
    status = 'critical'
    reasons.push('Nunca se ha insertado ningún documento via workflow automático')
    recommendations.push('Verificar que el workflow n8n esté activo y procesando emails')
  } else if (hoursSinceLast > 72) {
    status = 'critical'
    reasons.push(`Llevamos ${hoursSinceLast.toFixed(1)}h sin procesar nada (>72h)`)
    recommendations.push('Comprobar workflow n8n: credenciales OAuth Gmail caducadas, API key OpenAI agotada, o bug nuevo')
  } else if (hoursSinceLast > 48) {
    status = 'critical'
    reasons.push(`Llevamos ${hoursSinceLast.toFixed(1)}h sin procesar nada (>48h)`)
    recommendations.push('Revisar últimas executions en n8n.cathedralgroup.es')
  } else if (hoursSinceLast > 24 && isLaboralHour(now)) {
    status = 'warning'
    reasons.push(`Llevamos ${hoursSinceLast.toFixed(1)}h sin procesar — anormal en horario laboral`)
    recommendations.push('Quizás no han llegado emails relevantes; verificar manualmente')
  } else if (hoursSinceLast > 24 && !isLaboralHour(now)) {
    // Fuera de horario laboral — ok hasta 48h
    status = 'ok'
  }

  if ((errors24h ?? 0) > 5) {
    if (status === 'ok') status = 'warning'
    reasons.push(`${errors24h} ejecuciones con error en últimas 24h`)
    recommendations.push('Revisar /admin/revision para resolver errores acumulados')
  }

  return NextResponse.json(
    {
      status,
      reasons,
      recommendations,
      stats: {
        last_doc_at: lastTs?.toISOString() ?? null,
        hours_since_last: lastTs ? Number(hoursSinceLast.toFixed(2)) : null,
        count_24h: count24h,
        count_7d: count7d,
        errors_24h: errors24h,
        breakdown: {
          invoices_24h: inv24h.count ?? 0,
          quotes_24h: quo24h.count ?? 0,
          documents_24h: doc24h.count ?? 0,
        },
      },
      laboral_hour_now: isLaboralHour(now),
      checked_at: now.toISOString(),
    },
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store, max-age=0',
      },
    },
  )
}
