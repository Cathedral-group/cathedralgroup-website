/**
 * GET /api/verifier/test-suite
 *
 * Batería de casos de prueba conocidos. Sirve como:
 *   1. Test de regresión cada vez que se despliega
 *   2. Documentación viva de qué casos cubre el verificador
 *   3. Smoke test desde curl/CI sin necesidad de Vitest
 *
 * Para ejecutar:
 *   curl https://cathedralgroup.es/api/verifier/test-suite
 *
 * Devuelve {passed, failed, total} + detalle de cada caso fallido.
 */

import { NextResponse } from 'next/server'
import {
  validateNIF,
  validateNIE,
  validateCIF,
  validateIBAN,
  verifyDocument,
  suggestSpanishIdCorrection,
} from '@/lib/verifier'

interface TestCase {
  name: string
  category: string
  run: () => boolean
  description?: string
}

const TESTS: TestCase[] = [
  // ─────── NIF (8 dígitos + letra, módulo 23) ───────
  {
    name: 'NIF caso Hipolito real (03239733E)',
    category: 'NIF',
    description: 'El NIF real de un trabajador que GPT-Vision leyó como Z3239733E',
    run: () => validateNIF('03239733E').valid === true,
  },
  {
    name: 'NIF Hipolito mal leído (Z3239733E) → debe fallar',
    category: 'NIF',
    description: 'El error silencioso original. SIN este check pasaría a BD',
    run: () => validateNIF('Z3239733E').valid === false, // Z no es NIF (sin 8 dígitos)
  },
  {
    name: 'Sugerencia OCR: Z3239733E → 03239733E',
    category: 'NIF',
    description: 'El verificador debe sugerir la corrección automáticamente',
    run: () => suggestSpanishIdCorrection('Z3239733E') === '03239733E',
  },
  {
    name: 'NIF válido genérico (00000000T)',
    category: 'NIF',
    run: () => validateNIF('00000000T').valid === true,
  },
  {
    name: 'NIF con letra incorrecta (00000000A) → debe fallar',
    category: 'NIF',
    run: () => validateNIF('00000000A').valid === false,
  },
  {
    name: 'NIF con espacios y guión (00000000-T)',
    category: 'NIF',
    run: () => validateNIF('00000000-T').valid === true,
  },

  // ─────── NIE (X/Y/Z + 7 dígitos + letra) ───────
  {
    name: 'NIE válido X (X1234567L)',
    category: 'NIE',
    run: () => validateNIE('X1234567L').valid === true,
  },
  {
    name: 'NIE válido Y (Y0149420A)',
    category: 'NIE',
    description: 'Y → 1, 10149420 mod 23 = 3 → letra A',
    run: () => validateNIE('Y0149420A').valid === true,
  },
  {
    name: 'NIE Z válido (Z0123456C)',
    category: 'NIE',
    description: 'Z → 2, 20123456 mod 23 = 20 → letra C',
    run: () => validateNIE('Z0123456C').valid === true,
  },
  {
    name: 'NIE con letra mala (X1234567A) → debe fallar',
    category: 'NIE',
    run: () => validateNIE('X1234567A').valid === false,
  },

  // ─────── CIF (letra + 7 dígitos + control) ───────
  {
    name: 'CIF tipo A (A28023430) — válido',
    category: 'CIF',
    description: 'CIF de Telefónica España',
    run: () => validateCIF('A28023430').valid === true,
  },
  {
    name: 'CIF tipo B con número control (B12345674)',
    category: 'CIF',
    run: () => validateCIF('B12345674').valid === true,
  },
  {
    name: 'CIF inválido (A28023431) → debe fallar',
    category: 'CIF',
    run: () => validateCIF('A28023431').valid === false,
  },

  // ─────── IBAN (módulo 97) ───────
  {
    name: 'IBAN ES válido (ES9121000418450200051332)',
    category: 'IBAN',
    description: 'IBAN de prueba canónico español',
    run: () => validateIBAN('ES9121000418450200051332').valid === true,
  },
  {
    name: 'IBAN ES con espacios (ES91 2100 0418 4502 0005 1332)',
    category: 'IBAN',
    run: () => validateIBAN('ES91 2100 0418 4502 0005 1332').valid === true,
  },
  {
    name: 'IBAN ES con un dígito mal (ES9121000418450200051333) → debe fallar',
    category: 'IBAN',
    run: () => validateIBAN('ES9121000418450200051333').valid === false,
  },
  {
    name: 'IBAN longitud incorrecta para ES (corto) → debe fallar',
    category: 'IBAN',
    run: () => validateIBAN('ES912100041845020005').valid === false,
  },
  {
    name: 'IBAN DE válido (DE89370400440532013000)',
    category: 'IBAN',
    description: 'IBAN de prueba canónico alemán',
    run: () => validateIBAN('DE89370400440532013000').valid === true,
  },

  // ─────── Verificador FACTURA completo ───────
  {
    name: 'Factura válida — base 100 + IVA 21 = total 121',
    category: 'Factura',
    run: () => {
      const r = verifyDocument({
        document_type: 'factura',
        fields: {
          emisor_nif: 'A28023430',
          receptor_nif: '00000000T',
          fecha_emision: '2026-04-15',
          base_imponible: 100,
          tipo_iva: 21,
          cuota_iva: 21,
          total: 121,
        },
      })
      return r.overall_valid === true && r.needs_review === false
    },
  },
  {
    name: 'Factura con total mal (debería ser 121, pone 120) → flag review',
    category: 'Factura',
    run: () => {
      const r = verifyDocument({
        document_type: 'factura',
        fields: {
          emisor_nif: 'A28023430',
          base_imponible: 100,
          tipo_iva: 21,
          cuota_iva: 21,
          total: 120,
        },
      })
      return r.overall_valid === false && r.needs_review === true
    },
  },
  {
    name: 'Factura con NIF mal leído → flag review + sugerencia corrección',
    category: 'Factura',
    description: 'Caso real Hipolito como factura',
    run: () => {
      const r = verifyDocument({
        document_type: 'factura',
        fields: {
          emisor_nif: 'Z3239733E', // mal leído por OCR
          base_imponible: 100,
          tipo_iva: 21,
          cuota_iva: 21,
          total: 121,
        },
      })
      const nifValidation = r.field_validations.find((v) => v.field === 'emisor_nif')
      return r.needs_review === true && nifValidation?.valid === false
    },
  },
  {
    name: 'Factura formato español "1.234,56" parsea correctamente',
    category: 'Factura',
    run: () => {
      const r = verifyDocument({
        document_type: 'factura',
        fields: {
          base_imponible: '1.234,56',
          tipo_iva: 21,
          cuota_iva: '259,26',
          total: '1.493,82',
        },
      })
      return r.overall_valid === true
    },
  },

  // ─────── Verificador NÓMINA completo ───────
  {
    name: 'Nómina válida — devengado 2500 - deducc 412.75 = líquido 2087.25',
    category: 'Nómina',
    run: () => {
      const r = verifyDocument({
        document_type: 'nomina',
        fields: {
          trabajador_nif: '00000000T',
          empresa_cif: 'A28023430',
          periodo_mes: 4,
          periodo_anio: 2026,
          total_devengado: 2500,
          total_deducciones: 412.75,
          liquido_a_percibir: 2087.25,
        },
      })
      return r.overall_valid === true
    },
  },
  {
    name: 'Nómina con líquido mal → flag review',
    category: 'Nómina',
    run: () => {
      const r = verifyDocument({
        document_type: 'nomina',
        fields: {
          total_devengado: 2500,
          total_deducciones: 412.75,
          liquido_a_percibir: 2000, // mal, debería ser 2087.25
        },
      })
      return r.overall_valid === false && r.needs_review === true
    },
  },
  {
    name: 'Nómina con periodo mes/trimestre incoherente → flag',
    category: 'Nómina',
    run: () => {
      const r = verifyDocument({
        document_type: 'nomina',
        fields: {
          trabajador_nif: '00000000T',
          periodo_mes: 4, // Q2
          periodo_anio: 2026,
          modelo_111_trimestre: 'Q1', // mal
          total_devengado: 2500,
          total_deducciones: 412.75,
          liquido_a_percibir: 2087.25,
        },
      })
      return r.needs_review === true
    },
  },

  // ─────── Fechas ───────
  {
    name: 'Fecha en el futuro (2099-12-31) → debe fallar',
    category: 'Fechas',
    run: () => {
      const r = verifyDocument({
        document_type: 'factura',
        fields: {
          fecha_emision: '2099-12-31',
          base_imponible: 100,
          tipo_iva: 21,
          cuota_iva: 21,
          total: 121,
        },
      })
      const fechaCheck = r.field_validations.find((v) => v.field === 'fecha_emision')
      return fechaCheck?.valid === false
    },
  },
  {
    name: 'Fecha vencimiento anterior a emisión → debe fallar',
    category: 'Fechas',
    run: () => {
      const r = verifyDocument({
        document_type: 'factura',
        fields: {
          fecha_emision: '2026-04-15',
          fecha_vencimiento: '2026-04-10',
          base_imponible: 100,
          tipo_iva: 21,
          cuota_iva: 21,
          total: 121,
        },
      })
      return r.needs_review === true
    },
  },

  // ─────── Documentos no específicos (escritura, contrato) ───────
  {
    name: 'Escritura solo valida NIFs/fechas (no matemática)',
    category: 'Otros',
    run: () => {
      const r = verifyDocument({
        document_type: 'escritura',
        fields: {
          notario_nif: '00000000T',
          comprador_nif: 'A28023430',
          fecha_otorgamiento: '2026-04-15',
        },
      })
      return r.overall_valid === true
    },
  },
  {
    name: 'Contrato con CIF inválido → flag',
    category: 'Otros',
    run: () => {
      const r = verifyDocument({
        document_type: 'contrato',
        fields: {
          empresa_cif: 'A28023431', // inválido
          fecha_firma: '2026-04-15',
        },
      })
      return r.needs_review === true
    },
  },
]

export async function GET() {
  const results = TESTS.map((t) => {
    let passed = false
    let error: string | undefined
    try {
      passed = t.run()
    } catch (e) {
      passed = false
      error = e instanceof Error ? e.message : String(e)
    }
    return {
      name: t.name,
      category: t.category,
      description: t.description,
      passed,
      error,
    }
  })
  const passed = results.filter((r) => r.passed).length
  const failed = results.length - passed
  const failedCases = results.filter((r) => !r.passed)
  return NextResponse.json(
    {
      summary: {
        total: results.length,
        passed,
        failed,
        success_rate: `${((passed / results.length) * 100).toFixed(1)}%`,
        all_pass: failed === 0,
      },
      failed_cases: failedCases,
      all_results: results,
      timestamp: new Date().toISOString(),
    },
    {
      status: failed === 0 ? 200 : 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    },
  )
}

export const dynamic = 'force-dynamic'
