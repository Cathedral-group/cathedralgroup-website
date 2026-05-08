/**
 * Tipos compartidos del verificador algorítmico Cathedral.
 *
 * El verificador es la red de seguridad determinista que se ejecuta
 * después del extractor (Gemini/GPT-Vision) y antes de aceptar el
 * documento como válido. Detecta errores silenciosos como "NIF Z3239733E"
 * que el OCR aceptaría sin que ningún humano se entere.
 */

/** Tipo de documento que puede llegar al sistema. Mantener sincronizado con CHECK constraint de invoices.doc_type. */
export type DocumentType =
  | 'factura'
  | 'proforma'
  | 'rectificativa'
  | 'abono'
  | 'presupuesto'
  | 'albaran'
  | 'certificado'
  | 'certificacion'
  | 'contrato'
  | 'nota_simple'
  | 'escritura'
  | 'licencia'
  | 'informe'
  | 'nomina'
  | 'modelo_fiscal'
  | 'seguro'
  | 'ticket'
  | 'justificante_pago'
  | 'otro'

/** Severidad del problema encontrado en un campo. */
export type IssueSeverity = 'error' | 'warning' | 'info'

/** Resultado de validación de un campo individual. */
export interface FieldValidation {
  /** Nombre del campo (ej: "trabajador_nif", "iban", "total") */
  field: string
  /** Valor leído por el extractor */
  value: string | number | null
  /** ¿Pasa la validación? */
  valid: boolean
  /** Severidad si NO pasa */
  severity?: IssueSeverity
  /** Razón legible del fallo (en español, para la UI de revisión) */
  reason?: string
  /** Valor esperado/sugerido si se puede inferir (ej: letra correcta del NIF) */
  expected?: string | number | null
  /** Si se sugiere una corrección automática (ej: NIF "Z3239733E" → sugerir "03239733E") */
  suggestedCorrection?: string | number | null
  /** Confianza de la validación (0..1). Las matemáticas son 1.0, las heurísticas menos. */
  confidence: number
}

/** Resultado completo de verificar un documento. */
export interface VerificationResult {
  /** ¿El documento entero pasa todas las validaciones críticas? */
  overall_valid: boolean
  /** ¿Hay que mandar a /admin/revision? (true si hay error o warnings serios) */
  needs_review: boolean
  /** Confianza global (mín de todas las field_validations) */
  confidence: number
  /** Razones legibles del needs_review (para mostrar en sidebar de revisión) */
  review_reasons: string[]
  /** Validación campo a campo */
  field_validations: FieldValidation[]
  /** Tiempo de ejecución en ms (telemetría) */
  duration_ms: number
}

/** Payload de entrada para verificar un documento genérico. */
export interface VerificationRequest {
  /** Tipo de documento (decide qué validadores específicos aplicar) */
  document_type: DocumentType
  /** Campos extraídos por el extractor primario (Gemini/GPT) */
  fields: Record<string, unknown>
}

/** Payload específico de factura (campos esperados). */
export interface InvoiceFields {
  emisor_nif?: string | null
  emisor_nombre?: string | null
  receptor_nif?: string | null
  receptor_nombre?: string | null
  numero_factura?: string | null
  fecha_emision?: string | null   // ISO YYYY-MM-DD
  fecha_vencimiento?: string | null
  base_imponible?: number | null
  tipo_iva?: number | null         // 4, 10, 21
  cuota_iva?: number | null
  total?: number | null
  iban?: string | null
  [k: string]: unknown
}

/** Payload específico de nómina (campos esperados). */
export interface PayrollFields {
  trabajador_nif?: string | null
  trabajador_nombre?: string | null
  empresa_cif?: string | null
  empresa_nombre?: string | null
  periodo_desde?: string | null    // ISO YYYY-MM-DD
  periodo_hasta?: string | null
  periodo_mes?: number | null      // 1..12
  periodo_anio?: number | null
  total_devengado?: number | null
  total_deducciones?: number | null
  liquido_a_percibir?: number | null
  iban?: string | null
  /** Trimestre fiscal declarado (Q1/Q2/Q3/Q4). Validado contra periodo_mes. */
  modelo_111_trimestre?: string | null
  [k: string]: unknown
}
