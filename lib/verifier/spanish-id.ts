/**
 * Validador de identificadores fiscales españoles: NIF, NIE y CIF.
 *
 * Algoritmos públicos del BOE. Implementación pura sin dependencias.
 *
 * REGLA CRÍTICA: este módulo es la red de seguridad que detectó
 * el caso Hipolito (NIF "03239733E" leído como "Z3239733E").
 * Si el OCR confunde un dígito o letra, el checksum NO cuadra
 * y el sistema flagea el documento ANTES de guardarlo en BD.
 */

import type { FieldValidation } from './types'

/** Letras del NIF/NIE en orden de módulo 23. */
const NIF_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE'

/** Letras válidas como prefijo de CIF (tipo de organización). */
const CIF_PREFIX_LETTERS = 'ABCDEFGHJKLMNPQRSUVW'

/** Letras del dígito de control de CIF cuando es alfabético (organizaciones que requieren letra). */
const CIF_CONTROL_LETTERS = 'JABCDEFGHI'

/** Tipos de organización CIF que SIEMPRE tienen letra como dígito de control (no número). */
const CIF_LETTER_CONTROL_TYPES = 'PQRSNW'

/** Tipos de organización CIF que SIEMPRE tienen número como dígito de control. */
const CIF_NUMBER_CONTROL_TYPES = 'ABEH'

/** Limpia espacios, guiones y puntos. Convierte a mayúsculas. */
function clean(id: string | null | undefined): string {
  if (!id) return ''
  return String(id).toUpperCase().replace(/[\s\-.]/g, '')
}

/**
 * Valida un NIF español (8 dígitos + letra).
 * Algoritmo: la letra es la posición (n % 23) en "TRWAGMYFPDXBNJZSQVHLCKE".
 *
 * @example
 *   validateNIF('03239733E') → { valid: true, expected: 'E' }
 *   validateNIF('03239733Z') → { valid: false, expected: 'E' }
 */
export function validateNIF(input: string | null | undefined): {
  valid: boolean
  expected?: string
  cleaned: string
} {
  const cleaned = clean(input)
  const match = cleaned.match(/^(\d{8})([A-Z])$/)
  if (!match) return { valid: false, cleaned }
  const num = parseInt(match[1], 10)
  const expected = NIF_LETTERS[num % 23]
  return { valid: match[2] === expected, expected, cleaned }
}

/**
 * Valida un NIE español (X/Y/Z + 7 dígitos + letra).
 * Algoritmo: X→0, Y→1, Z→2, luego concatenar con los 7 dígitos y aplicar módulo 23.
 *
 * @example
 *   validateNIE('Y0149420C') → { valid: true, expected: 'C' }
 */
export function validateNIE(input: string | null | undefined): {
  valid: boolean
  expected?: string
  cleaned: string
} {
  const cleaned = clean(input)
  const match = cleaned.match(/^([XYZ])(\d{7})([A-Z])$/)
  if (!match) return { valid: false, cleaned }
  const prefixMap: Record<string, string> = { X: '0', Y: '1', Z: '2' }
  const num = parseInt(prefixMap[match[1]] + match[2], 10)
  const expected = NIF_LETTERS[num % 23]
  return { valid: match[3] === expected, expected, cleaned }
}

/**
 * Valida un CIF español (letra + 7 dígitos + letra/dígito de control).
 *
 * Algoritmo (resumido):
 *   1. Suma dígitos en posiciones impares (multiplicados por 2, sumando dígitos del producto)
 *   2. Suma dígitos en posiciones pares (tal cual)
 *   3. Total = (suma_impares + suma_pares); dígito control = (10 - (total % 10)) % 10
 *   4. Si tipo de organización exige letra → letra = CIF_CONTROL_LETTERS[control_digit]
 *      Si exige número → control = control_digit
 *      Si admite ambos (CDFGJUV...) → válido cualquiera de los dos
 */
