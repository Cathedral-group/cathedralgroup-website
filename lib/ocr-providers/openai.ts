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
import { toNumber } from '@/lib/verifier/invoice-math'

const MODEL = 'gpt-4o-mini'
const ENDPOINT_DIRECT = 'https://api.openai.com/v1/chat/completions'

/**
 * Cloudflare AI Gateway opt-in.
 * Cuando USE_AI_GATEWAY=true + CF_AI_GATEWAY_BASE + CF_AI_GATEWAY_TOKEN están definidos,
 * las llamadas pasan por el gateway (cache 30d + observability + auth headers extra).
 */
function buildEndpoint(): { url: string; extraHeaders: Record<string, string> } {
  const useGateway = process.env.USE_AI_GATEWAY === 'true'
  const gwBase = process.env.CF_AI_GATEWAY_BASE
  const gwToken = process.env.CF_AI_GATEWAY_TOKEN

  if (useGateway && gwBase && gwToken) {
    return {
      url: `${gwBase}/openai/chat/completions`,
      extraHeaders: { 'cf-aig-authorization': `Bearer ${gwToken}` },
    }
  }
  return { url: ENDPOINT_DIRECT, extraHeaders: {} }
}

/**
 * SYSTEM_PROMPT fallback hardcoded para casos donde el registry SSOT no está
 * accesible (cold start, BD down). En operación normal el prompt viene del
 * registry tabla `prompt_templates` code='vision_ocr' renderizado con
 * lib/registry.renderPrompt().
 *
 * Sustitución dinámica: extractWithOpenAi acepta `overridePrompt` opcional;
 * callers (route handlers) leen prompt desde registry y lo pasan aquí.
 */
const SYSTEM_PROMPT_FALLBACK = `Eres un experto en contabilidad y OCR de facturas españolas.
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
  overridePrompt?: string,
): Promise<ExtractedReceiptData | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null

  try {
    const base64 = Buffer.from(imageBuffer).toString('base64')
    const dataUrl = `data:${mimeType};base64,${base64}`

    const systemPrompt = overridePrompt || SYSTEM_PROMPT_FALLBACK
    const body = {
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
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

    const { url, extraHeaders } = buildEndpoint()
    // Timeout 30s: prevenir hang indefinido (audit 16/05) que dejaría worker
    // bloqueado + tokens en flight sin cap. AbortSignal.timeout disponible
    // en Node.js 17.3+ y Vercel Fluid Compute runtime nodejs.
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        ...extraHeaders,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
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

    // Parser robusto compartido ("1.234,56" ES / "1,234.56" EN). El replace(',','.')
    // antiguo rompía el separador de miles → importes 1000× mal.
    const num = toNumber

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
