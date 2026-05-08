/**
 * Admin email allow-list — single source of truth.
 *
 * Solo los emails listados aquí pueden acceder al panel admin (/admin/*) y
 * a las APIs internas (/api/db/*, /api/login-log).
 *
 * Para añadir un nuevo socio/empleado:
 *   1. Crear su cuenta en Supabase Dashboard → Authentication → Users (Invite)
 *   2. Añadir su email a esta lista
 *   3. Hacer commit y push (Vercel desplegará)
 *   4. Pedirle que entre y configure Google Authenticator (TOTP) — el middleware lo fuerza
 *
 * NUNCA añadir aquí cuentas de servicio / agentes IA. Esos usan el MCP de Supabase
 * o tokens API específicos, no entran al panel web.
 */

export const ADMIN_ALLOWED_EMAILS = [
  'd.vieco@cathedralgroup.es',      // David Vieco (socio)
  'jm.lozano@cathedralgroup.es',    // JM Lozano (socio)
  'j.rivera@cathedralgroup.es',     // Julián Rivera (socio) — pendiente configurar MFA
] as const

/**
 * Verifica si un email tiene permiso de admin.
 * Comparación case-insensitive + trim de whitespace defensivo
 * (Supabase auth puede entregar el email con espacios trailing si se filtró
 * desde input no sanitizado en algún flujo).
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const normalized = email.trim().toLowerCase()
  return ADMIN_ALLOWED_EMAILS.includes(
    normalized as (typeof ADMIN_ALLOWED_EMAILS)[number]
  )
}
