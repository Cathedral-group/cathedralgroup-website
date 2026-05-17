/**
 * Cathedral Health Monitor Agent — HMAC-authenticated endpoint
 *
 * Invocado por cron Hetzner cada 15min (regla SUPREMA feedback_vercel_hobby_limits.md:
 * Vercel Hobby permite 1 cron/día — Cathedral usa cron Hetzner cada 15 min vía curl HMAC).
 *
 * Flujo:
 *   cron Hetzner -> health-monitor-cron.sh -> POST /api/agents/health-monitor
 *   -> verify HMAC -> trigger Claude Agent SDK Health Monitor (S1.9)
 *   -> agent diagnoses -> INSERT system_notifications (banner admin)
 *
 * Auth: HMAC-SHA256(secret, timestamp + "." + rawBody) + anti-replay 20min window.
 *
 * Sesión 18/05/2026 — P0.3 specs. SDK integration en S1.9.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';

export const runtime = 'nodejs';
export const maxDuration = 300; // Vercel Hobby: 300s max (doc-validator fix)

const HMAC_SECRET = process.env.HEALTH_MONITOR_HMAC_SECRET;
const REPLAY_WINDOW_SEC = 1200; // 20 min — cubre cron */15 + margen (doc-validator fix)

/**
 * Verify HMAC-SHA256 signature + anti-replay timestamp window.
 *
 * Fix doc-validator: usar Buffer.from(hex, 'hex') para comparar bytes binarios
 * (32 bytes SHA-256) en vez de strings hex. timingSafeEqual requiere buffers
 * de igual longitud, garantizado al derivar ambos del mismo algoritmo HMAC.
 */
function verifyHmac(req: NextRequest, rawBody: string): { valid: boolean; reason?: string } {
  if (!HMAC_SECRET) {
    return { valid: false, reason: 'HMAC_SECRET not configured' };
  }

  const signature = req.headers.get('x-hmac-signature');
  const timestamp = req.headers.get('x-hmac-timestamp');

  if (!signature || !timestamp) {
    return { valid: false, reason: 'missing signature or timestamp header' };
  }

  // Anti-replay: timestamp dentro de ventana (default 20min)
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts)) return { valid: false, reason: 'invalid timestamp' };
  const drift = Math.abs(Date.now() / 1000 - ts);
  if (drift > REPLAY_WINDOW_SEC) {
    return { valid: false, reason: `timestamp drift ${Math.round(drift)}s exceeds window ${REPLAY_WINDOW_SEC}s` };
  }

  // Reconstruct expected signature: HMAC-SHA256(secret, timestamp + "." + body)
  const payload = `${timestamp}.${rawBody}`;
  const expected = createHmac('sha256', HMAC_SECRET).update(payload).digest('hex');

  // Compare buffers binarios (32 bytes SHA-256)
  try {
    const sigBuf = Buffer.from(signature, 'hex');
    const expBuf = Buffer.from(expected, 'hex');
    if (sigBuf.length !== expBuf.length) {
      return { valid: false, reason: 'signature length mismatch' };
    }
    if (!timingSafeEqual(sigBuf, expBuf)) {
      return { valid: false, reason: 'signature mismatch' };
    }
    return { valid: true };
  } catch (e) {
    return { valid: false, reason: 'signature decode failed' };
  }
}

interface HealthMonitorRequest {
  source: string;
  checks?: Record<string, unknown>;
  timestamp?: number;
}

export async function POST(req: NextRequest) {
  // rawBody primero — necesario para HMAC verify antes parse
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

  if (!body.source) {
    return NextResponse.json({ error: 'missing source field' }, { status: 400 });
  }

  // ====================================
  // SPECS — invoke Claude Agent SDK Health Monitor (implementación S1.9)
  // ====================================
  // TODO S1.9: import @anthropic-ai/claude-agent-sdk
  // TODO S1.9: query({ model: 'claude-haiku-4-5', maxBudgetUsd: 0.10, maxTurns: 15,
  //                   systemPrompt preset claude_code + Cathedral context,
  //                   allowedTools: [Bash, supabase MCP, n8n MCP, WebFetch],
  //                   hooks PreToolUse: bloquea PUT n8n })
  // TODO S1.9: invocar checks (disk Hetzner, n8n workflow status, exec rate,
  //                            Supabase advisors, Vertex AI ping, pdf2img healthcheck)
  // TODO S1.9: parse output → insert system_notifications con dedup_key

  return NextResponse.json({
    ok: true,
    source: body.source,
    received_at: new Date().toISOString(),
    note: 'P0.3 specs accepted. SDK integration pending S1.9.',
  });
}

// GET para healthcheck endpoint mismo (smoke test)
export async function GET() {
  return NextResponse.json({
    endpoint: 'health-monitor',
    status: 'specs-only',
    version: 'P0.3-2026-05-18',
    hmac_configured: Boolean(HMAC_SECRET),
    replay_window_sec: REPLAY_WINDOW_SEC,
    max_duration_sec: 300,
  });
}
