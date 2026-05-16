/**
 * OCR Gemini Vision para tickets/albaranes/facturas que sube el trabajador
 *
 * Usa Gemini Flash 2.x (state-of-art, barato, rápido). Si GEMINI_API_KEY
 * no está configurada, devuelve null y el ticket queda en status='uploaded'
 * para revisión manual.
 *
 * Patrón consistente con el workflow n8n general (mismos campos extraídos
 * que el clasificador v4).
 *
 * MIGRACIÓN SDK 16/05/2026 (ADR-0005):
 * Sustituido `@google/generative-ai` (deprecated 30/11/2025, repo archivado
 * 16/12/2025) por `@google/genai` v2.3.0 (sucesor oficial Google).
 *
 * Cambios clave del nuevo SDK respecto al legacy:
 *   - Clase `GoogleGenAI` (no `GoogleGenerativeAI`)
 *   - `httpOptions` se pasa al constructor del cliente (no por llamada)
 *   - `httpOptions.headers` (NO `customHeaders`)
 *   - `ai.models.generateContent({...})` en lugar de
 *     `getGenerativeModel().generateContent([...])`
 *   - `contents: [{ parts: [...] }]` estructurado (no array plano)
 *   - `response.text` PROPERTY (no `response.text()` método)
 *   - `config.thinkingConfig.thinkingBudget = 0` desactiva thinking tokens
 *     (gemini-2.5-flash los genera por defecto, ~28 por call para OCR
 *     Cathedral según observación empírica en gateway logs 16/05/2026).
 *     thinkingBudget=0 ahorra ~10% coste output sin pérdida de precisión
 *     para extracción estructurada.
 *
 * Doc:
 *   - https://ai.google.dev/gemini-api/docs/libraries
 *   - https://github.com/googleapis/js-genai
 *   - https://ai.google.dev/gemini-api/docs/thinking
 */

import { GoogleGenAI } from '@google/genai'

export interface ExtractedReceiptData {
  proveedor_nombre?: string | null
  proveedor_nif?: string | null
  numero_factura?: string | null
  fecha_emision?: string | null // YYYY-MM-DD
  importe_base?: number | null
  iva_pct?: number | null
  iva_importe?: number | null
  importe_total?: number | null
  categoria_gasto?:
    | 'material'
    | 'mano_de_obra'
    | 'subcontratas'
    | 'alquiler'
    | 'servicios'
    | 'otros'
    | null
  forma_pago?: string | null
  texto_completo?: string | null
  confidence?: number | null // 0-1, indica fiabilidad de la extracción
  warnings?: string[] // ej: 'imagen borrosa', 'falta NIF', etc.
  raw_model_response?: string
}

const SYSTEM_PROMPT = `Eres un experto en contabilidad y OCR de facturas españolas.
Recibes una imagen de un ticket, albarán o factura. Extrae los siguientes campos en JSON:

{
  "proveedor_nombre": "string o null",
  "proveedor_nif": "NIF/CIF español o null (formato: A12345678, B12345678, X1234567A, etc.)",
  "numero_factura": "string o null",
  "fecha_emision": "YYYY-MM-DD o null",
  "importe_base": "número decimal sin €, o null",
  "iva_pct": "número (4, 10, 21) o null",
  "iva_importe": "número decimal o null",
  "importe_total": "número decimal o null (lo que paga el cliente, IVA incluido)",
  "categoria_gasto": "uno de: material | mano_de_obra | subcontratas | alquiler | servicios | otros",
  "forma_pago": "tarjeta | efectivo | transferencia | aplazado | null",
  "confidence": "número 0-1 con la fiabilidad de tu extracción",
  "warnings": ["lista de strings con problemas detectados"]
}

Reglas:
- Si la imagen está borrosa o no legible, indica confidence < 0.5 y añade warning.
- Si es un ticket simplificado (<400€), proveedor_nif puede ser null.
- categoria_gasto: deduce del tipo de comercio (Leroy Merlin/ferretería/almacén → material; restaurante → otros (dieta); subcontratista con factura → subcontratas).
- Devuelve SOLO el JSON, sin markdown ni texto adicional.`

const MODEL = 'gemini-2.5-flash'

