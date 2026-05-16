/**
 * OCR provider — Mistral Pixtral (Vision).
 *
 * Tercer fallback (último recurso). Pixtral 12B Large soporta visión y es
 * el modelo más barato de los 3 — útil si Gemini y OpenAI fallan o están
 * en rate limit.
 *
 * REST API directo (sin SDK).
 */

import type { ExtractedReceiptData } from '@/lib/ocr-gemini'

const MODEL = 'pixtral-large-latest'
const ENDPOINT_DIRECT = 'https://api.mistral.ai/v1/chat/completions'

/**
 * Cloudflare AI Gateway opt-in.
 * Cuando USE_AI_GATEWAY=true + CF_AI_GATEWAY_BASE + CF_AI_GATEWAY_TOKEN están definidos,
 * las llamadas pasan por el gateway (cache 30d + observability).
 */
function buildEndpoint(): { url: string; extraHeaders: Record<string, string> } {
  const useGateway = process.env.USE_AI_GATEWAY === 'true'
  const gwBase = process.env.CF_AI_GATEWAY_BASE
  const gwToken = process.env.CF_AI_GATEWAY_TOKEN

  if (useGateway && gwBase && gwToken) {
    return {
      url: `${gwBase}/mistral/v1/chat/completions`,
      extraHeaders: { 'cf-aig-authorization': `Bearer ${gwToken}` },
    }
  }
  return { url: ENDPOINT_DIRECT, extraHeaders: {} }
}

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

Devuelve SOLO el JSON, sin markdown ni texto adicional.`

export function isMistralAvailable(): boolean {
  return Boolean(process.env.MISTRAL_API_KEY)
}

export async function extractWithMistral(
  imageBuffer: ArrayBuffer,
  mimeType: string,
): Promise<ExtractedReceiptData | null> {
  const apiKey = process.env.MISTRAL_API_KEY
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
            { type: 'image_url', image_url: dataUrl },
          ],
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 800,
    }

    const { url, extraHeaders } = buildEndpoint()
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
        ...extraHeaders,
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`Mistral ${res.status}: ${errText.slice(0, 200)}`)
    }
    const json = await res.json()
    const text = json?.choices?.[0]?.message?.content ?? ''
    if (!text) {
      return { confidence: 0, warnings: ['Mistral no devolvió contenido'] }
    }

    const cleaned = text
      .replace(/^```json\s*/, '')
      .replace(/^```\s*/, '')
      .replace(/```\s*$/, '')
      .trim()

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      return { confidence: 0, warnings: ['No se pudo parsear Mistral'], raw_model_response: text }
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
      confidence: num(parsed.confidence) ?? 0.5,
      warnings: Array.isArray(parsed.warnings) ? (parsed.warnings as string[]) : [],
      raw_model_response: text,
    }
  } catch (e) {
    console.warn('[ocr-mistral]', e)
    return {
      confidence: 0,
      warnings: ['Error Mistral: ' + (e instanceof Error ? e.message : 'unknown')],
    }
  }
}
