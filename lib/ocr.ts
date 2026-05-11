/**
 * OCR orquestador con cascada de providers.
 *
 * David: 'Falla Gemini API y queda parado. Igual que hacemos con el resto
 * del workflow general, debería haber una cascada de proveedores.'
 *
 * Orden:
 *   1. Gemini Flash 2.x   (más barato + rápido)
 *   2. OpenAI GPT-4o-mini (fallback robusto)
 *   3. Mistral Pixtral    (último recurso, también económico)
 *
 * Triggers de cascada:
 *   - Provider devuelve null (no configurado / lib error)
 *   - confidence < threshold (default 0.5)
 *   - warnings contiene 'parse' / 'borrosa' / 'no se pudo'
 *
 * Cada provider se intenta SOLO si está configurado (env var presente).
 * Si ninguno está disponible → null (el ticket queda en status='uploaded'
 * para revisión manual).
 *
 * Patrón consistente con el workflow n8n general que cascadea Gemini→GPT→Mistral.
 */

import type { ExtractedReceiptData } from '@/lib/ocr-gemini'
import { extractReceiptData as extractWithGemini, isOcrAvailable as isGeminiAvailable } from '@/lib/ocr-gemini'
import { extractWithOpenAi, isOpenAiAvailable } from '@/lib/ocr-providers/openai'
import { extractWithMistral, isMistralAvailable } from '@/lib/ocr-providers/mistral'

export interface OcrResult extends ExtractedReceiptData {
  /** Qué provider devolvió el resultado final */
  provider: 'gemini' | 'openai' | 'mistral'
  /** Providers intentados antes (vacío si el primero acertó) */
  fallbacks: string[]
}

const CONFIDENCE_THRESHOLD = 0.5

export function isCascadeAvailable(): boolean {
  return isGeminiAvailable() || isOpenAiAvailable() || isMistralAvailable()
}

export function availableProviders(): string[] {
  const list: string[] = []
  if (isGeminiAvailable()) list.push('gemini')
  if (isOpenAiAvailable()) list.push('openai')
  if (isMistralAvailable()) list.push('mistral')
  return list
}

function shouldFallback(r: ExtractedReceiptData | null): boolean {
  if (!r) return true
  const conf = r.confidence ?? 0
  if (conf < CONFIDENCE_THRESHOLD) return true
  const warns = r.warnings ?? []
  if (warns.some((w) => /parse|borros|no se pudo|error/i.test(w))) return true
  return false
}

/**
 * Llama a los providers en cascada. Devuelve el primer resultado aceptable
 * o el último si todos fallan (con `provider` marcando cuál fue).
 */
export async function extractReceiptDataCascade(
  imageBuffer: ArrayBuffer,
  mimeType: string,
): Promise<OcrResult | null> {
  const fallbacks: string[] = []
  let lastResult: { data: ExtractedReceiptData | null; provider: OcrResult['provider'] } | null = null

  const providers: Array<{
    name: OcrResult['provider']
    available: () => boolean
    fn: (b: ArrayBuffer, m: string) => Promise<ExtractedReceiptData | null>
  }> = [
    { name: 'gemini', available: isGeminiAvailable, fn: extractWithGemini },
    { name: 'openai', available: isOpenAiAvailable, fn: extractWithOpenAi },
    { name: 'mistral', available: isMistralAvailable, fn: extractWithMistral },
  ]

  for (const p of providers) {
    if (!p.available()) {
      fallbacks.push(`${p.name}:skipped_no_key`)
      continue
    }
    const data = await p.fn(imageBuffer, mimeType)
    lastResult = { data, provider: p.name }

    if (!shouldFallback(data) && data) {
      return { ...data, provider: p.name, fallbacks }
    }
    // Provider no aceptable — registramos motivo y seguimos
    const conf = data?.confidence ?? 0
    fallbacks.push(`${p.name}:low_conf_${conf.toFixed(2)}`)
  }

  // Ninguno aceptable. Devolvemos el último para que el admin lo revise manualmente.
  if (lastResult?.data) {
    return { ...lastResult.data, provider: lastResult.provider, fallbacks }
  }
  return null
}
