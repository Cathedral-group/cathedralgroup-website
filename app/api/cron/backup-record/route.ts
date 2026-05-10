/**
 * POST /api/cron/backup-record
 *
 * Sprint A Backup Robusto — endpoint para que GitHub Actions / Hetzner cron /
 * n8n workflow registren el RESULTADO de un backup ejecutado.
 *
 * Auth: Bearer AUDIT_CRON_SECRET (mismo patrón que /api/notifications POST).
 *
 * Body: {
 *   trigger_type: 'cron' | 'manual' | 'pre_migration' | 'fire_drill' | 'github_actions' | 'hetzner_cron',
 *   backup_type: 'pg_dump' | 'n8n_volume' | 'full_combined',
 *   status: 'success' | 'failed',
 *   category?: 'daily' | 'weekly' | 'monthly' | 'manual' | 'pre_migration' | 'fire_drill',
 *   triggered_by?: string,
 *   file_size_bytes?: number,
 *   file_sha256?: string,
 *   file_locations?: { drive?: string, r2?: string, github_artifact?: string },
 *   gpg_encrypted?: boolean,
 *   gpg_fingerprint?: string,
 *   error_message?: string,
 *   metadata?: object,
 *   pre_registered_run_id?: string  // si fue pre-registrado por /api/admin/backup/trigger
 * }
 *
 * Response 200: { ok: true, run_id }
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

const VALID_TRIGGER_TYPES = new Set([
  'cron',
  'manual',
  'pre_migration',
  'fire_drill',
  'github_actions',
  'hetzner_cron',
])
const VALID_BACKUP_TYPES = new Set(['pg_dump', 'n8n_volume', 'full_combined'])
const VALID_STATUSES = new Set(['success', 'failed'])
const VALID_CATEGORIES = new Set([
  'daily',
  'weekly',
  'monthly',
  'manual',
  'pre_migration',
  'fire_drill',
])

interface BackupRecordBody {
  trigger_type?: string
  backup_type?: string
  status?: string
  category?: string
  triggered_by?: string
  file_size_bytes?: number
  file_sha256?: string
  file_locations?: Record<string, unknown>
  gpg_encrypted?: boolean
  gpg_fingerprint?: string
  error_message?: string
  metadata?: Record<string, unknown>
  pre_registered_run_id?: string
}

export async function POST(request: NextRequest) {
  if (!authBearer(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: BackupRecordBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Validación básica
  if (!body.trigger_type || !VALID_TRIGGER_TYPES.has(body.trigger_type)) {
    return NextResponse.json(
      { error: `trigger_type inválido. Permitidos: ${[...VALID_TRIGGER_TYPES].join(', ')}` },
      { status: 400 },
    )
  }
  if (!body.backup_type || !VALID_BACKUP_TYPES.has(body.backup_type)) {
    return NextResponse.json(
      { error: `backup_type inválido. Permitidos: ${[...VALID_BACKUP_TYPES].join(', ')}` },
      { status: 400 },
    )
  }
  if (!body.status || !VALID_STATUSES.has(body.status)) {
    return NextResponse.json(
      { error: `status inválido. Permitidos: ${[...VALID_STATUSES].join(', ')}` },
      { status: 400 },
    )
  }
  if (body.category && !VALID_CATEGORIES.has(body.category)) {
    return NextResponse.json(
      { error: `category inválida. Permitidas: ${[...VALID_CATEGORIES].join(', ')}` },
      { status: 400 },
    )
  }

  const supabase = createAdminSupabaseClient()

  try {
    // Si vino pre_registered_run_id (caso manual desde /api/admin/backup/trigger),
    // actualizamos el row existente. Si no, insertamos uno nuevo.
    if (body.pre_registered_run_id) {
      const { error: updErr } = await supabase
        .from('backup_runs')
        .update({
          status: body.status,
          completed_at: new Date().toISOString(),
          file_size_bytes: body.file_size_bytes ?? null,
          file_sha256: body.file_sha256 ?? null,
          file_locations: body.file_locations ?? {},
          gpg_encrypted: body.gpg_encrypted ?? false,
          gpg_recipient: body.gpg_encrypted ? 'backups@cathedralgroup.es' : null,
          gpg_fingerprint: body.gpg_fingerprint ?? null,
          error_message: body.error_message ?? null,
          metadata: { ...(body.metadata ?? {}), recorded_at: new Date().toISOString() },
        })
        .eq('id', body.pre_registered_run_id)
      if (updErr) throw new Error(`update backup_runs: ${updErr.message}`)

      // Si falló, también levantar notificación crítica
      if (body.status === 'failed') {
        await supabase.rpc('upsert_system_notification', {
          p_severity: 'critical',
          p_title: `Backup ${body.backup_type} FALLÓ`,
          p_message:
            `Backup ${body.backup_type} (${body.trigger_type}) ha fallado. ` +
            `Error: ${body.error_message || 'sin detalle'}. ` +
            `Run ID: ${body.pre_registered_run_id}.`,
          p_source: 'backup_record',
          p_metadata: { run_id: body.pre_registered_run_id, ...(body.metadata ?? {}) },
          p_dedup_key: `backup_failed_${body.backup_type}`,
        })
      }

      return NextResponse.json({ ok: true, run_id: body.pre_registered_run_id, mode: 'updated' })
    }

    // Insert nuevo via RPC record_backup_run (SECURITY DEFINER)
    const { data: runId, error: rpcErr } = await supabase.rpc('record_backup_run', {
      p_trigger_type: body.trigger_type,
      p_backup_type: body.backup_type,
      p_status: body.status,
      p_category: body.category ?? null,
      p_triggered_by: body.triggered_by ?? 'system',
      p_file_size_bytes: body.file_size_bytes ?? null,
      p_file_sha256: body.file_sha256 ?? null,
      p_file_locations: body.file_locations ?? {},
      p_gpg_encrypted: body.gpg_encrypted ?? false,
      p_gpg_fingerprint: body.gpg_fingerprint ?? null,
      p_error_message: body.error_message ?? null,
      p_metadata: { ...(body.metadata ?? {}), recorded_at: new Date().toISOString() },
    })
    if (rpcErr) throw new Error(`record_backup_run: ${rpcErr.message}`)

    // Si falló, levantar notificación crítica
    if (body.status === 'failed') {
      await supabase.rpc('upsert_system_notification', {
        p_severity: 'critical',
        p_title: `Backup ${body.backup_type} FALLÓ`,
        p_message:
          `Backup ${body.backup_type} (${body.trigger_type}) ha fallado. ` +
          `Error: ${body.error_message || 'sin detalle'}.`,
        p_source: 'backup_record',
        p_metadata: { run_id: runId, ...(body.metadata ?? {}) },
        p_dedup_key: `backup_failed_${body.backup_type}`,
      })
    } else if (body.status === 'success') {
      // Si había una notificación previa de fallo para este backup_type, dejamos que
      // expire por sí sola (snooze). Pero podemos resolverla insertando una info de éxito.
      // Por ahora no creamos nada — silence on success.
    }

    return NextResponse.json({ ok: true, run_id: runId, mode: 'inserted' })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}

export const dynamic = 'force-dynamic'
