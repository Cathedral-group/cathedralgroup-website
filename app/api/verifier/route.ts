/**
 * POST /api/verifier
 *
 * Endpoint genérico del verificador algorítmico Cathedral.
 * Recibe un documento ya extraído por el OCR primario (Gemini/GPT-Vision)
 * y devuelve qué validaciones pasan, cuáles no, y si requiere revisión humana.
 *
 * Lo llama n8n después del nodo extractor, ANTES de insertar en BD.
 *
 * USO desde n8n (HTTP Request node):
 *   POST https://cathedralgroup.es/api/verifier
 *   Body JSON: { "document_type": "factura", "fields": { ... } }
 *
 * Respuesta:
 *   {
 *     "overall_valid": true|false,
 *     "needs_review": true|false,
 *     "confidence": 0.0..1.0,
 *     "review_reasons": [...],
 *     "field_validations": [...],
 *     "duration_ms": N
 *   }
 *
 * Si needs_review=true → n8n debe rutear el doc a /admin/revision
 * Si needs_review=false → n8n puede insertar directamente en BD + archivar Drive
 */

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { verifyDocument } from '@/lib/verifier'
import type { DocumentType } from '@/lib/verifier/types'

const VALID_DOC_TYPES: DocumentType[] = [
  'factura',
  'proforma',
  'rectificativa',
  'abono',
  'presupuesto',
  'albaran',
  'certificado',
  'certificacion',
  'contrato',
  'nota_simple',
  'escritura',
  'licencia',
  'informe',
  'nomina',
  'modelo_fiscal',
  'seguro',
  'ticket',
  'justificante_pago',
  'otro',
]

const RequestSchema = z.object({
  document_type: z.enum(VALID_DOC_TYPES as [DocumentType, ...DocumentType[]]),
  fields: z.record(z.string(), z.unknown()),
})

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Body JSON inválido' },
      { status: 400 },
    )
  }

  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Validación de payload falló',
        issues: parsed.error.issues,
      },
      { status: 400 },
    )
  }

  try {
    const result = verifyDocument(parsed.data)
    return NextResponse.json(result, {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    })
  } catch (e) {
    return NextResponse.json(
      {
        error: 'Error inesperado en verificador',
        message: e instanceof Error ? e.message : String(e),
      },
      {
        status: 500,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      },
    )
  }
}

// El endpoint debe ser dinámico (cada petición es distinta)
export const dynamic = 'force-dynamic'
