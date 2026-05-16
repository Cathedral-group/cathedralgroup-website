# ADR-0002: Hosting endpoint cascade LLM

## Estado

Aceptada — 2026-05-16

## Contexto

ADR-0001 establece que la lógica de procesamiento de facturas (cascade Gemini → GPT-4o/5.5 → Mistral, validador, dedup, fuzzy, decisión, INSERT) se aloja en un endpoint Next.js TypeScript. Falta decidir dónde se ejecuta ese endpoint y con qué configuración.

Cathedral ya tiene la web admin desplegada en Vercel Hobby tier, conectada al repo `cathedralgroup-website` con deploy automático desde GitHub. Vercel Hobby con Fluid Compute (activado por defecto desde abril 2025) ofrece 300 s de timeout, suficiente para una cascade Gemini → GPT → Mistral con archivos PDF de tamaño típico Cathedral.

Volumen real: 50-200 facturas/mes ahora, ~500/mes en 6 meses. Coste LLM aproximado $30/mes en API providers. Tres socios usan el panel admin con plan Vercel Hobby actual sin problemas.

Alternativas conocidas tras auditoría con múltiples agentes (mayo 2026):

- Vercel Pro: $20/mes por seat, multiplicado por 3 socios resultaría en $60/mes, sin valor añadido proporcional para Cathedral
- Inngest free tier: 50.000 ejecuciones/mes (cubre Cathedral ×100), `step.run()` memoización, dashboard de observabilidad. Lock-in moderado por SDK propietario
- Cloudflare Workflows V2 (GA mayo 2026): $5/mes total con Workers Paid + Workflows + R2 + AI Gateway integrados. Lock-in Cloudflare moderado. Requiere reimplementar Gmail OAuth si se sustituye n8n
- Vercel Workflows (GA abril 2026): mismo proveedor que admin, AI SDK integrado. Reciente, lock-in Vercel
- Trigger.dev v4: similar a Inngest, self-host complejo

## Decisión

Alojamos el endpoint `/api/llm/process-document` en **Vercel Hobby** con configuración Next.js 15 App Router:

```typescript
export const maxDuration = 300;   // segundos, máximo con Fluid Compute
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
```

Aseguramos la región fijada a `fra1` (Frankfurt) en `vercel.json` por requisito GDPR de procesar datos con NIFs en jurisdicción Unión Europea.

No usamos runner durable de pago (Inngest/Trigger.dev/Vercel Workflows/Cloudflare Workflows) en esta fase. El endpoint plano implementa retry con backoff exponencial dentro del propio código (`p-retry` o equivalente) y registra cada paso de la cascade en una tabla `llm_step_log` de Supabase para reconstruir trazabilidad.

Adoptamos en paralelo, como quick win independiente y sin lock-in real, **Cloudflare AI Gateway** delante de los cuatro proveedores LLM (Gemini, OpenAI, Anthropic, Mistral). AI Gateway aporta caching de respuestas por hash de input, observabilidad unificada, rate limit configurable, sin coste en el tier core y reversible apuntando los SDKs al endpoint original.

## Alternativas consideradas

- **Vercel Pro** — Descartada porque a 3 seats cuesta $60/mes sin valor diferencial a 500 fact/mes; Hobby con Fluid Compute ya cubre los 300 s necesarios
- **Inngest free tier desde día 1** — Descartada como decisión inicial. Aporta `step.run()` memoización (ahorra LLM en reintentos parciales) pero a 500 fact/mes el regret cost es trivial (~$7-15/mes en tokens). Se reserva como migración futura si datos reales justifican
- **Cloudflare Workflows V2** — Descartada como decisión inicial. Atractivo por coste ($5/mes incluye todo) pero requiere reimplementar Gmail OAuth desde cero (`googleapis` npm no funciona en Workers), supone 1-2 semanas de trabajo extra sin valor diferencial inmediato. Se reserva como migración futura si Hetzner/n8n duelen
- **Vercel Workflows (GA abril 2026)** — Descartada como decisión inicial por su novedad reciente; lock-in Vercel + tiempo en consolidarse en producción
- **Supabase Edge Functions** — Descartada porque CPU time efectivo limitado a 200ms-2s en plan Pro hace inviable la cascade LLM con timeouts naturales de 30-60 s por proveedor

## Consecuencias

### Positivas

- Cero coste hosting adicional (Hobby ya en uso)
- Stack uniforme: mismo Next.js que la web admin, mismo deploy pipeline
- Sin lock-in adicional con runner durable de pago
- AI Gateway gratuito aporta observability + cache + rate limit a los cuatro proveedores LLM
- Latencia eu-west óptima desde región `fra1`
- Type safety completa en TypeScript

### Negativas

- Si la cascade falla en el step 3 de 5, se reintenta la cascade entera y no solo el step fallido (coste estimado $1-3/mes adicional en tokens)
- Sin dashboard nativo de observabilidad de runs como tendría Inngest/Trigger.dev (mitigado con tabla `llm_step_log` propia + AI Gateway analytics)
- Vercel Hobby tiene 1 día de retención de logs (suficiente para debugging inmediato; alternativa: streaming logs a Supabase si requiere histórico)

## Criterio para revertir

Migramos a Cloudflare Workflows V2 (preferido por coste) o Vercel Workflows (preferido por mismo proveedor) si se cumple cualquiera de:

- El coste mensual de reintentos full-cascade en LLM supera $50/mes durante 3 meses consecutivos
- El volumen mensual supera 1.500 facturas durante 3 meses consecutivos
- El timeout de 300 s se alcanza en más del 5 % de invocaciones
- Aparece necesidad de pausa/resume / wait-for-event humano (aprobaciones, escalado) que requiera state persistente

## Referencias

- [Vercel Functions — Limitations](https://vercel.com/docs/functions/limitations)
- [Vercel Fluid Compute](https://vercel.com/docs/fluid-compute)
- [Cloudflare AI Gateway docs](https://developers.cloudflare.com/ai-gateway/)
- [Cloudflare Workflows V2 — InfoQ](https://www.infoq.com/news/2026/05/cloudflare-workflows-v2-release/)
- [Inngest pricing 2026](https://www.inngest.com/pricing)
- Memoria Cathedral: `pendiente_investigacion_arquitectura_post_n8n.md`
