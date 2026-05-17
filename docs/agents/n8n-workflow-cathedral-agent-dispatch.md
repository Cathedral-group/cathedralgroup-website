# n8n Workflow `Cathedral-Agent-Dispatch` — Design Spec

> **Estado**: spec validated, pendiente construcción manual en n8n UI o vía REST API push.
> Validation chain: research agent 88/100 (Op 2 winner) + n8n-doc-validator (4 cambios críticos) + doc-validator schema BD.

## Objetivo

n8n workflow recibe webhook desde Supabase pg_net trigger → invoca agente IA Haiku 4.5 sobre incident específico → escribe diagnosis BD → David revisa banner admin + decide apply.

Patrón: **event-driven, NO cron**. Solo ejecuta cuando bash detecta breach real (Phase A pasivo INSERT `agent_dispatch_queue`).

## Flujo end-to-end

```
Bash Hetzner detect breach
  → INSERT agent_dispatch_queue (status='pending', dedup_key)
  → BD trigger pg_notify cathedral_agent_dispatch
  → Supabase Database Webhook pg_net.http_post → n8n webhook
  → workflow procesa → INSERT agent_diagnoses + UPDATE queue 'done'
  → Banner admin lee agent_diagnoses status='pending'
  → David click "Apply" o "Discard"
```

## Workflow estructura (8 nodos)

### 1. **Webhook trigger**
- Type: `n8n-nodes-base.webhook`
- Method: POST
- Path: `cathedral-agent-dispatch-<UUID-v4>` (URL secreto)
- Response Mode: `responseNode` (espera respuesta de "Respond to Webhook")
- Auth: None (URL UUID secret + BD claim atomic verifica origen)

### 2. **Code "Validate payload"**
- Type: `n8n-nodes-base.code`
- JavaScript:
```js
const body = $input.first().json.body;
if (!body || !body.dispatch_id) {
  throw new Error('Missing dispatch_id in payload');
}
return [{ json: { dispatch_id: body.dispatch_id } }];
```

### 3. **HTTP Request "Claim dispatch atomic"**
- Type: `n8n-nodes-base.httpRequest`
- Method: PATCH
- URL: `https://cpqsnajuypgjjapvbqsr.supabase.co/rest/v1/agent_dispatch_queue?id=eq.{{ $json.dispatch_id }}&status=eq.pending`
- Credential: `Supabase Service Role - Cathedral` (id=`5xRFcnO4yGdhD4pN`)
- Headers: `Prefer: return=representation`
- Body JSON:
```json
{ "status": "running", "started_at": "{{ new Date().toISOString() }}" }
```
- Output: array de rows updated. Si `length===0` → already claimed/circuit broken.

### 4. **IF "claimed?"**
- Type: `n8n-nodes-base.if`
- Condition: `{{ $json.length > 0 }}`
- True branch → continue node 5
- False branch → Respond 200 `{"skipped": true, "reason": "already_processed"}`

### 5. **HTTP Request "Anthropic Haiku diagnose"**
- Type: `n8n-nodes-base.httpRequest`
- Method: POST
- URL: `https://api.anthropic.com/v1/messages`
- Credential: **`Anthropic API - Cathedral`** (CREATE este credential en n8n primero)
  - Header Auth: `x-api-key: <ANTHROPIC_API_KEY>`, `anthropic-version: 2023-06-01`
- Headers extra: `content-type: application/json`
- Body JSON:
```json
{
  "model": "claude-haiku-4-5",
  "max_tokens": 1024,
  "system": "Eres Cathedral Health Diagnose Agent. Recibirás un incident detectado por monitoring pasivo. Devuelve SOLO JSON estricto: { \"diagnosis\": \"...\", \"proposed_fix\": \"...\", \"confidence\": 0.0-1.0, \"severity\": \"low|medium|critical\" }. NUNCA auto-aplica. David aprueba manual.",
  "messages": [
    { "role": "user", "content": "Incident: {{ JSON.stringify($('Claim dispatch atomic').first().json[0]) }}" }
  ]
}
```
- Response: `{ content: [{ text: "{...JSON...}" }], usage: { input_tokens, output_tokens } }`

### 6. **Code "Parse + cost calc"**
- JavaScript:
```js
const resp = $input.first().json;
const text = resp.content?.[0]?.text || '{}';
let parsed = {};
try { parsed = JSON.parse(text); } catch (e) { parsed = { diagnosis: text, error: 'parse_failed' }; }
const inputTokens = resp.usage?.input_tokens || 0;
const outputTokens = resp.usage?.output_tokens || 0;
const costUsd = (inputTokens / 1e6 * 1.0) + (outputTokens / 1e6 * 5.0);  // Haiku 4.5 pricing
const dispatch = $('Claim dispatch atomic').first().json[0];
return [{
  json: {
    dispatch_id: dispatch.id,
    agent_name: dispatch.agent_name,
    diagnosis: parsed.diagnosis || 'unknown',
    proposed_fix: parsed.proposed_fix || null,
    confidence: parsed.confidence ?? null,
    severity: parsed.severity || dispatch.severity,
    tokens_used: inputTokens + outputTokens,
    cost_usd: costUsd,
  }
}];
```

