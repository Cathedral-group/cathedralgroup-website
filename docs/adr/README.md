# Architecture Decision Records (ADRs) — Cathedral Group

Decisiones técnicas relevantes del proyecto, una por archivo, numerado secuencialmente.

## Propósito

- Documentar **el porqué** de cada decisión técnica importante, no solo el qué
- Evitar parálisis por análisis: una vez decidido, queda escrito y se ejecuta
- Permitir que cualquier persona (futuro David, freelancer puntual, socio) entienda el sistema sin preguntar
- Servir de input para futuras decisiones (no repetir debates ya zanjados)

## Formato

Basado en [peter-evans/lightweight-architecture-decision-records](https://github.com/peter-evans/lightweight-architecture-decision-records). Ver `template.md`.

Cada ADR tiene:

- **Estado**: Propuesta / Aceptada / Rechazada / Superseded por ADR-XXX
- **Contexto**: problema concreto, restricciones, fuerzas en juego
- **Decisión**: qué decidimos hacer, en presente
- **Alternativas consideradas** y razón de descarte
- **Consecuencias** positivas y negativas
- **Criterio para revertir**: condición observable que cambiaría la decisión
- **Referencias**: links a docs, GitHub issues, conversaciones

## Reglas

- Numeración secuencial `NNNN-titulo-en-kebab-case.md`
- Decisión escrita en **presente** ("usamos X"), no futuro condicional
- Una decisión cancelada NO se borra: se marca `Superseded por ADR-XXX` y se mantiene
- ADRs aceptados son **firmes**. Cambiarlos requiere otro ADR que los reemplace
- Criterio de reversión es **observable y medible**, no subjetivo

## Índice

| # | Título | Estado |
|---|---|---|
| [0001](0001-arquitectura-procesamiento-facturas.md) | Arquitectura procesamiento facturas recibidas | Aceptada |
| [0002](0002-hosting-endpoint-llm.md) | Hosting endpoint cascade LLM | Aceptada |
| [0003](0003-verifactu-emision-timing.md) | Timing implementación Verifactu emisión | Aceptada |
| [0004](0004-refactor-solo-vs-outsource.md) | Refactor en solitario vs outsource | Aceptada |
