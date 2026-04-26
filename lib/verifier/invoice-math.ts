/**
 * Validaciones matemáticas para facturas españolas.
 *
 * - base_imponible × (1 + tipo_iva/100) ≈ total  (tolerancia 2 céntimos por redondeos)
 * - cuota_iva ≈ base_imponible × tipo_iva / 100
 * - tipo_iva debe ser uno de los oficiales en España: 0, 4, 10, 21
 * - Importes positivos, salvo abonos/rectificativas (negativos permitidos)
 *
 * El umbral de tolerancia (±0.02€) cubre redondeos típicos de software contable.
 */

import type { FieldValidation, InvoiceFields } from './types'

const TIPOS_IVA_VALIDOS = [0, 4, 10, 21]
const TOLERANCE_EUR = 0.02

/** Coerciona valor a number tolerando "1.234,56" (formato español). */
function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  // Quitar espacios, símbolo €
  let s = v.trim().replace(/€/g, '').replace(/\s/g, '')
  // Detectar formato español "1.234,56" vs inglés "1,234.56"
  const hasDot = s.includes('.')
  const hasComma = s.includes(',')
  if (hasDot && hasComma) {
    // Si ambos: el último separador es el decimal
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      // Formato ES: "1.234,56" → "1234.56"
      s = s.replace(/\./g, '').replace(',', '.')
    } else {
      // Formato EN: "1,234.56" → "1234.56"
      s = s.replace(/,/g, '')
    }
  } else if (hasComma) {
    // Solo coma → asumir decimal español
    s = s.replace(',', '.')
  }
  // hasDot solo: ya está en formato decimal, no tocar
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}

/** Valida que tipo_iva esté entre los oficiales españoles. */
export function validateTipoIVA(value: unknown): FieldValidation {
  const n = toNumber(value)
  if (n === null) {
    return {
      field: 'tipo_iva',
      value: null,
      valid: false,
      severity: 'warning',
      reason: 'Tipo de IVA no encontrado',
      confidence: 1,
    }
  }
  const valid = TIPOS_IVA_VALIDOS.includes(n)
  return {
    field: 'tipo_iva',
    value: n,
    valid,
    severity: valid ? undefined : 'warning',
    reason: valid ? undefined : `Tipo de IVA ${n}% no estándar (válidos: 0, 4, 10, 21)`,
    confidence: 1,
  }
}

/** Valida que base + IVA ≈ total. */
export function validateInvoiceTotal(
  base: unknown,
  cuotaIVA: unknown,
  total: unknown,
): FieldValidation {
  const b = toNumber(base)
  const i = toNumber(cuotaIVA)
  const t = toNumber(total)

  if (b === null || i === null || t === null) {
    const missing: string[] = []
    if (b === null) missing.push('base_imponible')
    if (i === null) missing.push('cuota_iva')
    if (t === null) missing.push('total')
    return {
      field: 'total',
      value: t,
      valid: false,
      severity: 'warning',
      reason: `Faltan datos para validar matemática: ${missing.join(', ')}`,
      confidence: 1,
    }
  }

  const expectedTotal = b + i
  const diff = Math.abs(expectedTotal - t)
  const valid = diff <= TOLERANCE_EUR

  return {
    field: 'total',
    value: t,
    valid,
    severity: valid ? undefined : 'error',
    reason: valid
      ? undefined
      : `Total no cuadra: base (${b.toFixed(2)}) + IVA (${i.toFixed(2)}) = ${expectedTotal.toFixed(
          2,
        )}€, leído ${t.toFixed(2)}€ (dif ${diff.toFixed(2)}€)`,
    expected: Number(expectedTotal.toFixed(2)),
    confidence: 1,
  }
}

/** Valida que cuota_iva ≈ base × tipo_iva / 100. */
export function validateCuotaIVA(
  base: unknown,
  tipoIVA: unknown,
  cuotaIVA: unknown,
): FieldValidation {
  const b = toNumber(base)
  const t = toNumber(tipoIVA)
  const c = toNumber(cuotaIVA)

  if (b === null || t === null || c === null) {
    return {
      field: 'cuota_iva',
      value: c,
      valid: false,
      severity: 'warning',
      reason: 'Faltan datos para validar cuota de IVA',
      confidence: 1,
    }
  }

  const expected = (b * t) / 100
  const diff = Math.abs(expected - c)
  const valid = diff <= TOLERANCE_EUR

  return {
    field: 'cuota_iva',
    value: c,
    valid,
    severity: valid ? undefined : 'error',
    reason: valid
      ? undefined
      : `Cuota IVA no cuadra: base (${b.toFixed(2)}) × ${t}% = ${expected.toFixed(
          2,
        )}€, leído ${c.toFixed(2)}€`,
    expected: Number(expected.toFixed(2)),
    confidence: 1,
  }
}

/**
 * Aplica todas las validaciones matemáticas de factura.
 * Devuelve la lista de FieldValidation para que el verificador principal componga.
 */
export function validateInvoiceMath(fields: InvoiceFields): FieldValidation[] {
  const validations: FieldValidation[] = []

  validations.push(validateTipoIVA(fields.tipo_iva))
  validations.push(validateCuotaIVA(fields.base_imponible, fields.tipo_iva, fields.cuota_iva))
  validations.push(validateInvoiceTotal(fields.base_imponible, fields.cuota_iva, fields.total))

  return validations
}

// Export del helper para test/uso externo
export { toNumber }
