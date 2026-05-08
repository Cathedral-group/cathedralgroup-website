/**
 * Verificador algorítmico Cathedral — punto de entrada principal.
 *
 * Recibe un documento ya extraído por el OCR primario (Gemini/GPT-Vision)
 * y devuelve un VerificationResult con el desglose campo a campo:
 *   - Si es válido al 100%: overall_valid=true, needs_review=false
 *   - Si tiene errores críticos: overall_valid=false, needs_review=true
 *   - Si tiene warnings: overall_valid=true (datos válidos), needs_review=true (humano debe ver)
 *
 * El sistema decide qué hacer con el doc según needs_review:
 *   - needs_review=false → guardar automáticamente en BD + archivar en Drive
 *   - needs_review=true  → enviar a /admin/revision para que humano resuelva
 *
 * USO:
 *   const result = verifyDocument({ document_type: 'factura', fields: { ... } })
 *   if (result.needs_review) sendToAdminReview(doc, result.review_reasons)
 */

import { validateSpanishId } from './spanish-id'
import { validateIBANField } from './iban'
import { validateInvoiceMath } from './invoice-math'
import { validatePayrollMath } from './payroll-math'
import { validateDateInRange, validateDateOrder, validateTrimestreCoherence } from './dates'
import { suggestSpanishIdCorrection, suggestIBANCorrection } from './ocr-corrections'
import type {
  DocumentType,
  FieldValidation,
  VerificationRequest,
  VerificationResult,
  InvoiceFields,
  PayrollFields,
} from './types'

/**
 * Verifica un documento aplicando la cascada de validaciones apropiadas
 * según el tipo de documento.
 */
export function verifyDocument(request: VerificationRequest): VerificationResult {
  const start = Date.now()
  const validations: FieldValidation[] = []

  // Validaciones COMUNES a casi todos los tipos
  validations.push(...validateCommonFields(request.document_type, request.fields))

  // Validaciones ESPECÍFICAS por tipo de documento
  switch (request.document_type) {
    case 'factura':
    case 'proforma':
    case 'rectificativa':
    case 'abono':
    case 'ticket':
    case 'justificante_pago':
      validations.push(...validateInvoiceSpecific(request.fields as InvoiceFields))
      break
    case 'nomina':
      validations.push(...validatePayrollSpecific(request.fields as PayrollFields))
      break
    // Otros tipos (escritura, contrato, modelo_fiscal, etc.) por ahora solo
    // tienen validaciones comunes (NIF/CIF/IBAN/fechas). Cuando llegue el
    // primer doc real de cada tipo añadimos su módulo específico.
    default:
      break
  }

  // Enriquecer con sugerencias OCR para campos fallidos
  enrichWithOCRSuggestions(validations, request.fields)

  // Calcular agregados
  const errors = validations.filter((v) => !v.valid && v.severity === 'error')
  const warnings = validations.filter((v) => !v.valid && v.severity === 'warning')
  const overall_valid = errors.length === 0
  const needs_review = errors.length > 0 || warnings.length > 0
  const minConfidence = validations.length
    ? Math.min(...validations.map((v) => v.confidence))
    : 1
  const review_reasons = [...errors, ...warnings]
    .filter((v) => v.reason)
    .map((v) => `[${v.field}] ${v.reason}`)

  return {
    overall_valid,
    needs_review,
    confidence: Number(minConfidence.toFixed(3)),
    review_reasons,
    field_validations: validations,
    duration_ms: Date.now() - start,
  }
}

/**
 * Validaciones que se aplican a CASI TODOS los tipos de documento:
 * NIFs presentes, IBAN si lo hay, fechas si las hay.
 */