### 7. **HTTP Request "INSERT diagnosis + UPDATE queue"**
Dos sub-llamadas:

**7a)** POST `https://cpqsnajuypgjjapvbqsr.supabase.co/rest/v1/agent_diagnoses`
Body:
```json
{
  "dispatch_id": {{ $json.dispatch_id }},
  "agent_name": "{{ $json.agent_name }}",
  "trigger_source": "n8n_webhook_op2",
  "trigger_context": {},
  "diagnosis": "{{ $json.diagnosis }}",
  "proposed_fix": "{{ $json.proposed_fix }}",
  "confidence": {{ $json.confidence }},
  "tokens_used": {{ $json.tokens_used }},
  "cost_usd": {{ $json.cost_usd }},
  "model_version": "claude-haiku-4-5",
  "status": "pending"
}
```

**7b)** PATCH `https://cpqsnajuypgjjapvbqsr.supabase.co/rest/v1/agent_dispatch_queue?id=eq.{{ $json.dispatch_id }}`
Body:
```json
{
  "status": "done",
  "completed_at": "{{ new Date().toISOString() }}",
  "cost_usd": {{ $json.cost_usd }},
  "diagnosis": "{{ $json.diagnosis }}",
  "proposed_fix": "{{ $json.proposed_fix }}"
}
```

### 8. **Respond to Webhook**
- Type: `n8n-nodes-base.respondToWebhook`
- Status: 200
- Body: `{ "ok": true, "dispatch_id": {{ $json.dispatch_id }}, "diagnosis_inserted": true }`

## Pre-requisitos antes de construir workflow

1. **Crear n8n Credential** "Anthropic API - Cathedral":
   - Tipo: Header Auth
   - Header Name: `x-api-key`
   - Header Value: `<ANTHROPIC_API_KEY>` (sesión 18/05 setup)
   - (Para `anthropic-version` header: añadir en HTTP Request node "Headers" section)

2. **Verificar credential existente** "Supabase Service Role - Cathedral" (id=`5xRFcnO4yGdhD4pN`) — ya operativo.

3. **Generar webhook path UUID v4**:
   ```bash
   uuidgen | tr 'A-Z' 'a-z'
   # ej: 4e1b458d-64e6-4e90-a2ce-637d2a86e112
   ```
   Path final webhook: `cathedral-agent-dispatch-<uuid>`

4. **Supabase Database Webhook config** (Dashboard manual o pg_net SQL):
   - Source table: `agent_dispatch_queue`
   - Event: INSERT
   - Filter: `NEW.status = 'pending'`
   - HTTP Method: POST
   - URL: `https://n8n.cathedralgroup.es/webhook/cathedral-agent-dispatch-<uuid>`
   - Headers: ninguno (URL UUID es secreto)
   - Timeout: 5000 ms

## Anti-runaway protección

- `agent_dispatch_queue.max_budget_usd` default $0.10 per row (no enforced SDK, monitored via cost_usd)
- BD UNIQUE constraint `(dedup_key, date_trunc('hour', created_at AT TIME ZONE 'UTC'))` evita re-trigger mismo incident
- `attempts` counter + pg_cron replay max 3 → `circuit_broken`
- pg_cron `cathedral-agent-dispatch-replay` */5 con SKIP LOCKED (no doble procesamiento)

## Costo estimado

| Métrica | Valor |
|---|---|
| Infra base | $0/mes (reuse n8n + Supabase + Hetzner) |
| LLM normal Cathedral | 10-50 invocations/mes × Haiku 4.5 ~3K input + 500 output ≈ **$0.30-$1.50/mes** |
| Hard cap mensual (futuro BD trigger) | $30/mes max |

vs. cron LLM 15min DEPRECATED: $248/mes garantizado. **22× reducción**.

## Smoke test plan

1. Manual INSERT row test:
```sql
INSERT INTO public.agent_dispatch_queue (agent_name, event_type, severity, trigger_payload, dedup_key)
VALUES ('health_diagnose', 'test_smoke', 'low', '{"test": true}'::jsonb, 'test_smoke_' || extract(epoch from now())::text);
```
2. Verify: BD trigger pg_notify dispara → Database Webhook → n8n workflow execute
3. Verify n8n executions UI: nuevo run con status=success
4. Verify BD `SELECT * FROM agent_diagnoses WHERE dispatch_id = <NEW_ID>` → row exists con diagnosis JSON
5. Verify `SELECT status, cost_usd FROM agent_dispatch_queue WHERE id = <NEW_ID>` → status='done', cost > 0

## Cleanup test row después smoke

```sql
DELETE FROM public.agent_dispatch_queue WHERE event_type = 'test_smoke';
```

## Próxima sesión dedicada (~2-3h)

1. Create n8n credential "Anthropic API - Cathedral"
2. Build workflow vía n8n UI o REST API push (este JSON spec como source of truth)
3. Activate workflow
4. Configure Supabase Database Webhook
5. Smoke test end-to-end
6. Memoria final cathedral-arquitectura-actual.md
7. Document agent Health Diagnose (primer caso uso real)
