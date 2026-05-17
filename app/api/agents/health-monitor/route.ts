/**
 * Cathedral Health Monitor Agent — HMAC-authenticated endpoint
 *
 * Invocado por cron Hetzner cada 15min (regla SUPREMA feedback_vercel_hobby_limits.md:
 * Vercel Hobby permite 1 cron/día — Cathedral usa cron Hetzner cada 15 min vía curl HMAC).
 *
 * Flujo:
 *   cron Hetzner -> health-monitor-cron.sh -> POST /api/agents/health-monitor
 *   -> verify HMAC -> Claude Agent SDK query (Haiku 4.5)
 *   -> agent invoca tools (Bash curl + mcp__supabase + WebFetch)
 *   -> diagnoses -> INSERT agent_diagnoses + system_notifications (banner admin)
 *
 * Auth: HMAC-SHA256(secret, timestamp + "." + rawBody) + anti-replay 20min window.
 *
 * Sesión 18/05/2026 — S1.9 wire Claude Agent SDK.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual, createHash } from 'crypto';
import { query, type SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 300; // Vercel Hobby max

const HMAC_SECRET = process.env.HEALTH_MONITOR_HMAC_SECRET;
const REPLAY_WINDOW_SEC = 1200; // 20 min
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function verifyHmac(req: NextRequest, rawBody: string): { valid: boolean; reason?: string } {
  if (!HMAC_SECRET) return { valid: false, reason: 'HMAC_SECRET not configured' };

  const signature = req.headers.get('x-hmac-signature');
  const timestamp = req.headers.get('x-hmac-timestamp');
  if (!signature || !timestamp) return { valid: false, reason: 'missing signature or timestamp header' };

  const ts = parseInt(timestamp, 10);
  if (isNaN(ts)) return { valid: false, reason: 'invalid timestamp' };
  const drift = Math.abs(Date.now() / 1000 - ts);
  if (drift > REPLAY_WINDOW_SEC) {
    return { valid: false, reason: `timestamp drift ${Math.round(drift)}s exceeds window ${REPLAY_WINDOW_SEC}s` };
  }

  const payload = `${timestamp}.${rawBody}`;
  const expected = createHmac('sha256', HMAC_SECRET).update(payload).digest('hex');
  try {
    const sigBuf = Buffer.from(signature, 'hex');
    const expBuf = Buffer.from(expected, 'hex');
    if (sigBuf.length !== expBuf.length) return { valid: false, reason: 'signature length mismatch' };
    if (!timingSafeEqual(sigBuf, expBuf)) return { valid: false, reason: 'signature mismatch' };
    return { valid: true };
  } catch {
    return { valid: false, reason: 'signature decode failed' };
  }
}

const HEALTH_CHECK_PROMPT = `Eres Cathedral Health Monitor Agent. Audita 6 health vectors sistémicos del sistema Cathedral cada 15 min y reporta anomalías en formato JSON estructurado.

Checks a realizar:
1. **Disk Hetzner** vía consulta SQL Supabase \`SELECT * FROM disk_heartbeats ORDER BY reported_at DESC LIMIT 1\`. Alert si used_pct >= 80%.
2. **n8n exec error rate 1h** vía SQL \`SELECT count(*) FROM exceptions_log WHERE created_at > NOW() - INTERVAL '1 hour'\`. Alert si > 5.
3. **Provider distribution 24h** vía SQL \`SELECT ai_provider, count(*) FROM invoices WHERE created_at > NOW() - INTERVAL '24 hours' GROUP BY ai_provider\`. Alert si ai_provider='gpt-4o' > 10% del total.
4. **Supabase advisors security** vía MCP tool \`mcp__supabase__get_advisors\`. Alert si priority=critical.
5. **pdf2img Hetzner healthcheck** vía Bash \`curl -sS --max-time 5 http://172.17.0.1:5001/health || echo DOWN\`. Alert si != 200 o timeout. (NOTA: si Bash no permite acceso interno, usar WebFetch a https://n8n.cathedralgroup.es como proxy alternativa health).
6. **Workflow Definitivo active status** vía SQL \`SELECT active FROM n8n_meta WHERE id='OcYrtR9pM6jIa7NK'\` (si tabla expuesta) o vía info contexto.

Reglas SUPREMAS:
- NUNCA auto-apply fix. Solo PROPONER diagnosis + propose_fix.
- NUNCA usar SSH (Vercel sandbox no soporta).
- Output FINAL: JSON con shape:
\`\`\`json
{
  "diagnoses": [
    {"check": "disk|n8n_errors|provider_dist|advisors|pdf2img|workflow_active", "status": "ok|warning|critical", "diagnosis": "...", "proposed_fix": "...", "confidence": 0.0-1.0}
  ],
  "summary": "string",
  "overall_severity": "info|warning|critical"
}
\`\`\`

Sé conciso. Max 3 turns para completar todos checks.`;

interface HealthMonitorRequest {
  source: string;
  hostname?: string;
  timestamp?: number;
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const hmac = verifyHmac(req, rawBody);
  if (!hmac.valid) {
    console.warn('[health-monitor] HMAC fail:', hmac.reason);
    return NextResponse.json({ error: 'unauthorized', detail: hmac.reason }, { status: 401 });
  }

  let body: HealthMonitorRequest;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'invalid json body' }, { status: 400 });
  }

  const startTime = Date.now();
  let finalResult: SDKResultMessage | null = null;
  let errorMessage: string | null = null;

  // AbortController timeout 250s (Vercel hard 300s)
  const abortController = new AbortController();
  const abortTimer = setTimeout(() => abortController.abort(), 250_000);

  try {
    const agentQuery = query({
      prompt: HEALTH_CHECK_PROMPT,
      options: {
        model: 'claude-haiku-4-5',
        maxBudgetUsd: 0.10,
        maxTurns: 15,
        cwd: process.cwd(),
        skills: ['cathedral-health-check'],
        settingSources: ['project'],
        systemPrompt: {
          type: 'preset',
          preset: 'claude_code',
          append: 'Cathedral Health Monitor — read-only diagnose mode. Never modify production. Output JSON structured diagnoses only.',
        },
        mcpServers: {
          supabase: {
            type: 'sse',
            url: `https://mcp.supabase.com/sse?project_ref=cpqsnajuypgjjapvbqsr&read_only=true`,
            headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
          },
        },
        allowedTools: ['Bash', 'WebFetch', 'mcp__supabase__execute_sql', 'mcp__supabase__get_advisors'],
        permissionMode: 'bypassPermissions',
        hooks: {
          PreToolUse: [{
            matcher: 'Bash',
            hooks: [
              async (input: unknown) => {
                const cmd = (input as { tool_input?: { command?: string } })?.tool_input?.command ?? '';
                if (/\b(ssh|scp|rsync)\b/i.test(cmd)) {
                  return {
                    hookSpecificOutput: {
                      hookEventName: 'PreToolUse',
                      permissionDecision: 'deny',
                      permissionDecisionReason: 'SSH/SCP forbidden from Vercel sandbox',
                    },
                  };
                }
                if (/curl[^|]*-X\s+(PUT|DELETE|POST).*n8n.cathedralgroup\.es/i.test(cmd)) {
                  return {
                    hookSpecificOutput: {
                      hookEventName: 'PreToolUse',
                      permissionDecision: 'deny',
                      permissionDecisionReason: 'Modificación n8n prohibida (Health Monitor read-only)',
                    },
                  };
                }
                return {};
              },
            ],
          }],
        },
      },
    });

    for await (const message of agentQuery) {
      if (abortController.signal.aborted) break;
      if (message.type === 'result') {
        finalResult = message as SDKResultMessage;
      }
    }
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : String(e);
    console.error('[health-monitor] agent query error:', errorMessage);
  } finally {
    clearTimeout(abortTimer);
  }

  const durationMs = Date.now() - startTime;

  // Persist agent_diagnoses + audit_log_chain + system_notifications
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const diagnosisText = (finalResult as { result?: string } | null)?.result ?? errorMessage ?? 'no result';
  const tokensUsed = (finalResult?.usage?.input_tokens ?? 0) + (finalResult?.usage?.output_tokens ?? 0);
  const costUsd = finalResult?.total_cost_usd ?? 0;

  const { error: insertErr } = await supabase.from('agent_diagnoses').insert({
    agent_name: 'health_monitor',
    trigger_source: 'cron',
    trigger_context: { source: body.source, hostname: body.hostname, duration_ms: durationMs },
    diagnosis: diagnosisText.slice(0, 8000),
    status: 'pending',
    tokens_used: tokensUsed,
    cost_usd: costUsd,
    model_version: 'claude-haiku-4-5',
    is_test: false,
  });
  if (insertErr) console.error('[health-monitor] insert agent_diagnoses error:', insertErr);

  // Parse JSON diagnoses from result for banner notifications
  let parsedDiagnoses: { check: string; status: string; diagnosis: string }[] = [];
  try {
    const match = diagnosisText.match(/\{[\s\S]*"diagnoses"[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      parsedDiagnoses = parsed.diagnoses || [];
    }
  } catch {
    // Couldn't parse — skip banner insertion
  }

  // Insert system_notifications for warnings/criticals (dedup by source+dedup_key)
  for (const d of parsedDiagnoses) {
    if (d.status === 'ok') continue;
    const dedupKey = `${d.check}_${new Date().toISOString().slice(0, 13)}`; // hourly dedup
    await supabase
      .from('system_notifications')
      .upsert(
        {
          source: 'health_monitor',
          severity: d.status === 'critical' ? 'critical' : 'warning',
          message: `[${d.check}] ${d.diagnosis}`.slice(0, 1000),
          dedup_key: dedupKey,
        },
        { onConflict: 'source,dedup_key' }
      );
  }

  return NextResponse.json({
    ok: true,
    source: body.source,
    duration_ms: durationMs,
    tokens_used: tokensUsed,
    cost_usd: costUsd,
    diagnoses_count: parsedDiagnoses.length,
    error: errorMessage,
  });
}

// GET healthcheck
export async function GET() {
  return NextResponse.json({
    endpoint: 'health-monitor',
    status: 'ready',
    version: 'S1.9-2026-05-18',
    hmac_configured: Boolean(HMAC_SECRET),
    sdk_version: '@anthropic-ai/claude-agent-sdk@0.3.143',
    model: 'claude-haiku-4-5',
    max_budget_usd: 0.10,
    max_turns: 15,
    replay_window_sec: REPLAY_WINDOW_SEC,
    max_duration_sec: 300,
  });
}
