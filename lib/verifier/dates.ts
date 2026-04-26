/**
 * Validaciones de fechas en documentos.
 *
 * - Formato: acepta ISO YYYY-MM-DD o español DD/MM/YYYY
 * - Rango: no antes del 2000, no después de hoy + 1 mes
 * - Coherencia: fecha vencimiento ≥ fecha emisión
 * - Coherencia trimestre/mes: mes 1-3 → Q1, 4-6 → Q2, 7-9 → Q3, 10-12 → Q4
 */

import type { FieldValidation } from './types'

const MIN_YEAR = 2000

/** Parsea una fecha en formato español (DD/MM/YYYY) o ISO (YYYY-MM-DD). */
export function parseDate(input: unknown): Date | null {
  if (!input) return null
  if (input instanceof Date) return Number.isFinite(input.getTime()) ? input : null
  if (typeof input !== 'string') return null
  const s = input.trim()
  // ISO YYYY-MM-DD
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) {
    const d = new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]))
    return Number.isFinite(d.getTime()) ? d : null
  }
  // Español DD/MM/YYYY o DD-MM-YYYY
  m = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/)
  if (m) {
    const d = new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]))
    return Number.isFinite(d.getTime()) ? d : null
  }
  return null
}

/** Valida que una fecha esté en rango razonable (2000 → hoy+1mes). */
export function validateDateInRange(
  fieldName: string,
  input: unknown,
): FieldValidation {
  if (!input) {
    return {
      field: fieldName,
      value: null,
      valid: false,
      severity: 'warning',
      reason: 'Fecha no encontrada',
      confidence: 1,
    }
  }
  const date = parseDate(input)
  if (!date) {
    return {
      field: fieldName,
      value: String(input),
      valid: false,
      severity: 'error',
      reason: `Formato de fecha no reconocido: "${input}". Esperado YYYY-MM-DD o DD/MM/YYYY`,
      confidence: 1,
    }
  }
  const now = new Date()
  const maxDate = new Date(now.getTime() + 31 * 24 * 60 * 60 * 1000) // hoy + 1 mes
  const minDate = new Date(MIN_YEAR, 0, 1)

  if (date < minDate) {
    return {
      field: fieldName,
      value: String(input),
      valid: false,
      severity: 'warning',
      reason: `Fecha (${date.toISOString().slice(0, 10)}) anterior a ${MIN_YEAR}. Revisar si es correcta`,
      confidence: 1,
    }
  }
  if (date > maxDate) {
    return {
      field: fieldName,
      value: String(input),
      valid: false,
      severity: 'error',
      reason: `Fecha (${date.toISOString().slice(0, 10)}) en el futuro. Probable error OCR`,
      confidence: 1,
    }
  }
  return {
    field: fieldName,
    value: String(input),
    valid: true,
    confidence: 1,
  }
}

/** Valida que vencimiento sea posterior o igual a emisión. */
export function validateDateOrder(
  emision: unknown,
  vencimiento: unknown,
): FieldValidation {
  const e = parseDate(emision)
  const v = parseDate(vencimiento)
  if (!e || !v) {
    return {
      field: 'fecha_vencimiento',
      value: vencimiento as string | null,
      valid: false,
      severity: 'info',
      reason: 'No se puede validar orden de fechas (alguna falta)',
      confidence: 0.5,
    }
  }
  if (v < e) {
    return {
      field: 'fecha_vencimiento',
      value: String(vencimiento),
      valid: false,
      severity: 'error',
      reason: `Vencimiento (${v.toISOString().slice(0, 10)}) anterior a emisión (${e
        .toISOString()
        .slice(0, 10)})`,
      confidence: 1,
    }
  }
  return {
    field: 'fecha_vencimiento',
    value: String(vencimiento),
    valid: true,
    confidence: 1,
  }
}

/** Valida coherencia mes ↔ trimestre (modelo 111). */
export function validateTrimestreCoherence(
  mes: unknown,
  trimestreDeclarado: unknown,
): FieldValidation {
  const m = typeof mes === 'number' ? mes : parseInt(String(mes), 10)
  const t = typeof trimestreDeclarado === 'string' ? trimestreDeclarado.trim().toUpperCase() : null

  if (!m || !Number.isFinite(m) || m < 1 || m > 12) {
    return {
      field: 'modelo_111_trimestre',
      value: t,
      valid: false,
      severity: 'info',
      reason: 'No se puede validar trimestre (mes inválido)',
      confidence: 0.5,
    }
  }
  const expectedT = `Q${Math.ceil(m / 3)}`
  if (!t) {
    return {
      field: 'modelo_111_trimestre',
      value: null,
      valid: false,
      severity: 'info',
      reason: `Trimestre no especificado. Debería ser ${expectedT} (mes ${m})`,
      expected: expectedT,
      confidence: 1,
    }
  }
  if (t !== expectedT) {
    return {
      field: 'modelo_111_trimestre',
      value: t,
      valid: false,
      severity: 'error',
      reason: `Trimestre ${t} no corresponde al mes ${m} (esperado ${expectedT})`,
      expected: expectedT,
      confidence: 1,
    }
  }
  return {
    field: 'modelo_111_trimestre',
    value: t,
    valid: true,
    confidence: 1,
  }
}
