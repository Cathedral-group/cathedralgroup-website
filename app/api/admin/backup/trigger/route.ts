/**
 * POST /api/admin/backup/trigger
 *
 * Sprint A Backup Robusto — snapshot on-demand.
 *
 * Dispara un backup pg_dump fuera del cron diario, útil ANTES de aplicar
 * cualquier migración destructiva (Bloque 0 multi-empresa, etc.) o cuando
 * el admin quiera un "punto exacto" del estado actual.
 *
 * Mecanismo: invoca el GitHub Actions workflow `backup-db.yml` vía
 * workflow_dispatch API. El workflow ya hace pg_dump + GPG encrypt + sube
 * a Drive (futuro: + R2). Cuando termina, GitHub Actions registra el
 * resultado en `backup_runs` vía POST /api/cron/backup-record.
 *
 * Auth: admin allow-list + AAL2.
 *
 * Body: { reason?: string, category?: 'manual' | 'pre_migration' }
 *
 * Response 200: { ok: true, github_run_url, started_at, run_id }
 *
 * Por qué llama a GitHub Actions y no hace pg_dump aquí:
 *   - Vercel functions tienen timeout 10s (Hobby) / 60s (Pro). pg_dump puede
 *     tardar minutos cuando la BD crezca.
 *   - GitHub Actions ya tiene postgresql-client-17, runners potentes,
 *     retención de artifacts 90 días gratis, y el workflow ya está validado.
 *   - Centralizamos la lógica de backup en UN sitio (backup-db.yml) — no
 *     duplicamos en endpoint Next.js.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/auth-allowlist'

const GITHUB_OWNER = 'Cathedral-group'
const GITHUB_REPO = 'cathedralgroup-website'
const GITHUB_WORKFLOW_FILE = 'backup-db.yml'

async function authCheck() {
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user) return null
  if (!isAdminEmail(data.user.email)) return null
  const { data: aal, error: aalError } = await authClient.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aalError || !aal || aal.currentLevel !== 'aal2') return null
  return data.user
}

export async function POST(request: NextRequest) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { reason?: string; category?: string } = {}
  try {
    body = await request.json()
  } catch {
    // body opcional
  }

  const reason = body.reason || `Manual snapshot from /admin/sistema by ${user.email}`
  const category = body.category === 'pre_migration' ? 'pre_migration' : 'manual'

  const githubToken = process.env.GITHUB_BACKUP_DISPATCH_TOKEN
  if (!githubToken) {
    return NextResponse.json(
      {
        ok: false,
        error: 'GITHUB_BACKUP_DISPATCH_TOKEN no configurado en Vercel env vars. ' +
               'Crear PAT con scope "repo" en GitHub y añadir a Vercel.',
      },
      { status: 500 },
    )
  }

  const start = Date.now()

  try {
    // 1. Pre-registrar el run en backup_runs como 'pending'
    const supabase = createAdminSupabaseClient()
    const triggerType = category === 'pre_migration' ? 'pre_migration' : 'manual'

    const { data: runId, error: insErr } = await supabase.rpc('record_backup_run', {
      p_trigger_type: triggerType,
      p_backup_type: 'pg_dump',
      p_status: 'pending',
      p_category: category,
      p_triggered_by: user.email,
      p_metadata: { reason, source: 'admin_panel', started_at_unix: Date.now() },
    })
    if (insErr) {
      throw new Error(`No se pudo pre-registrar backup_run: ${insErr.message}`)
    }

    // 2. Invocar workflow_dispatch en GitHub Actions
    const ghResponse = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW_FILE}/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ref: 'main',
          inputs: {
            reason: `${reason} | run_id=${runId}`,
          },
        }),
      },
    )

    if (!ghResponse.ok) {
      const errBody = await ghResponse.text()
      // Marcar como failed
      await supabase
        .from('backup_runs')
        .update({
          status: 'failed',
          error_message: `GitHub Actions dispatch failed: HTTP ${ghResponse.status}`,
          error_details: { gh_response: errBody.slice(0, 1000) },
        })
        .eq('id', runId)

      throw new Error(`GitHub Actions dispatch HTTP ${ghResponse.status}: ${errBody.slice(0, 200)}`)
    }

    // GitHub Actions workflow_dispatch es asíncrono — no devuelve run_id directo.
    // El workflow eventualmente llamará /api/cron/backup-record con el run_id que
    // pre-registramos arriba (lo pasamos en `inputs.reason`).
    return NextResponse.json({
      ok: true,
      run_id: runId,
      message: 'Backup workflow disparado en GitHub Actions. Tarda ~2-5 min.',
      check_status_url: `/admin/sistema`,
      github_actions_url: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW_FILE}`,
      duration_ms: Date.now() - start,
      triggered_by: user.email,
      triggered_at: new Date().toISOString(),
    })
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        duration_ms: Date.now() - start,
      },
      { status: 500 },
    )
  }
}

export const dynamic = 'force-dynamic'
