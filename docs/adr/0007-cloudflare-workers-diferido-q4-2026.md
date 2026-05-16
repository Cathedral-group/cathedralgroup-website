# ADR-0007: Migración Cloudflare Workers diferida a Q4 2026 / Q1 2027

## Estado

Aceptada — 2026-05-16

## Contexto

Tras decisión inicial de migrar stack Cathedral end-to-end a Cloudflare (Workers Paid $5/mes + Workflows V2 + R2 + AI Gateway + Hyperdrive), validación con 3 agentes paralelos (doc-validator + 2 research agents) reveló 9 razones objetivas para diferir la migración 3-6 meses.

**Esta ADR supersede parcialmente la decisión informal "vamos con la opción C — Cloudflare Workers" tomada en sesión 16/05/2026 ~14:30 UTC**. La razón es que la decisión inicial se tomó SIN haber ejecutado la validación SUPREMA `feedback_validador_y_mcps.md` previa. Al ejecutarla después, los agentes revelaron información crítica que cambia la conclusión.

### Razones concretas verificadas para diferir

1. **Workflows V2 lleva ~2 semanas GA** (lanzado mayo 2026, hoy 16/05/2026). Sin track record en producción. Cita InfoQ: "Cloudflare Workflows V2 GA release". Fuente: [infoq.com/news/2026/05/cloudflare-workflows-v2-release](https://www.infoq.com/news/2026/05/cloudflare-workflows-v2-release/)

2. **Bug abierto observabilidad falso-positivo**: `cloudflare/workers-sdk#12419` — Workflows reportan `outcome: "exception"` cuando ejecución fue exitosa. Reportador tuvo que desactivar todos los crons para silenciar alertas falsas. Cerrado como "Done" sin comentario público de ingeniero Cloudflare. Implica que la capa de observability de Cathedral sería ruidosa o silente inicialmente. Fuente: [github.com/cloudflare/workers-sdk/issues/12419](https://github.com/cloudflare/workers-sdk/issues/12419)

3. **Bug `vitest-pool-workers` CI no fiable**: `cloudflare/workers-sdk#10600` — tests Workflows pasan localmente pero fallan en GitHub Actions. Esto bloquea la regla SUPREMA Cathedral de "tests automáticos antes merge". Fuente: [github.com/cloudflare/workers-sdk/issues/10600](https://github.com/cloudflare/workers-sdk/issues/10600)

4. **`googleapis` npm NO funciona en Workers**: la dependencia transitiva `jws` usa APIs Node no compatibles con Workers, incluso con `nodejs_compat`. Cathedral usa Gmail OAuth para 7 cuentas (polling cada 5 min). Migrar requiere reescribir OAuth manual con WebCrypto + JWT RS256 + library `jose` (~150 líneas) o migrar a Gmail Pub/Sub watch (otro patrón completo). Estimación adicional: 6-10 horas solo Gmail auth. Fuente: [medium.com/@bjornbeishline/using-googleapis-with-cloudflare-workers](https://medium.com/@bjornbeishline/using-googleapis-with-cloudflare-workers-33b9b6de26c4)

5. **Límite memoria 128 MB Worker isolate vs PDFs facturas grandes**: caso real documentado de PDF de 20 MB que causó OOM crash en Worker. Cathedral recibe PDFs de proveedores de reformas y construcción que frecuentemente incluyen planos CAD escaneados de 15-30 MB. Mitigación obligatoria: presigned URL upload directo a R2 + Worker solo maneja URL, no buffer. Arquitectura más compleja que la actual. Fuente: [medium.com/@morphinewan_37034](https://medium.com/@morphinewan_37034/when-a-20mb-file-crashed-my-cloudflare-worker-an-indie-developers-memory-management-nightmare-1fc6d52ce46b)

6. **Cero casos producción PYME 500 fact/mes documentados públicamente** con stack 100% Cloudflare end-to-end. Únicos casos cercanos: Niflheim/QuestEdu (B2B, mayor volumen), Pablo Grant (Medium, sin números reales), WorkOS blog-bot (no AP automation). Cathedral sería early adopter sin precedente para copiar.

7. **Hacker News marzo 2026 reporta delays de hasta 4 minutos en arranque de instancias Workflow sin carga previa**. Cathedral procesa facturas en tiempo real cuando llegan emails; un cold start de 4 minutos es inaceptable. Fuente: [news.ycombinator.com/item?id=47334792](https://news.ycombinator.com/item?id=47334792)

8. **Lock-in alto Workflows V2**: la API `WorkflowEntrypoint` + `step.do()` + `step.sleep()` es completamente propietaria sin estándar equivalente en otros providers. Salir a Inngest, Trigger.dev o Temporal estimado en 80-150 horas de reescritura. A €60/hora freelance = €5,000-9,000 de deuda potencial migración futura.

9. **Cathedral está en estabilización post-incidentes**. Memoria documenta:
   - Incidente ENOSPC 14/05/2026 (7 días bloqueado silente)
   - 47 fixes aplicados en sesión 9/05/2026
   - 17 horas ultra-maratónica 11/05/2026
   - Bug draft/active descubierto hoy 15/05/2026
   - Regla `feedback_sistema_infalible.md`: "Pasos firmes y coherentes ≫ velocidad"

   Cambiar el runtime base mientras el sistema aún está en estabilización violaría la propia regla SUPREMA de Cathedral.

### Coste real verificado 24 meses (si se hiciera la migración)

Workers Paid: $5 × 24 = $120
R2 storage 30 GB facturas: ~$6
Workflows storage minimal: ~$0
AI Gateway core gratis: $0
Hyperdrive incluido: $0
**Total Cloudflare 24m: ~$126-155**

Más barato que Inngest Pro ($75/mes × 24 = $1,800) y Vercel Pro 3 seats ($60/mes × 24 = $1,440). Económicamente Cloudflare es la opción correcta a largo plazo. La objeción es de timing y madurez, no de coste.

## Decisión

Cathedral **NO migra a Cloudflare Workers en mayo 2026**. Sigue con stack actual (n8n self-hosted Hetzner + Vercel Hobby para web admin + Supabase Postgres). Implementamos durante esta sesión y próximas semanas el "Plan A" (utilities Next.js Vercel Hobby + n8n thin) descrito en ADR-0001 con la corrección de la arquitectura unificada (utilities Next.js, no endpoint bloqueante).

La migración Cloudflare se planifica para **Q4 2026 / Q1 2027** condicional a:

1. **Workflows V2 madurez 6+ meses** sin bugs críticos abiertos en `cloudflare/workers-sdk` issues relacionados con observability, CI o cold starts
2. **Cathedral estabilización completa post-incidentes**: 90 días consecutivos sin incidentes operacionales en n8n o Vercel
3. **Golden dataset 50 facturas reales etiquetadas** disponible (parte de Plan A, tarea #34)
4. **Prueba piloto aislada** de 1 Worker + Workflow durante 30 días con un flujo no crítico (por ejemplo, healthcheck o clasificación tipo archivo screenshot vs PDF) sin afectar producción
5. **AI Gateway BYOK Vertex AI** verificado funcional desde Worker piloto antes de migrar todo el cascade

Cuando se cumplan las 5 condiciones, se redacta ADR-0008 con el plan de migración escalonado en 4 fases (utility → cascade → Workflow V2 runner → cleanup n8n) basado en el plan elaborado por el agente SRE en sesión 16/05/2026 (transcripto Claude Code).

## Alternativas consideradas

- **Migración inmediata Cloudflare 20-30h** — Descartada por las 9 razones documentadas arriba.
- **Vercel Pro $60/mes ($20 × 3 seats) + endpoint Next.js bloqueante** — Descartada porque el patrón endpoint bloqueante con cascade LLM es trampa documentada (TaxHacker, Trigger.dev customer 6k docs/mes, Inngest blog) — Vercel Hobby/Pro reporta 504 a 60-90s con PDFs grandes incluso con 300s configurado.
- **Inngest free 50k events/mes** — Descartada porque 5 concurrent steps en free tier asfixia Cathedral con picos de emails simultáneos. Pro $75/mes obligado en producción real, 15× más caro que Cloudflare cuando se haga la migración.
- **Self-host nuevo container Hetzner con Workers-style runtime** — Descartada como sobre-ingeniería para PYME 500 fact/mes con 1 dev.

## Consecuencias

### Positivas

- Cero riesgo migración runtime base mientras Cathedral estabiliza
- Cero coste extra inmediato (Plan A todo en infraestructura existente)
- Plan A entrega valor real esta semana (utilities reutilizables n8n + portal trabajador, tests CI)
- Cloudflare AI Gateway YA aporta valor (caching, observability LLM) sin migración runtime
- Trabajo de Plan A no se tira al migrar después: las utilities Next.js son portables a Workers fácilmente cuando llegue el momento (lógica pura TypeScript)

### Negativas

- Cathedral sigue con n8n y sus bugs conocidos durante 6-9 meses adicionales (pairedItem #15981 sigue abierto mayo 2026, .itemMatching crash #24465 sin parche)
- Inconsistencia portal trabajador vs n8n persiste hasta completar Plan A
- Decisión Cloudflare se pospone tres veces: ADR-0001 (planificada), ADR-0007 (diferida), futuro ADR-0008 (ejecutada). Riesgo de "siempre diferir"

### Criterio para revertir

Adelantamos la migración Cloudflare a antes de Q4 2026 si:

- Cloudflare publica fix oficial de bug #12419 + #10600 y release nueva estable Workflows V2 sin nuevos issues críticos antes de septiembre 2026
- Cathedral sufre nuevo incidente n8n grave (>24h downtime o pérdida datos) que justifique migración como emergencia
- Volumen Cathedral supera 5,000 facturas/mes antes de Q4 2026 (escala donde n8n self-hosted CX22 ya no aguantaría)
- David completa Plan A en menos tiempo del estimado y tiene ventana 30h libre antes Q4 2026

## Referencias

- Sesión doc-validator + 2 research agents 16/05/2026 (transcripto Claude Code completo)
- Plan SRE migración 20-30h elaborado por agente experto en mismo transcripto
- ADR-0001 arquitectura procesamiento facturas
- ADR-0002 hosting endpoint cascade LLM
- ADR-0004 refactor solo + trigger anti-burnout
- `feedback_sistema_infalible.md` — pasos firmes ≫ velocidad
- [Cloudflare Workflows V2 InfoQ](https://www.infoq.com/news/2026/05/cloudflare-workflows-v2-release/)
- [Workers SDK issue #12419](https://github.com/cloudflare/workers-sdk/issues/12419)
- [Workers SDK issue #10600](https://github.com/cloudflare/workers-sdk/issues/10600)
- [n8n issue pairedItem #15981 abierto mayo 2026](https://github.com/n8n-io/n8n/issues/15981)
- [HN delays Workflows](https://news.ycombinator.com/item?id=47334792)