/**
 * Construye httpOptions para Cloudflare AI Gateway opt-in.
 *
 * Cuando USE_AI_GATEWAY=true + CF_AI_GATEWAY_BASE + CF_AI_GATEWAY_TOKEN están
 * definidos, las llamadas pasan por el gateway (cache 30d + observability +
 * rate-limit centralizado).
 *
 * Patron oficial Cloudflare AI Gateway + @google/genai:
 *   https://developers.cloudflare.com/ai-gateway/usage/providers/google-ai-studio/
 *
 * KEY: la clave del header en `httpOptions.headers` es `headers` (no
 * `customHeaders` como en SDK legacy).
 */
function buildHttpOptions(): Record<string, unknown> {
  const useGateway = process.env.USE_AI_GATEWAY === 'true'
  const gwBase = process.env.CF_AI_GATEWAY_BASE
  const gwToken = process.env.CF_AI_GATEWAY_TOKEN

  if (!useGateway || !gwBase || !gwToken) return {}

  return {
    baseUrl: `${gwBase}/google-ai-studio`,
    headers: {
      'cf-aig-authorization': `Bearer ${gwToken}`,
    },
  }
}

export function isOcrAvailable(): boolean {
  return Boolean(process.env.GEMINI_API_KEY)
}

export async function extractReceiptData(
  imageBuffer: ArrayBuffer,
  mimeType: string,
): Promise<ExtractedReceiptData | null> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return null

  try {
    // SDK v2 (@google/genai): cliente único, httpOptions a nivel constructor
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: buildHttpOptions(),
    })

    const base64 = Buffer.from(imageBuffer).toString('base64')

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [
        {
          parts: [
            { inlineData: { mimeType, data: base64 } },
            { text: 'Extrae los datos en JSON según el formato indicado.' },
          ],
        },
      ],
      config: {
        systemInstruction: SYSTEM_PROMPT,
        // Desactiva thinking tokens (gemini-2.5-flash los genera por defecto,
        // ~28 por call observados empíricamente). Para OCR estructurado de
        // facturas no necesitamos razonamiento profundo — solo extraer campos.
        // Ahorro ~10% coste output sin pérdida de precisión.
        // Doc: https://ai.google.dev/gemini-api/docs/thinking
        thinkingConfig: { thinkingBudget: 0 },
      },
    })

    // SDK v2: response.text es PROPERTY (no método .text())
    const text = (response.text ?? '').trim()
    if (!text) {
      return {
        confidence: 0,
        warnings: ['Gemini no devolvió texto'],
      }
    }

    // Limpiar markdown si Gemini lo añade pese al prompt
    const jsonText = text
      .replace(/^```json\s*/, '')
      .replace(/^```\s*/, '')
      .replace(/```\s*$/, '')
      .trim()

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(jsonText)
    } catch {
      return {
        confidence: 0,
        warnings: ['No se pudo parsear la respuesta del modelo'],
        raw_model_response: text,
      }
    }

    // Sanitizar números
    const num = (v: unknown): number | null => {
      if (v === null || v === undefined || v === '') return null
      const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'))
      return Number.isFinite(n) ? n : null
    }

    return {
      proveedor_nombre: (parsed.proveedor_nombre as string) ?? null,
      proveedor_nif: (parsed.proveedor_nif as string) ?? null,
      numero_factura: (parsed.numero_factura as string) ?? null,
      fecha_emision: (parsed.fecha_emision as string) ?? null,
      importe_base: num(parsed.importe_base),
      iva_pct: num(parsed.iva_pct),
      iva_importe: num(parsed.iva_importe),
      importe_total: num(parsed.importe_total),
      categoria_gasto: (parsed.categoria_gasto as ExtractedReceiptData['categoria_gasto']) ?? null,
      forma_pago: (parsed.forma_pago as string) ?? null,
      confidence: num(parsed.confidence) ?? 0.5,
      warnings: Array.isArray(parsed.warnings) ? (parsed.warnings as string[]) : [],
      raw_model_response: text,
    }
  } catch (e) {
    console.error('[ocr-gemini]', e)
    return {
      confidence: 0,
      warnings: [
        'Error al llamar al modelo OCR: ' + (e instanceof Error ? e.message : 'unknown'),
      ],
    }
  }
}
