# ADR-0005: Migración SDK Gemini `@google/generative-ai` → `@google/genai`

## Estado

Aceptada (sesión dedicada pendiente) — 2026-05-16

## Contexto

Cathedral usa el SDK Node.js `@google/generative-ai` en `lib/ocr-gemini.ts` para llamar a Gemini 2.5 Flash en el portal trabajador (OCR de tickets/facturas).

Validación con `doc-validator` (16/05/2026) reveló tres hechos críticos confirmados contra docs oficiales Google:

1. **SDK `@google/generative-ai` está oficialmente deprecated desde el 30 de noviembre de 2025**. El repositorio `google-gemini/generative-ai-js` fue renombrado a `deprecated-generative-ai-js` y archivado como read-only el 16 de diciembre de 2025. Los bugs reportados no se corrigen.
2. **El SDK sucesor `@google/genai` (Unified Google GenAI SDK) es el oficial recomendado** para todos los proyectos nuevos y para migrar los existentes. Da acceso a features que el SDK legacy no expone (`thinkingBudget`, `responseSchema` con tipado fuerte, multi-modal Live API, structured outputs canónicos).
3. **El SDK legacy no soporta `thinkingConfig` en TypeScript types** (verificado empíricamente al intentar añadirlo a `lib/ocr-gemini.ts` 16/05/2026 — error `TS2353: 'thinkingConfig' does not exist in type 'GenerationConfig'`). Esto bloquea optimización de coste.

Restricciones del caso Cathedral:

- Volumen actual: ~500 facturas/mes
- Coste actual con SDK legacy + `gemini-2.5-flash`: ~$0.60/mes (incluye ~28 thinking tokens por call que no usamos para OCR estructurado)
- Caso de uso: extraer JSON estructurado con NIF, importes, IVA, fecha, proveedor desde imágenes JPEG/PNG/WebP/HEIC
- Stack: Next.js 15 App Router + `@google/generative-ai` instalado actualmente

Referencias verificadas:

- [Gemini API — Libraries](https://ai.google.dev/gemini-api/docs/libraries) — "`@google/generativeai`: Not actively maintained. Recommended library: `@google/genai`. The legacy libraries don't provide access to recent features [...] and are deprecated as of November 30th, 2025."
- [google-gemini/deprecated-generative-ai-js](https://github.com/google-gemini/deprecated-generative-ai-js) — repo archivado read-only
- [Gemini API — Thinking](https://ai.google.dev/gemini-api/docs/thinking) — "You can disable thinking by setting `thinkingBudget` to 0"
- [Gemini API — Structured outputs](https://ai.google.dev/gemini-api/docs/structured-output) — `responseSchema` canónico
- [Gemini API — Migrate](https://ai.google.dev/gemini-api/docs/migrate) — guía oficial migración

## Decisión

Cathedral migra `lib/ocr-gemini.ts` del SDK `@google/generative-ai` (deprecated) al SDK `@google/genai` (oficial) en una sesión dedicada estimada en 1-2 horas. La migración incluye tres optimizaciones agrupadas que el SDK nuevo desbloquea:

1. **`thinkingBudget: 0`** — desactiva thinking tokens (Gemini 2.5 Flash los genera por defecto, ~28 por call para OCR Cathedral). Ahorro estimado ~10% coste output sin pérdida de precisión para extracción estructurada.
2. **`responseSchema` con Zod** — sustituye el prompt "devuelve solo JSON" por schema explícito tipado. Garantiza forma y tipos correctos del JSON (NIF como string, importes como number, fecha YYYY-MM-DD), elimina parsing manual frágil con regex de markdown.
3. **API pattern moderno** — `ai.models.generateContent({ model, config, contents })` en lugar de `getGenerativeModel({ model, systemInstruction }).generateContent([...])`.

La migración es local a `lib/ocr-gemini.ts`. No afecta a `lib/ocr-providers/openai.ts` ni `lib/ocr-providers/mistral.ts` (esos usan REST directo sin SDK).

Tras la migración, validar empíricamente con:

- 3-5 facturas reales españolas Cathedral
- Verificar `thoughtsTokenCount = 0` en gateway logs (vs 28 actual)
- Verificar JSON output cumple Zod schema sin warnings de parse
- Verificar latencia sigue <5s end-to-end

## Alternativas consideradas

- **Quedarse en SDK legacy `@google/generative-ai`** — Descartada porque el repo está archivado, bugs no se corrigen, no soporta `thinkingConfig` ni `responseSchema` tipado. Es deuda técnica que crece sola.
- **Migrar SDK ahora mismo en plena sesión P1 sin sesión dedicada** — Descartada por riesgo de regresión en producción durante validación de AI Gateway. Migrar tras consolidar P1 con cascade estable.
- **Sustituir Gemini por solo OpenAI/Mistral** — Descartada. Gemini 2.5 Flash es el tier más barato (~$0.30/$2.50 por 1M tokens) con mejor calidad para vision OCR según benchmarks 2026 (OCR Arena).
- **Evaluar `gemini-2.5-flash-lite`** ($0.10/$0.40 vs $0.30/$2.50, 4-6× más barato) como reemplazo de Flash. Diferido a A/B test 50 facturas reales en la misma sesión de migración.

## Consecuencias

### Positivas

- Salir de SDK archivado: cualquier bug futuro tiene workaround en SDK mantenido activamente
- Ahorro coste ~10% output (thinkingBudget=0)
- JSON output garantizado vía responseSchema (menos parsing errors)
- Acceso a Live API, Files API, multi-modal nuevo si Cathedral lo necesita después
- Posibilidad evaluar Flash-Lite para más ahorro (5-6× barato) en A/B

### Negativas

- 1-2 horas de trabajo dev
- Riesgo regresión durante migración (mitigado con tests y rollback al SDK legacy si falla)
- Feature flag `USE_AI_GATEWAY` debe seguir funcionando tras migración
- Dependency tree cambia (`@google/generative-ai` se desinstala, `@google/genai` se instala)

## Criterio para revertir

Revertimos al SDK legacy si:

- Tras migración, OCR portal trabajador falla con tasa >5% durante 48 horas
- `@google/genai` resulta tener bugs críticos sin workaround durante el desarrollo
- Latencia end-to-end portal trabajador sube >50% sostenido
- El SDK nuevo no es compatible con la integración Cloudflare AI Gateway (baseUrl + customHeaders)

## Referencias

- [Gemini API — Libraries deprecation](https://ai.google.dev/gemini-api/docs/libraries)
- [Migration guide oficial](https://ai.google.dev/gemini-api/docs/migrate)
- [`@google/genai` package](https://www.npmjs.com/package/@google/genai)
- [google-gemini/generative-ai-js archivado](https://github.com/google-gemini/deprecated-generative-ai-js)
- Sesión 16/05/2026 doc-validator output (en transcript Claude Code)
- Commit `da4baa8` — cambio `gemini-2.0-flash-exp` → `gemini-2.5-flash` (predecesor de este ADR)