export function validateCIF(input: string | null | undefined): {
  valid: boolean
  expected?: string
  cleaned: string
} {
  const cleaned = clean(input)
  const match = cleaned.match(/^([ABCDEFGHJKLMNPQRSUVW])(\d{7})([0-9A-J])$/)
  if (!match) return { valid: false, cleaned }
  const [, type, digits, control] = match

  // Suma dígitos en posiciones IMPARES (1, 3, 5, 7) — índice 0,2,4,6 — multiplicados por 2
  let sumOdd = 0
  for (let i = 0; i < 7; i += 2) {
    const product = parseInt(digits[i], 10) * 2
    // Sumar los dígitos del producto (ej: 14 → 1+4=5)
    sumOdd += product < 10 ? product : Math.floor(product / 10) + (product % 10)
  }

  // Suma dígitos en posiciones PARES (2, 4, 6) — índice 1,3,5
  let sumEven = 0
  for (let i = 1; i < 7; i += 2) {
    sumEven += parseInt(digits[i], 10)
  }

  const total = sumOdd + sumEven
  const controlDigit = (10 - (total % 10)) % 10
  const controlLetter = CIF_CONTROL_LETTERS[controlDigit]

  // Decidir si esperamos letra o número como dígito de control
  if (CIF_LETTER_CONTROL_TYPES.includes(type)) {
    // Tipos PQRSNW → siempre letra
    return { valid: control === controlLetter, expected: controlLetter, cleaned }
  }
  if (CIF_NUMBER_CONTROL_TYPES.includes(type)) {
    // Tipos ABEH → siempre número
    return { valid: control === String(controlDigit), expected: String(controlDigit), cleaned }
  }
  // Resto (CDFGJUV) → admite ambos
  const expectedLabel = `${controlDigit} o ${controlLetter}`
  const isValid = control === String(controlDigit) || control === controlLetter
  return { valid: isValid, expected: expectedLabel, cleaned }
}

/**
 * Valida cualquier identificador fiscal español (auto-detecta NIF, NIE o CIF).
 * Devuelve un FieldValidation listo para incluir en el resultado de verificación.
 */
export function validateSpanishId(
  fieldName: string,
  value: string | null | undefined,
): FieldValidation {
  if (!value) {
    return {
      field: fieldName,
      value: value ?? null,
      valid: false,
      severity: 'error',
      reason: 'Identificador vacío',
      confidence: 1,
    }
  }

  const cleaned = clean(value)

  // Detectar tipo
  if (/^[XYZ]\d{7}[A-Z]$/.test(cleaned)) {
    const r = validateNIE(cleaned)
    return {
      field: fieldName,
      value,
      valid: r.valid,
      severity: r.valid ? undefined : 'error',
      reason: r.valid ? undefined : `NIE inválido. Letra esperada: ${r.expected}`,
      expected: r.expected,
      confidence: 1,
    }
  }
  if (/^\d{8}[A-Z]$/.test(cleaned)) {
    const r = validateNIF(cleaned)
    return {
      field: fieldName,
      value,
      valid: r.valid,
      severity: r.valid ? undefined : 'error',
      reason: r.valid ? undefined : `NIF inválido. Letra esperada: ${r.expected}`,
      expected: r.expected,
      confidence: 1,
    }
  }
  if (/^[ABCDEFGHJKLMNPQRSUVW]\d{7}[0-9A-J]$/.test(cleaned)) {
    const r = validateCIF(cleaned)
    return {
      field: fieldName,
      value,
      valid: r.valid,
      severity: r.valid ? undefined : 'error',
      reason: r.valid ? undefined : `CIF inválido. Dígito de control esperado: ${r.expected}`,
      expected: r.expected,
      confidence: 1,
    }
  }

  return {
    field: fieldName,
    value,
    valid: false,
    severity: 'error',
    reason: `Formato no reconocido. Esperado NIF (8 dígitos + letra), NIE (X/Y/Z + 7 dígitos + letra) o CIF (letra + 7 dígitos + control)`,
    confidence: 1,
  }
}
