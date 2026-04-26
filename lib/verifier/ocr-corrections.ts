/**
 * Sugerencias de corrección de errores típicos de OCR.
 *
 * Cuando un NIF/CIF/IBAN falla validación, intentamos sugerir el valor
 * que sí pasaría aplicando sustituciones de caracteres confundidos
 * frecuentemente por modelos de visión:
 *
 *   '0' ↔ 'O'
 *   '0' ↔ 'D'
 *   '1' ↔ 'I' ↔ 'l'
 *   '2' ↔ 'Z'  ← caso Hipolito
 *   '5' ↔ 'S'
 *   '6' ↔ 'G'
 *   '8' ↔ 'B'
 *
 * IMPORTANTE: la sugerencia es "best effort". No reemplaza la revisión
 * humana — solo facilita corregir en /admin/revision.
 */

import { validateNIF, validateNIE, validateCIF } from './spanish-id'
import { validateIBAN } from './iban'

/**
 * Mapeo de carácter erróneo a candidatos correctos.
 *
 * Importante: Z → ['0', '2'] cubre el caso Hipolito (OCR leyó "Z" donde había
 * un "0") Y la confusión más común "Z↔2". El orden lista primero el candidato
 * más probable según los errores reales observados en producción.
 */
const OCR_CORRECTIONS: Record<string, string[]> = {
  O: ['0'],
  D: ['0'],
  Q: ['0'],
  I: ['1'],
  l: ['1'],
  Z: ['0', '2'],   // ← caso Hipolito: Z se leyó donde había un 0
  S: ['5'],
  G: ['6'],
  B: ['8'],
  '0': ['O', 'D', 'Q'],
  '1': ['I'],
  '2': ['Z'],
  '5': ['S'],
  '6': ['G'],
  '8': ['B'],
}

/**
 * Genera todas las variantes posibles aplicando 1 sola sustitución.
 * Limita a 1 sustitución para evitar explosión combinatoria.
 */
function generateOneCharVariants(input: string): string[] {
  const variants = new Set<string>()
  const chars = input.split('')
  for (let i = 0; i < chars.length; i++) {
    const candidates = OCR_CORRECTIONS[chars[i]]
    if (!candidates) continue
    for (const c of candidates) {
      const variant = [...chars]
      variant[i] = c
      variants.add(variant.join(''))
    }
  }
  return [...variants]
}

/**
 * Sugiere una corrección OCR para un NIF/NIE/CIF inválido.
 * Devuelve el primer candidato que sí pase validación, o null.
 */
export function suggestSpanishIdCorrection(input: string): string | null {
  const cleaned = input.toUpperCase().replace(/[\s\-.]/g, '')
  const variants = generateOneCharVariants(cleaned)
  for (const v of variants) {
    if (validateNIF(v).valid) return v
    if (validateNIE(v).valid) return v
    if (validateCIF(v).valid) return v
  }
  return null
}

/**
 * Sugiere una corrección OCR para un IBAN inválido.
 */
export function suggestIBANCorrection(input: string): string | null {
  const cleaned = input.toUpperCase().replace(/[\s-]/g, '')
  const variants = generateOneCharVariants(cleaned)
  for (const v of variants) {
    if (validateIBAN(v).valid) return v
  }
  return null
}