function validateCommonFields(
  docType: DocumentType,
  fields: Record<string, unknown>,
): FieldValidation[] {
  const validations: FieldValidation[] = []

  // Identificadores fiscales españoles — buscar en TODAS las claves que parezcan NIF/CIF
  const ID_FIELD_PATTERNS = [
    'nif',
    'cif',
    'nie',
    'dni',
    'documento_identidad',
  ]
  for (const [key, value] of Object.entries(fields)) {
    const keyLower = key.toLowerCase()
    if (ID_FIELD_PATTERNS.some((p) => keyLower.includes(p))) {
      if (value === null || value === undefined || value === '') continue
      validations.push(validateSpanishId(key, String(value)))
    }
  }

  // IBAN — buscar cualquier campo que se llame iban
  for (const [key, value] of Object.entries(fields)) {
    if (key.toLowerCase().includes('iban') && value !== null && value !== undefined && value !== '') {
      validations.push(validateIBANField(key, String(value)))
    }
  }

  // Fechas — buscar campos que empiecen con "fecha_"
  for (const [key, value] of Object.entries(fields)) {
    const keyLower = key.toLowerCase()
    if (keyLower.startsWith('fecha_') || keyLower === 'fecha') {
      if (value === null || value === undefined || value === '') continue
      validations.push(validateDateInRange(key, value))
    }
  }

  return validations
}

/** Validaciones específicas de factura (matemática + orden fechas). */
function validateInvoiceSpecific(fields: InvoiceFields): FieldValidation[] {
  const validations: FieldValidation[] = []
  validations.push(...validateInvoiceMath(fields))
  if (fields.fecha_emision && fields.fecha_vencimiento) {
    validations.push(validateDateOrder(fields.fecha_emision, fields.fecha_vencimiento))
  }
  return validations
}

/** Validaciones específicas de nómina (matemática + coherencia trimestre). */
function validatePayrollSpecific(fields: PayrollFields): FieldValidation[] {
  const validations: FieldValidation[] = []
  validations.push(...validatePayrollMath(fields))
  // Coherencia mes ↔ trimestre si llega declarado
  if (fields.periodo_mes && fields.modelo_111_trimestre) {
    validations.push(
      validateTrimestreCoherence(fields.periodo_mes, fields.modelo_111_trimestre),
    )
  }
  return validations
}

/**
 * Para validaciones fallidas en NIF/CIF/NIE/IBAN, intenta sugerir corrección
 * aplicando 1 sustitución de carácter OCR confuso (caso Hipolito 0↔Z).
 */
function enrichWithOCRSuggestions(
  validations: FieldValidation[],
  fields: Record<string, unknown>,
): void {
  for (const v of validations) {
    if (v.valid) continue
    const value = fields[v.field]
    if (typeof value !== 'string') continue
    const fieldLower = v.field.toLowerCase()

    if (
      fieldLower.includes('nif') ||
      fieldLower.includes('cif') ||
      fieldLower.includes('nie') ||
      fieldLower.includes('dni')
    ) {
      const suggestion = suggestSpanishIdCorrection(value)
      if (suggestion) {
        v.suggestedCorrection = suggestion
        v.reason = `${v.reason ?? 'Inválido'}. Sugerencia OCR: "${suggestion}"`
      }
    } else if (fieldLower.includes('iban')) {
      const suggestion = suggestIBANCorrection(value)
      if (suggestion) {
        v.suggestedCorrection = suggestion
        v.reason = `${v.reason ?? 'Inválido'}. Sugerencia OCR: "${suggestion}"`
      }
    }
  }
}

// Re-exports para uso externo
export type {
  DocumentType,
  FieldValidation,
  VerificationRequest,
  VerificationResult,
  InvoiceFields,
  PayrollFields,
} from './types'
export { validateNIF, validateNIE, validateCIF, validateSpanishId } from './spanish-id'
export { validateIBAN, validateIBANField } from './iban'
export { validateInvoiceMath } from './invoice-math'
export { validatePayrollMath } from './payroll-math'
export { suggestSpanishIdCorrection, suggestIBANCorrection } from './ocr-corrections'
