/**
 * Rate-limit in-memory para endpoints del portal trabajador.
 *
 * Justificación: el portal trabajador NO usa Supabase Auth, así que la única
 * autenticación es el token UUID + (opcional) cookie de sesión PIN. Sin rate-limit
 * a nivel endpoint, un atacante con un token válido podría:
 *   - Crear miles de partes/gastos/ausencias/tickets para saturar admin
 *   - Brute-forcear el endpoint login-pin desde múltiples IPs/User-Agents
 *   - DOS contra el storage bucket vía upload-receipt
 *
 * El RPC `validate_worker_pin` ya tiene lockout BD por intentos (5 → 15 min).
 * Este helper añade una capa de defensa por IP en cualquier endpoint.
 *
 * Limitaciones conocidas:
 *   - In-memory: cada Lambda de Vercel mantiene su propio Map, así que un atacante
 *     con muchas IPs y suerte de balancing podría escapar parcialmente. Suficiente
 *     contra ataques no sofisticados.
 *   - Reset al deploy / cold start.
 *
 * Para rate-limit fuerte distribuido: migrar a Upstash Redis o a tabla BD
 * (similar a check_login_rate_limit). No urgente para portal trabajador (volumen bajo).
 */

import { NextRequest, NextResponse } from 'next/server'

interface Bucket {
  count: number
  resetAt: number
}

// Mapas separados por categoría — no comparten cuotas entre acciones distintas.
const buckets: Record<string, Map<string, Bucket>> = {}

/**
 * Limpia entradas expiradas del bucket. Llamar oportunísticamente para no crecer
 * infinito. No es O(1), pero los buckets son pequeños (10-100 entries típicos).
 */
function sweepIfNeeded(bucket: Map<string, Bucket>) {
  if (bucket.size < 200) return
  const now = Date.now()
  for (const [k, v] of bucket) {
    if (v.resetAt < now) bucket.delete(k)
  }
}

export interface RateLimitConfig {
  /** Nombre de la categoría (ej: 'pin-login', 'parte-write'). Mapas separados. */
  category: string
  /** Máximo de requests permitidos en la ventana. */
  max: number
  /** Ventana en milisegundos. */
  windowMs: number
  /** Clave de identificación (típicamente IP, IP+token o token). */
  key: string
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
  retryAfterSeconds: number
}

export function checkRateLimit(cfg: RateLimitConfig): RateLimitResult {
  const map = (buckets[cfg.category] ??= new Map())
  sweepIfNeeded(map)

  const now = Date.now()
  const entry = map.get(cfg.key)

  if (!entry || entry.resetAt < now) {
    map.set(cfg.key, { count: 1, resetAt: now + cfg.windowMs })
    return {
      allowed: true,
      remaining: cfg.max - 1,
      resetAt: now + cfg.windowMs,
      retryAfterSeconds: 0,
    }
  }

  if (entry.count >= cfg.max) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    }
  }

  entry.count += 1
  return {
    allowed: true,
    remaining: cfg.max - entry.count,
    resetAt: entry.resetAt,
    retryAfterSeconds: 0,
  }
}

/**
 * Extrae la IP cliente con fallback. Usado para identificar el origen del request.
 * Para portal trabajador combinamos token+ip — si el token está comprometido,
 * limitar por IP impide a un atacante exfiltrarlo a una red distribuida sin pagar coste.
 */
export function getClientIp(request: NextRequest): string {
  const fwd = request.headers.get('x-forwarded-for')
  if (fwd) {
    const first = fwd.split(',')[0]?.trim()
    if (first) return first
  }
  return request.headers.get('x-real-ip') ?? 'unknown'
}

/**
 * Helper para devolver 429 cuando excede. Devuelve null si está permitido.
 * Usage:
 *   const rl = enforce({...})
 *   if (rl) return rl
 */
export function enforce(cfg: RateLimitConfig): NextResponse | null {
  const result = checkRateLimit(cfg)
  if (result.allowed) return null
  return NextResponse.json(
    {
      error: 'Demasiadas peticiones. Espera un poco e inténtalo de nuevo.',
      retryAfter: result.retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(result.retryAfterSeconds),
        'X-RateLimit-Reset': String(Math.floor(result.resetAt / 1000)),
      },
    },
  )
}
