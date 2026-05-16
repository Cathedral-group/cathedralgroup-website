/**
 * POST /api/fuzzy-ticket-invoice
 *
 * Microutility endpoint: busca candidatos duplicados ticket↔invoice/quote
 * basado en NIF proveedor + importe ±0.5% + fecha ±20 días.
 *
 * Paridad funcional con nodo n8n `Buscar Fuzzy Match V2` (workflow general
 * FwpGF7L2GbFB84kL). Habilita Tarea 4b cutover progresivo del nodo legacy.
 *
 * IMPORTANTE: este endpoint NO es lo mismo que `/api/fuzzy-supplier`:
 *   - `/api/fuzzy-supplier`: fuzzy nombre proveedor (OCR text → suppliers.name)
 *   - `/api/fuzzy-ticket-invoice`: fuzzy ticket→invoice histórica (NIF+importe+fecha)
 *
 * Body:
 *   {
 *     "supplier_nif": "B12345678",         // NIF/CIF español, 8-20 chars
 *     "amount": 123.45,                    // importe total, positivo
 *     "issue_date": "2026-05-16",          // YYYY-MM-DD
 *     "number"?: "F2026-001",              // opcional, para excluir self
 *     "target_table"?: "invoices"|"quotes" // default invoices
 *   }
 *
 * Response 200:
 *   {
 *     "candidates": Array<{id, number, issue_date, amount, empresa}>,
 *     "query_params": {min_amt, max_amt, start_date, end_date},
 *     "source": "cathedral-fuzzy-ticket-invoice-v1"
 *   }
 *
 * Auth: Bearer CATHEDRAL_INTERNAL_TOKEN (timingSafeEqual).
 *
 * Performance: cubierto por indexes compuestos parciales
 * `idx_{invoices,quotes}_supplier_nif_issue_date` WHERE deleted_at IS NULL
 * (creados 16/05/2026 noche). Objetivo <500ms p95.
 */

import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { checkCathedralInternalAuth } from '@/lib/api-auth'
import { z } from 'zod'

const BodySchema = z.object({
  supplier_nif: z.string().min(8).max(20),
  amount: z.number().positive(),
  issue_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha YYYY-MM-DD requerida'),
  number: z.string().max(100).optional(),
  target_table: z.enum(['invoices', 'quotes']).default('invoices'),
})

// Auth via lib/api-auth (refactor 16/05 noche).

interface CandidateRow {
  id: string
  number: string | null
  issue_date: string
  amount: number
  empresa: string | null
}

export async function POST(request: Request) {
  const startedAt = Date.now()

  if (!checkCathedralInternalAuth(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = BodySchema.safeParse(raw)
  if (!parsed.success) {
    return Response.json(
      {
        error: 'Validation failed',
        detail: parsed.error.issues[0]?.message ?? 'Invalid payload',
      },
      { status: 400 }
    )
  }

  const { supplier_nif, amount, issue_date, number, target_table } = parsed.data

  // Tolerancia ±0.5% importe. `Math.round(x*100)/100` evita drift IEEE 754
  // (a diferencia de `.toFixed(2)` que devuelve string + casos edge).
  const tol = 0.005
  const minAmt = Math.round(amount * (1 - tol) * 100) / 100
  const maxAmt = Math.round(amount * (1 + tol) * 100) / 100

  // Ventana temporal ±20 días en zona UTC (mismo cálculo que n8n legacy)
  const dt = new Date(issue_date)
  const startDate = new Date(dt.getTime() - 20 * 86400000).toISOString().slice(0, 10)
  const endDate = new Date(dt.getTime() + 20 * 86400000).toISOString().slice(0, 10)

  // Campo amount difiere por tabla (verificado empíricamente en schema 16/05/2026)
  const amountField = target_table === 'quotes' ? 'total' : 'amount_total'

  const supabase = createAdminSupabaseClient()

  try {
    let query = supabase
      .from(target_table)
      .select(`id, number, issue_date, ${amountField}, empresa`)
      .eq('supplier_nif', supplier_nif)
      .gte(amountField, minAmt)
      .lte(amountField, maxAmt)
      .gte('issue_date', startDate)
      .lte('issue_date', endDate)
      .is('deleted_at', null)
      .limit(10)

    // Excluir self con null-safety. En PostgreSQL, `col != X` con col=NULL
    // devuelve NULL (no TRUE), excluyendo silenciosamente rows con number=NULL.
    // Patrón OR null-safe: `(number IS NULL OR number != X)`.
    // En invoices.number es nullable; en quotes.number es NOT NULL (innocuous OR).
    if (number) {
      query = query.or(`number.is.null,number.neq.${number}`)
    }

    const { data, error } = await query

    if (error) {
      console.error('[fuzzy-ticket-invoice] Supabase error:', error.message)
      return Response.json(
        { error: 'Upstream database error', detail: error.message },
        { status: 503, headers: { 'Retry-After': '5' } }
      )
    }

    // Cast via unknown: Supabase TS infiere ParserError con select string dinámico
    const rows = (data ?? []) as unknown as Array<{
      id: string
      number: string | null
      issue_date: string
      empresa: string | null
      [key: string]: unknown
    }>

    // Map a candidates con guard: si amount llega null/NaN (race condition
    // schema, query devolvió row inesperada), skip + log en vez de devolver
    // candidato con amount=0 silente (sería match falso ±0.5% de 0).
    const candidates: CandidateRow[] = rows
      .map((r): CandidateRow | null => {
        const raw = r[amountField]
        const amount = typeof raw === 'number' ? raw : Number(raw)
        if (!Number.isFinite(amount) || amount <= 0) {
          console.warn(
            `[fuzzy-ticket-invoice] candidate ${r.id} skipped: ${amountField}=${JSON.stringify(raw)} invalid`
          )
          return null
        }
        return {
          id: r.id,
          number: r.number,
          issue_date: r.issue_date,
          amount,
          empresa: r.empresa,
        }
      })
      .filter((c): c is CandidateRow => c !== null)

    const elapsedMs = Date.now() - startedAt
    console.log(
      `[fuzzy-ticket-invoice] nif=${supplier_nif} amt=${amount} date=${issue_date} ` +
        `table=${target_table} candidates=${candidates.length} t=${elapsedMs}ms`
    )

    return Response.json({
      candidates,
      query_params: {
        min_amt: minAmt,
        max_amt: maxAmt,
        start_date: startDate,
        end_date: endDate,
      },
      source: 'cathedral-fuzzy-ticket-invoice-v1',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    console.error('[fuzzy-ticket-invoice] Unexpected error:', message)
    return Response.json(
      { error: 'Upstream error', detail: message },
      { status: 503, headers: { 'Retry-After': '5' } }
    )
  }
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
