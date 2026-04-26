/**
 * Validador de IBAN según ISO 13616 (algoritmo módulo 97).
 *
 * Cómo funciona:
 *   1. Mover los 4 primeros caracteres (código país + dígitos control) al final
 *   2. Convertir letras a números (A=10, B=11, ..., Z=35)
 *   3. El número resultante debe ser ≡ 1 (mod 97)
 *
 * Detecta ~99.9% de errores de un solo carácter. Coste cero, instantáneo.
 */

import type { FieldValidation } from './types'

/** Longitud esperada de IBAN por país (los más comunes en facturas españolas). */
const IBAN_LENGTHS: Record<string, number> = {
  ES: 24, // España
  AD: 24, // Andorra
  AT: 20, // Austria
  BE: 16, // Bélgica
  BG: 22, // Bulgaria
  CH: 21, // Suiza
  CY: 28, // Chipre
  CZ: 24, // República Checa
  DE: 22, // Alemania
  DK: 18, // Dinamarca
  EE: 20, // Estonia
  FI: 18, // Finlandia
  FR: 27, // Francia
  GB: 22, // Reino Unido
  GR: 27, // Grecia
  HR: 21, // Croacia
  HU: 28, // Hungría
  IE: 22, // Irlanda
  IS: 26, // Islandia
  IT: 27, // Italia
  LI: 21, // Liechtenstein
  LT: 20, // Lituania
  LU: 20, // Luxemburgo
  LV: 21, // Letonia
  MC: 27, // Mónaco
  MT: 31, // Malta
  NL: 18, // Países Bajos
  NO: 15, // Noruega
  PL: 28, // Polonia
  PT: 25, // Portugal
  RO: 24, // Rumanía
  SE: 24, // Suecia
  SI: 19, // Eslovenia
  SK: 24, // Eslovaquia
  SM: 27, // San Marino
  VA: 22, // Vaticano
}

function clean(iban: string | null | undefined): string {
  if (!iban) return ''
  return String(iban).toUpperCase().replace(/[\s-]/g, '')
}

/**
 * Valida un IBAN. Devuelve detalles para diagnóstico en /admin/revision.
 */
export function validateIBAN(input: string | null | undefined): {
  valid: boolean
  cleaned: string
  reason?: string
} {
  const iban = clean(input)
  if (!iban) return { valid: false, cleaned: iban, reason: 'IBAN vacío' }
  if (iban.length < 15) return { valid: false, cleaned: iban, reason: 'IBAN demasiado corto' }
  if (iban.length > 34) return { valid: false, cleaned: iban, reason: 'IBAN demasiado largo' }

  const country = iban.slice(0, 2)
  if (!/^[A-Z]{2}$/.test(country)) {
    return { valid: false, cleaned: iban, reason: 'Código país inválido (no son 2 letras)' }
  }

  const expectedLength = IBAN_LENGTHS[country]
  if (expectedLength && iban.length !== expectedLength) {
    return {
      valid: false,
      cleaned: iban,
      reason: `Longitud incorrecta para ${country}: tiene ${iban.length}, esperado ${expectedLength}`,
    }
  }

  // Mover los 4 primeros al final
  const rearranged = iban.slice(4) + iban.slice(0, 4)
  // Convertir letras a números (A=10, ..., Z=35)
  let numeric = ''
  for (const ch of rearranged) {
    if (/[A-Z]/.test(ch)) {
      numeric += String(ch.charCodeAt(0) - 'A'.charCodeAt(0) + 10)
    } else if (/\d/.test(ch)) {
      numeric += ch
    } else {
      return { valid: false, cleaned: iban, reason: `Carácter inválido en IBAN: "${ch}"` }
    }
  }

  // Calcular módulo 97 sobre número grande sin BigInt (portable a target ES5+).
  // Truco: procesar en chunks de 7 dígitos arrastrando el resto anterior.
  // Esto funciona porque (a*10^k + b) mod 97 = ((a mod 97)*10^k + b) mod 97
  let remainder = 0
  for (let i = 0; i < numeric.length; i += 7) {
    const chunk = remainder.toString() + numeric.slice(i, i + 7)
    remainder = parseInt(chunk, 10) % 97
  }
  if (remainder !== 1) {
    return {
      valid: false,
      cleaned: iban,
      reason: `Dígitos de control inválidos (módulo 97 = ${remainder}, esperado 1)`,
    }
  }

  return { valid: true, cleaned: iban }
}

/**
 * Versión que devuelve directamente FieldValidation para componer con el resto.
 */
export function validateIBANField(
  fieldName: string,
  value: string | null | undefined,
): FieldValidation {
  if (!value) {
    return {
      field: fieldName,
      value: null,
      valid: false,
      severity: 'warning',
      reason: 'IBAN no encontrado en el documento',
      confidence: 1,
    }
  }
  const r = validateIBAN(value)
  return {
    field: fieldName,
    value,
    valid: r.valid,
    severity: r.valid ? undefined : 'error',
    reason: r.reason,
    confidence: 1,
  }
}
