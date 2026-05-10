/**
 * POST /api/cron/backup-restore-test-record
 *
 * Sprint A Backup Robusto — registra el resultado del fire drill semanal
 * automatizado (verificación SIN descifrar para no exponer la clave privada).
 *
 * El workflow `.github/workflows/cron-backup-restore-test.yml` corre cada
 * domingo y verifica:
 *   1. Que existe artifact reciente (último cathedral_db_dump_*)
 *   2. Que SHA-256 coincide con el registrado en backup_runs
 *   3. Que `gpg --list-packets` lo reconoce como GPG válido
 *
 * Verificación FULL con descifrado real = tabletop exercise trimestral
 * manual de David (con la passphrase en su poder, en máquina aislada).
 *
 * Auth: Bearer AUDIT_CRON_SECRET.
 *
 * Body: {
 *   backup_run_id: string,           // UUID del backup_run a marcar
 *   status: 'passed' | 'failed',
 *   details: {
 *     sha256_match?: boolean,
 *     gpg_packets_ok?: boolean,
 *     file_size_bytes?: number,
 *     artifact_run_id?: string,
 *     verification_type?: 'partial' | 'full',  // partial = sin descifrar; full = descifrado real
 *     error_message?: string
 *   }
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

function authBearer(request: NextRequest): boolean {
  const expected = process.env.AUDIT_CRON_SECRET
  if (!expected) return false
  const auth = request.headers.get('authorization') || ''
  if (!auth.startsWith('Bearer ')) return false
  return auth.slice(7) === expected
}

interface Body {
  backup_run_id?: string
  status?: 'passed' | 'failed'
  details?: Record<string, unknown>
}

export async function POST(request: NextRequest) {
  if (!authBearer(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.backup_run_id || !/^[0-9a-f-]{36}$/i.test(body.backup_run_id)) {
    return NextResponse.json(
      { error: 'backup_run_id requerido (UUID)' },
      { status: 400 },
    )
  }
  if (!body.status || !['passed', 'failed'].includes(body.status)) {
    return NextResponse.json(
      { error: "status debe ser 'passed' o 'failed'" },
      { status: 400 },
    )
  }

  const supabase = createAdminSupabaseClient()

  try {
    const { data: updated, error } = await supabase.rpc('record_backup_restore_test', {
      p_backup_run_id: body.backup_run_id,
      p_status: body.status,
      p_details: body.details ?? {},
    })
    if (error) throw new Error(`record_backup_restore_test: ${error.message}`)
    if (!updated) {
      return NextResponse.json(
        { ok: false, error: 'backup_run_id no encontrado' },
        { status: 404 },
      )
    }

    // Si el drill falló, levantar notificación crítica
    if (body.status === 'failed') {
      const errMsg = (body.details?.error_message as string) || 'sin detalle'
      await supabase.rpc('upsert_system_notification', {
        p_severity: 'critical',
        p_title: 'Fire drill restore FALLÓ',
        p_message:
          `El fire drill semanal automatizado falló sobre backup_run ${body.backup_run_id.slice(0, 8)}…. ` +
          `Posibles causas: archivo corrupto, SHA-256 no coincide, GPG packets inválidos. ` +
          `Detalle: ${errMsg}. Acción: tabletop manual con descifrado real para diagnóstico.`,
        p_source: 'fire_drill_auto',
        p_metadata: body.details ?? {},
        p_dedup_key: 'fire_drill_failed',
      })
    }

    return NextResponse.json({
      ok: true,
      backup_run_id: body.backup_run_id,
      status: body.status,
    })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}

export const dynamic = 'force-dynamic'
