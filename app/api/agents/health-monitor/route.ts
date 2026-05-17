/**
 * Cathedral Health Monitor — DEPRECATED 2026-05-17
 *
 * Runtime pivot a Hetzner local cron 7,22,37,52 (Node 20 LTS + Claude Agent SDK).
 * Vercel Functions Lambda no soporta child_process spawn del Claude SDK native binary.
 *
 * Este endpoint queda como stub 410 Gone con HMAC defense-in-depth.
 * Real runtime: `/opt/cathedral/agents/scripts/health-monitor-agent.mjs` en Hetzner.
 *
 * Ver memoria: cathedral-credentials.md "Health Monitor Agent S1.9 (operativo 17/05/2026)".
 */

import { createHmac, timingSafeEqual } from 'crypto';

const HMAC_SECRET = process.env.HEALTH_MONITOR_HMAC_SECRET ?? '';
const REPLAY_WINDOW_SEC = 1200;

function verifyHmac(req: Request, rawBody: string): boolean {
  if (!HMAC_SECRET) return false;
  const signature = req.headers.get('x-hmac-signature');
  const timestamp = req.headers.get('x-hmac-timestamp');
  if (!signature || !timestamp) return false;
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts)) return false;
  if (Math.abs(Date.now() / 1000 - ts) > REPLAY_WINDOW_SEC) return false;
  const expected = createHmac('sha256', HMAC_SECRET).update(`${timestamp}.${rawBody}`).digest('hex');
  try {
    const sigBuf = Buffer.from(signature, 'hex');
    const expBuf = Buffer.from(expected, 'hex');
    if (sigBuf.length !== expBuf.length) return false;
    return timingSafeEqual(sigBuf, expBuf);
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  if (!verifyHmac(req, rawBody)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  return Response.json(
    {
      deprecated: true,
      message: 'Endpoint moved to Hetzner cron 7,22,37,52. Runtime: Node 20 LTS + Claude Agent SDK.',
      since: '2026-05-17',
      reason: 'Vercel Lambda no soporta child_process spawn del Claude SDK native binary',
    },
    { status: 410 },
  );
}

export async function GET() {
  return Response.json({
    status: 'deprecated',
    runtime: 'hetzner-cron',
    schedule: '7,22,37,52 * * * *',
    moved_at: '2026-05-17',
    real_script: '/opt/cathedral/agents/scripts/health-monitor-agent.mjs',
  });
}
