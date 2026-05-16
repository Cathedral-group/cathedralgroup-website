# ADR-0001: Arquitectura procesamiento facturas recibidas

## Estado

Aceptada — 2026-05-16

## Contexto

Cathedral procesa facturas recibidas (50-200/mes ahora, ~500/mes en 6 meses) mediante workflow n8n `FwpGF7L2GbFB84kL` de 80 nodos que contiene toda la lógica de negocio: cascade LLM (Gemini → GPT → Mistral), validador algorítmico NIF/CIF/IBAN, dedup SHA-256, fuzzy matching de proveedores, decisión de tabla destino, INSERT a Supabase, upload a Drive.

Esta arquitectura sufre bugs recurrentes documentados por la comunidad n8n y reproducidos empíricamente:

- `pairedItem` multi-input (GitHub n8n-io/n8n#15981, abierto mayo 2026)
- Runner crash con `.itemMatching($itemIndex)` por `Error.name` read-only (#24465)
- Polls no rearrancan tras PUT API (#14322, #27867)
- Modelo draft / `activeVersion` separados en n8n 2.20+ que requieren `POST /activate` tras cada PATCH

La comunidad seria n8n (Till Freitag, Hatchworks, Codastra "Typed Workflows Are the New Microservices") y casos comparables de solo-devs (Daniel Setzermann, vas3k TaxHacker, Construction firm 400-500 fact/mes via Syntora) convergen en un patrón: **n8n como thin orchestrator + lógica de negocio en código TypeScript con tipos y tests**.

Restricciones Cathedral: 1 desarrollador (David), presupuesto infra extra <€50/mes, sin equipo SRE, regulación AEAT/Verifactu/RGPD aplicable.

## Decisión

Migramos la lógica de negocio (cascade LLM, validador, dedup, fuzzy, decisión, INSERT, audit log) desde el workflow n8n a un endpoint Next.js TypeScript en el repo `cathedralgroup-website`. n8n queda reducido a **thin orchestrator**: 7 Gmail Triggers polling, Drive upload, webhook reprocesador, Schedule triggers para crons sencillos. Objetivo: workflow general baja de 80 nodos a 25-30 nodos máximo.

A medio plazo (6-12 meses, evaluación trimestral), si la disciplina anti-drift sobre n8n thin no se sostiene o aparecen bugs operacionales recurrentes, se elimina n8n por completo migrando ingestión a Gmail Pub/Sub + webhook nativo y Drive OAuth desde código.

## Alternativas consideradas

- **Mantener workflow n8n actual de 80 nodos** — Descartada porque está documentado como anti-patrón (>25 nodos + lógica negocio interna), produce bugs cada semana, no es testable automáticamente, y la draft/active confusion ya ha provocado 47 minutos perdidos en una sesión.
- **Eliminar n8n radicalmente desde día 1** — Descartada porque reescribir Gmail OAuth (7 cuentas) + Drive OAuth en código desde cero supone 2 semanas extra de trabajo sin valor diferencial inmediato. Se difiere a 6-12 meses cuando el endpoint Next.js esté estable.
- **Migrar a runner durable (Inngest, Trigger.dev, Vercel Workflows, Cloudflare Workflows)** — Descartada como decisión actual porque a 500 fact/mes el regret cost es trivial (~$7-15/mes en LLM por reintentos full-cascade) y todas estas plataformas añaden lock-in nuevo. Se difiere a 2027 con criterio de reversión basado en datos reales.
- **Outsource a SaaS comercial (Klippa, Mindee, Holded)** — Descartada porque Cathedral tiene lógica única (multi-SL, intragroup_transactions, project_labor_costs, decisión de tabla por tipo doc) que ningún SaaS estándar cubre. Klippa se reserva como fallback OCR posible si Gemini → GPT → Mistral fallan tres veces.

## Consecuencias

### Positivas

- Workflow visible visualmente se reduce de 80 a 25-30 nodos — dentro del umbral aceptado por la comunidad
- Lógica de negocio testeable con Vitest unitario + golden dataset de 50 facturas
- Bugs n8n (pairedItem, itemMatching crash) dejan de afectar la lógica crítica
- Cambios en el código se hacen vía git con PR review (aunque sea de uno mismo), no vía PATCH a workflow vivo
- Type safety en TypeScript previene clases enteras de errores
- Claude Code (asistente IA principal de David) debuggea TypeScript mucho mejor que JSON de workflow

### Negativas

- Coexistencia temporal de dos sistemas (n8n thin + endpoint Next.js) hasta que la migración sea total
- n8n thin tiende a engordar de nuevo si no hay disciplina escrita (mitigado por la regla del criterio de revertir)
- Refactor inicial estimado 2-4 semanas de trabajo intermitente de David
- Riesgo de regresión durante la migración mitigado por shadow mode + feature flag

## Criterio para revertir

Se reconsidera (probable migración a Cloudflare Workflows V2 o Vercel Workflows) si se cumple cualquiera de estas condiciones:

- Workflow n8n thin supera 40 nodos en revisión trimestral
- Se producen más de 2 incidentes operacionales de n8n por trimestre
- El endpoint Next.js Hobby alcanza el límite de 300 s en más del 5 % de invocaciones
- El volumen supera 2.000 facturas/mes sostenido durante 3 meses

## Referencias

- [GitHub n8n-io/n8n#15981 — pairedItem multi-input regression](https://github.com/n8n-io/n8n/issues/15981)
- [GitHub n8n-io/n8n#24465 — itemMatching Error.name read-only](https://github.com/n8n-io/n8n/issues/24465)
- [Till Freitag — n8n best practices for production](https://till-freitag.com/en/blog/n8n-best-practices-guide-en)
- [Codastra — Typed Workflows Are the New Microservices](https://medium.com/@2nick2patel2/typed-workflows-are-the-new-microservices-n8n-typescript-for-automations-you-can-refactor-safely-1323877b272e)
- [Daniel Setzermann — Why I moved from n8n to Trigger.dev](https://www.danielsetzermann.com/why-i-moved-from-n8n-to-trigger-dev-and-why-you-might-too/)
- [vas3k TaxHacker — Solo-dev invoice processing reference](https://github.com/vas3k/TaxHacker)
- Memoria Cathedral: `feedback_n8n_draft_active.md`, `feedback_n8n_no_put_api.md`, `pendiente_investigacion_arquitectura_post_n8n.md`
