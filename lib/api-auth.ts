/**
 * Auth helper compartido para endpoints utility Cathedral.
 *
 * Consolida el patrón `checkAuth` duplicado en 7 endpoints (sesión 16/05 noche).
 * Bearer auth + comparación constant-time `timingSafeEqual` contra
 * `CATHEDRAL_INTERNAL_TOKEN`.
 *
 * Uso:
 *   import { checkCathedralInternalAuth } from '@/lib/api-auth'
 *
 *   export async function POST(request: Request) {
 *     if (!checkCathedralInternalAuth(request)) {
 *       return Response.json({ error: 'Unauthorized' }, { status: 401 })
 *     }
 *     // ... resto handler
 *   }
 *
 * Compatible con `Request` (Web API) y `NextRequest` (Next.js 15) —
 * ambos tienen `request.headers.get()`.
 *
 * Nota seguridad: el length check antes de `timingSafeEqual` introduce un
 * timing leak teórico del length del token. NO es vulnerabilidad real porque
 * `CATHEDRAL_INTERNAL_TOKEN` tiene length fija conocida (64 chars hex,
 * `openssl rand -hex 32`). Si el token rotara a length variable, eliminar
 * el length check + dejar que `timingSafeEqual` lance.
 */
import { timingSafeEqual } from 'node:crypto'

/**
 * Verifica `Authorization: Bearer <CATHEDRAL_INTERNAL_TOKEN>` con
 * comparación constant-time. Devuelve `true` si el token coincide.
 *
 * Tolerante a whitespace trailing en env var (caso común Vercel .env).
 */
export function checkCathedralInternalAuth(request: Request): boolean {
  const authHeader = request.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  const expected = (process.env.CATHEDRAL_INTERNAL_TOKEN ?? '').trim()

  if (!token || !expected) return false
  if (token.length !== expected.length) return false

  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected))
  } catch {
    return false
  }
}
