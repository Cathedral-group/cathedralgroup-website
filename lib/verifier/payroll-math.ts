/**
 * Validaciones matemáticas para nóminas españolas.
 *
 * Estructura legal española (Orden ESS/2098/2014):
 *   Total Devengado − Total Deducciones = Líquido a Percibir
 *
 * Ejemplo:
 *   Devengado:    2.500,00 €  (salario base + complementos)
 *   Deducciones:    412,75 €  (Seguridad Social trabajador + IRPF)
 *   Líquido:      2.087,25 €
 *
 * Tolerancia 1 céntimo por redondeos de software de nóminas.
 */

import type { FieldValidation, PayrollFields } from './types'
import { toNumber } from './invoice-math'

const TOLERANCE_EUR = 0.01

/** Valida que devengado − deducciones ≈ líquido. */
export function validatePayrollLiquido(
  devengado: unknown,
  deducciones: unknown,
  liquido: unknown,
): FieldValidation {
  const d = toNumber(devengado)
  const dd = toNumber(deducciones)
  const l = toNumber(liquido)

  if (d === null || dd === null || l === null) {
    const missing: string[] = []
    if (d === null) missing.push('total_devengado')
    if (dd === null) missing.push('total_deducciones')
    if (l === null) missing.push('liquido_a_percibir')
    return {
      field: 'liquido_a_percibir',
      value: l,
      valid: false,
      severity: 'warning',
      reason: `Faltan datos para validar matemática nómina: ${missing.join(', ')}`,
      confidence: 1,
    }
  }

  const expectedLiquido = d - dd
  const diff = Math.abs(expectedLiquido - l)
  const valid = diff <= TOLERANCE_EUR

  return {
    field: 'liquido_a_percibir',
    value: l,
    valid,
    severity: valid ? undefined : 'error',
    reason: valid
      ? undefined
      : `Líquido no cuadra: devengado (${d.toFixed(2)}) − deducciones (${dd.toFixed(
          2,
        )}) = ${expectedLiquido.toFixed(2)}€, leído ${l.toFixed(2)}€ (dif ${diff.toFixed(2)}€)`,
    expected: Number(expectedLiquido.toFixed(2)),
    confidence: 1,
  }
}

/** Valida que el periodo (mes/año) sea coherente y razonable. */
export function validatePayrollPeriodo(
  mes: unknown,
  anio: unknown,
): FieldValidation[] {
  const validations: FieldValidation[] = []
  const m = toNumber(mes)
  const a = toNumber(anio)

  // Validación mes
  if (m === null) {
    validations.push({
      field: 'periodo_mes',
      value: null,
      valid: false,
      severity: 'warning',
      reason: 'Mes del periodo no encontrado',
      confidence: 1,
    })
  } else if (m < 1 || m > 12 || !Number.isInteger(m)) {
    validations.push({
      field: 'periodo_mes',
      value: m,
      valid: false,
      severity: 'error',
      reason: `Mes ${m} fuera de rango (1-12)`,
      confidence: 1,
    })
  } else {
    validations.push({
      field: 'periodo_mes',
      value: m,
      valid: true,
      confidence: 1,
    })
  }

  // Validación año (rango razonable: 2000 — año actual + 1)
  const currentYear = new Date().getFullYear()
  if (a === null) {
    validations.push({
      field: 'periodo_anio',
      value: null,
      valid: false,
      severity: 'warning',
      reason: 'Año del periodo no encontrado',
      confidence: 1,
    })
  } else if (a < 2000 || a > currentYear + 1 || !Number.isInteger(a)) {
    validations.push({
      field: 'periodo_anio',
      value: a,
      valid: false,
      severity: 'error',
      reason: `Año ${a} fuera de rango razonable (2000-${currentYear + 1})`,
      confidence: 1,
    })
  } else {
    validations.push({
      field: 'periodo_anio',
      value: a,
      valid: true,
      confidence: 1,
    })
  }

  return validations
}

/** Valida que las deducciones sean razonables (entre 5% y 50% del devengado). */
export function validatePayrollDeduccionesRange(
  devengado: unknown,
  deducciones: unknown,
): FieldValidation {
  const d = toNumber(devengado)
  const dd = toNumber(deducciones)

  if (d === null || dd === null || d <= 0) {
    return {
      field: 'total_deducciones',
      value: dd,
      valid: false,
      severity: 'info',
      reason: 'No se puede validar rango de deducciones',
      confidence: 0.5,
    }
  }

  const ratio = dd / d
  // Deducciones razonables: SS trabajador (~6.35%) + IRPF (varía 0-45%) → suma 5-50%
  if (ratio < 0.02 || ratio > 0.55) {
    return {
      field: 'total_deducciones',
      value: dd,
      valid: false,
      severity: 'warning',
      reason: `Deducciones (${(ratio * 100).toFixed(
        1,
      )}% del devengado) fuera de rango habitual (2-55%). Revisar`,
      confidence: 0.7,
    }
  }

  return {
    field: 'total_deducciones',
    value: dd,
    valid: true,
    confidence: 1,
  }
}

/**
 * Aplica todas las validaciones matemáticas de nómina.
 */
export function validatePayrollMath(fields: PayrollFields): FieldValidation[] {
  const validations: FieldValidation[] = []

  validations.push(
    validatePayrollLiquido(
      fields.total_devengado,
      fields.total_deducciones,
      fields.liquido_a_percibir,
    ),
  )
  validations.push(...validatePayrollPeriodo(fields.periodo_mes, fields.periodo_anio))
  validations.push(
    validatePayrollDeduccionesRange(fields.total_devengado, fields.total_deducciones),
  )

  return validations
}
