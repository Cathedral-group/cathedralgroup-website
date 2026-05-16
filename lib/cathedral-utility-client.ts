/**
 * Wrappers para microutility endpoints Cathedral (/api/dedup, /api/fuzzy-supplier,
 * /api/decide-table, /api/feature-flag-check).
 *
 * Llamados server-side (Route Handlers, Server Actions, `after()` callbacks).
 * NO usar desde Client Components — los wrappers usan `CATHEDRAL_INTERNAL_TOKEN`
 * (env var server-only).
 *
 * Diseño defensivo:
 *   - Timeout corto (4-6s) — los endpoints internos son <500ms p95
 *   - `try/catch` envuelve cada call → devuelve `null` si falla
 *   - Loggea error pero NUNCA throws → caller decide cómo manejar fallback
 *   - URL absoluta: usa `process.env.NEXT_PUBLIC_SITE_URL` o fallback Vercel preview
 *
 * Razón ser un wrapper en vez de inline fetch: centraliza auth + timeout + retry
 * + error handling, y permite mockeo en tests sin tocar route handlers.
 */

const DEFAULT_TIMEOUT_MS = 5000

function getBaseUrl(): string {
  // Producción: NEXT_PUBLIC_SITE_URL = https://cathedralgroup.es (o vercel.app)
  // Preview/desarrollo: usa VERCEL_URL si está disponible
  // Fallback local: localhost:3000
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }
  return 'http://localhost:3000'
}

function getAuthHeaders(): Record<string, string> {
  const token = process.env.CATHEDRAL_INTERNAL_TOKEN ?? ''
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown'
    console.warn(`[utility-client] fetch ${url} failed: ${message}`)
    return null
  } finally {
    clearTimeout(timer)
  }
}

// =============================================================================
// /api/feature-flag-check
// =============================================================================

export interface FlagCheckResult {
  should_use: boolean
  flag_enabled: boolean
  rollout_pct: number
}

export async function callFeatureFlagCheck(
  key: string,
  subject_id: string
): Promise<FlagCheckResult | null> {
  const url = `${getBaseUrl()}/api/feature-flag-check?key=${encodeURIComponent(
    key
  )}&subject_id=${encodeURIComponent(subject_id)}`
  const res = await fetchWithTimeout(
    url,
    { method: 'GET', headers: getAuthHeaders(), cache: 'no-store' },
    3000
  )
  if (!res || !res.ok) return null
  try {
    return (await res.json()) as FlagCheckResult
  } catch {
    return null
  }
}

// =============================================================================
// /api/dedup
// =============================================================================

export interface DedupResult {
  is_duplicate: boolean
  existing_id: string | null
  table: 'invoices' | 'documents' | null
  created_at: string | null
}

export async function callDedup(file_hash: string): Promise<DedupResult | null> {
  const url = `${getBaseUrl()}/api/dedup`
  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ file_hash }),
      cache: 'no-store',
    },
    DEFAULT_TIMEOUT_MS
  )
  if (!res || !res.ok) return null
  try {
    return (await res.json()) as DedupResult
  } catch {
    return null
  }
}

// =============================================================================
// /api/fuzzy-supplier
// =============================================================================

export interface FuzzySupplierResult {
  match_found: boolean
  supplier_id: string | null
  supplier_name: string | null
  supplier_nif: string | null
  match_type: 'nif_exact' | 'name_fuzzy' | null
  confidence: number
  auto_assign: boolean
  needs_review: boolean
  candidates: Array<{
    supplier_id: string
    supplier_name: string
    supplier_nif: string | null
    confidence: number
  }>
}

export async function callFuzzySupplier(
  name: string,
  nif?: string | null
): Promise<FuzzySupplierResult | null> {
  if (!name || name.trim().length < 2) return null
  const url = `${getBaseUrl()}/api/fuzzy-supplier`
  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        name: name.trim(),
        ...(nif && nif.trim() ? { nif: nif.trim() } : {}),
      }),
      cache: 'no-store',
    },
    DEFAULT_TIMEOUT_MS
  )
  if (!res || !res.ok) return null
  try {
    return (await res.json()) as FuzzySupplierResult
  } catch {
    return null
  }
}

// =============================================================================
// Helper SHA-256 hex (lowercase 64 chars) — Web Crypto API
// Funciona en Node.js 18+ runtime (Vercel Hobby Fluid Compute compatible).
// =============================================================================

export async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const bytes = new Uint8Array(hashBuffer)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
