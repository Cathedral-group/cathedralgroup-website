---
name: cathedral-health-check
description: "Health Monitor Cathedral — auditoría sistémica recurrente: disk Hetzner, n8n workflow active status, exec error rate 1h window, Supabase advisors, Vertex AI Gemini ping, pdf2img healthcheck 172.17.0.1:5001. Output banner admin via system_notifications (NO email externo). Decretado 18/05/2026 — regla SUPREMA feedback_sistema_infalible.md."
allowed-tools: Bash, mcp__supabase__execute_sql, mcp__supabase__get_advisors, WebFetch
---

# Cathedral Health Monitor Skill

Skill cargado automáticamente cuando Claude Agent SDK invoca con `settingSources: ['project']`. Define instrucciones agente Health Monitor (Haiku 4.5, cron Hetzner */15, maxBudgetUsd $0.10, maxTurns 15).

## Objetivos

Auditar 6 health vectors Cathedral cada 15 min. Detectar anomalías SISTÉMICAS antes que escalen a producción rota (incidentes 15-17/05 cluster pattern: UFW pdf2img dropea + Vertex OAuth revoke + ENOSPC silent — todos detectables con health monitor).

## Checks obligatorios

### 1. Disk Hetzner (root@77.42.36.4)
```bash
ssh root@77.42.36.4 "df -h / | tail -1"
```
Alert si `used_pct >= 80%` (warning) o `>= 90%` (critical). Incidente 14/05 ENOSPC fue 100%/7 días silent.

### 2. n8n workflow Definitivo status (OcYrtR9pM6jIa7NK)
```sql
-- Verificar active + exec success rate 1h window
SELECT
  (SELECT active FROM n8n_meta WHERE id='OcYrtR9pM6jIa7NK') AS workflow_active,
  (SELECT COUNT(*) FROM exceptions_log WHERE created_at > NOW() - INTERVAL '1 hour') AS errors_1h,
  (SELECT COUNT(*) FROM invoices WHERE created_at > NOW() - INTERVAL '1 hour') AS invoices_1h;
```
Alert: errors_1h > 5 OR invoices_1h == 0 después de horario activo (8-22 Madrid).

### 3. Provider distribution (target Gemini ≥90%)
```sql
SELECT
  ai_provider, COUNT(*) AS facturas
FROM invoices
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY ai_provider;
```
Alert: si ai_provider='gpt-4o' >10% del total = Vertex OAuth dead probable (Ventanaplus 16/05 pattern).

### 4. Supabase advisors
```typescript
mcp__supabase__get_advisors({ type: 'security' })
```
Alert: any priority=critical (e.g., `gmail_poll_state` RLS disabled pendiente).

### 5. Vertex AI Gemini ping
```bash
# Solo si auth OAuth refresca correctamente
curl -sS -H "Authorization: Bearer ${VERTEX_AI_TOKEN}" \
  "https://aiplatform.googleapis.com/v1/projects/cathedral-ai/locations/global/publishers/google/models/gemini-2.5-pro:generateContent" \
  -d '{"contents":[{"parts":[{"text":"ping"}]}]}'
```
Alert: HTTP != 200 (incluyendo 401/403 OAuth revoke).

### 6. pdf2img Hetzner healthcheck (incident 15/05 UFW dropea container→host)
```bash
curl -sS --max-time 5 "http://172.17.0.1:5001/health" || echo "DOWN"
```
Alert: timeout o response != 200 (UFW rule debe estar `allow in on docker0 from 172.17.0.0/16 to 172.17.0.1 port 5001`).

## Output pattern banner admin

INSERT en `system_notifications` table (dedup_key compuesto evita spam):

```sql
INSERT INTO system_notifications (source, severity, message, dedup_key, created_at)
VALUES (
  'health_monitor',
  '${critical|warning|info}',
  '${diagnosis + propose_fix}',
  '${check_name}_${date_hour}', -- dedup 1/hora por check
  NOW()
)
ON CONFLICT (source, dedup_key) DO NOTHING;
```

## Reglas SUPREMAS aplicables

- **feedback_sistema_infalible.md**: agente PROPONE diagnosis + fix, NUNCA auto-aplica
- **feedback_seguridad_primero.md**: ningún check filtra secrets/passwords en output banner
- **feedback_n8n_no_put_api.md**: NUNCA usar PUT contra n8n API (hook PreToolUse bloquea)
- **feedback_n8n_draft_active.md**: si propone fix workflow → 4 pasos canónicos `infra/n8n/scripts/n8n-deploy.sh`
- **feedback_actualizaciones_supervisadas.md**: David revisa banner admin + decide apply

## Tools restricted

`allowed-tools: Bash, mcp__supabase__execute_sql, mcp__supabase__get_advisors, WebFetch`

NO permitidos: Edit, Write (agente solo PROPONE, no modifica).

## Budget cap

- `maxBudgetUsd: 0.10` per invocation (cron cada 15 min = ~$0.32/día max = ~$9.6/mes ceiling)
- `maxTurns: 15` (early stop si loop)

## Telemetry

Cada invocation → insert `agent_diagnoses` table (status='pending', applied=false) con tokens_used, cost_usd, model_version='claude-haiku-4-5'.

Sesión 18/05/2026 — P0.3 specs + S1.4 skill.
