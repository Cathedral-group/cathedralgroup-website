/**
 * Helper para ejecutar el verificador algorítmico sobre un lote de documentos.
 *
 * Se ejecuta en server (page.tsx server components) ANTES de pasar los datos
 * al cliente, así los badges renderizan instantáneo sin fetches extra.
 *
 * El verificador es matemática pura — milisegundos por documento.
 */

import { verifyDocument } from './index'
import type { DocumentType, VerificationResult } from './types'

/**
 * Resultado simplificado pensado para serializar al cliente.
 * No mandamos la lista entera de field_validations en el listado
 * (eso solo se carga al expandir el detalle).
 */
export interface VerificationSummary {
  status: 'ok' | 'warning' | 'error'
  needs_review: boolean
  error_count: number
  warning_count: number
  /** Razones legibles, lista corta para tooltip */
  reasons: string[]
  /** Sugerencias de corrección OCR encontradas (campo → valor sugerido) */
  suggestions: Record<string, string>
}

function summarize(result: VerificationResult): VerificationSummary {
  const errors = result.field_validations.filter(
    (v) => !v.valid && v.severity === 'error',
  )
  const warnings = result.field_validations.filter(
    (v) => !v.valid && v.severity === 'warning',
  )
  let status: VerificationSummary['status'] = 'ok'
  if (errors.length > 0) status = 'error'
  else if (warnings.length > 0) status = 'warning'

  const suggestions: Record<string, string> = {}
  for (const v of result.field_validations) {
    if (v.suggestedCorrection != null) {
      suggestions[v.field] = String(v.suggestedCorrection)
    }
  }

  return {
    status,
    needs_review: result.needs_review,
    error_count: errors.length,
    warning_count: warnings.length,
    reasons: result.review_reasons.slice(0, 5),
    suggestions,
  }
}

/**
 * Verifica un lote de documentos del mismo tipo y devuelve un Map id→summary.
 * Si la verificación lanza una excepción para alguno, se marca como 'error'.
 */
export function batchVerify(
  documentType: DocumentType,
  rows: Array<{ id: string | number } & Record<string, unknown>>,
): Record<string, VerificationSummary> {
  const out: Record<string, VerificationSummary> = {}
  for (const row of rows) {
    try {
      const result = verifyDocument({
        document_type: documentType,
        fields: row,
      })
      out[String(row.id)] = summarize(result)
    } catch {
      out[String(row.id)] = {
        status: 'error',
        needs_review: true,
        error_count: 1,
        warning_count: 0,
        reasons: ['Error inesperado al verificar (excepción interna)'],
        suggestions: {},
      }
    }
  }
  return out
}

/**
 * Variante específica para la tabla `invoices`: hace el mapeo de nombres de
 * columnas BD → nombres esperados por el verificador.
 *
 *   supplier_nif → emisor_nif
 *   amount_base  → base_imponible
 *   vat_pct      → tipo_iva
 *   vat_amount   → cuota_iva
 *   amount_total → total
 *   issue_date   → fecha_emision
 *   due_date     → fecha_vencimiento
 */
export function batchVerifyInvoices(
  rows: Array<{ id: string | number } & Record<string, unknown>>,
): Record<string, VerificationSummary> {
  const out: Record<string, VerificationSummary> = {}
  for (const row of rows) {
    try {
      const docType = (row.doc_type as DocumentType) ?? 'factura'
      // Mapear campos de invoices al formato del verificador
      const mapped: Record<string, unknown> = {
        ...row,
        emisor_nif: row.supplier_nif ?? null,
        base_imponible: row.amount_base ?? null,
        tipo_iva: row.vat_pct ?? null,
        cuota_iva: row.vat_amount ?? null,
        total: row.amount_total ?? null,
        fecha_emision: row.issue_date ?? null,
        fecha_vencimiento: row.due_date ?? null,
      }
      const result = verifyDocument({
        document_type: docType,
        fields: mapped,
      })
      out[String(row.id)] = summarize(result)
    } catch {
      out[String(row.id)] = {
        status: 'error',
        needs_review: true,
        error_count: 1,
        warning_count: 0,
        reasons: ['Error inesperado al verificar (excepción interna)'],
        suggestions: {},
      }
    }
  }
  return out
}
