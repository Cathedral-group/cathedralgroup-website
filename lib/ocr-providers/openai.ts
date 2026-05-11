/**
 * OCR provider — OpenAI GPT-4o-mini (Vision).
 *
 * Fallback si Gemini falla o devuelve confidence baja.
 *
 * REST API directo (sin SDK) para no aumentar el bundle.
 * Modelo: gpt-4o-mini (más barato que gpt-4o, soporta visión, suficiente
 * para tickets/facturas que tienen estructura conocida).
 */

import type { ExtractedReceiptData } from '@/lib/ocr-gemini'

const MODEL = 'gpt-4o-mini'
const ENDPOINT = 'https://api.openai.com/v1/chat/completions'

const SYSTEM_PROMPT = `Eres un experto en contabilidad y OCR de facturas españolas.
Recibes una imagen de un ticket, albarán o factura y extraes los siguientes campos en JSON:

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

export function isOpenAiAvailable(): boolean {
  return Boolean(process.env.OPENAI_API_KEY)
}

export async function extractWithOpenAi(
  imageBuffer: ArrayBuffer,
  mimeType: string,
): Promise<ExtractedReceiptData | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null

  try {
    const base64 = Buffer.from(imageBuffer).toString('base64')
    const dataUrl = `data:${mimeType};base64,${base64}`

    const body = {
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extrae los datos en JSON.' },
            { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
          ],
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 800,
    }

    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`OpenAI ${res.status}: ${errText.slice(0, 200)}`)
    }
    const json = await res.json()
    const text = json?.choices?.[0]?.message?.content ?? ''
    if (!text) {
      return { confidence: 0, warnings: ['OpenAI no devolvió contenido'] }
    }

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(text)
    } catch {
      return { confidence: 0, warnings: ['No se pudo parsear OpenAI'], raw_model_response: text }
    }

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
      confidence: num(parsed.confidence) ?? 0.6,
      warnings: Array.isArray(parsed.warnings) ? (parsed.warnings as string[]) : [],
      raw_model_response: text,
    }
  } catch (e) {
    console.warn('[ocr-openai]', e)
    return {
      confidence: 0,
      warnings: ['Error OpenAI: ' + (e instanceof Error ? e.message : 'unknown')],
    }
  }
}
