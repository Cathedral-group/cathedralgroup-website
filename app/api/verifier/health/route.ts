/**
 * GET /api/verifier/health
 *
 * Healthcheck simple. Verifica que el verificador carga sus módulos y
 * resuelve el caso canónico (NIF Hipolito) correctamente.
 *
 * Útil para monitoring desde n8n o uptime checkers (Pingdom, BetterUptime).
 */

import { NextResponse } from 'next/server'
import { validateNIF, validateNIE, validateIBAN } from '@/lib/verifier'

export async function GET() {
  const checks = {
    nif_hipolito_valid: validateNIF('03239733E').valid === true,
    nie_z3239733e_invalid: validateNIE('Z3239733E').valid === false,
    iban_es_valid: validateIBAN('ES9121000418450200051332').valid === true,
    iban_corrupted_invalid: validateIBAN('ES9121000418450200051333').valid === false,
  }
  const all_ok = Object.values(checks).every(Boolean)
  return NextResponse.json(
    {
      status: all_ok ? 'ok' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: all_ok ? 200 : 503 },
  )
}

export const dynamic = 'force-dynamic'
