# ADR-0004: Refactor en solitario vs outsource

## Estado

Aceptada — 2026-05-16

## Contexto

ADR-0001 establece un refactor de 2-4 semanas trabajo intermitente para reducir el workflow n8n a thin orchestrator y migrar la lógica a un endpoint Next.js. Cathedral tiene un solo desarrollador (David) que también gestiona el día a día del negocio: facturación, contratos, fiscal, proyectos, gestión personal, flipping inmobiliario.

Opciones evaluadas durante la auditoría con múltiples agentes:

- **Refactor solo**: David ejecuta el refactor sin ayuda externa. Coste 0 €. Tiempo estimado 2-4 semanas. Riesgo principal: burnout 1-dev + paralización del resto del negocio durante el refactor
- **Freelancer Toptal Spain senior (n8n + Next.js + Supabase)**: tarifa €100-200/h, ~€15-22k para 4-8 semanas de co-build con David. Pros: libera tiempo de David. Contras: consultor tarda 1-2 meses en entender la lógica única de Cathedral (multi-SL, intragroup_transactions, project_labor_costs, Verifactu schema custom), riesgo de lock-in con el código que él produce
- **Discovery paid agencia (DigitalCube AI Madrid, partner oficial n8n)**: €2-5k por diagnóstico independiente de 2-4 días sin entrar a implementación
- **Co-build agencia (Goodspeed Automation Accelerator EU, US-anchored)**: $5.000-$25.000 paquete cerrado con audit + playbook 30-90 días
- **Fractional CTO retainer (CTOMultiplier, fractionalcto.es)**: €4.500-€10.000/mes con 1-2 días/semana de advisor continuo

Evidencia recabada sobre solo-devs comparables (Daniel Setzermann, vas3k TaxHacker, Construction firm 400-500 fact/mes): el patrón mayoritario es **refactor solo con segunda opinión externa puntual**, no outsource completo. Cathedral ya tiene autonomía probada empíricamente: 47 fixes en sesión 9/05, sesión 14/05 con 7 patches workflow general, sesión 15/05 con resolución autónoma de bugs draft/active.

Riesgo psicológico identificado por literatura solo-founder 2025-2026 (Carta Solo Founders Report): el problema NO es la capacidad técnica sino la sostenibilidad emocional + tiempo dedicado a operaciones vs feature dev.

## Decisión

Refactor lo ejecuta David en solitario, con tres mitigaciones obligatorias antes de empezar:

**Mitigación 1 — Segunda opinión puntual externa (€60-120, antes de empezar)**: David reserva una sesión de 60-90 minutos en Codementor con un senior `n8n + Next.js + Supabase`, llevando los ADRs 0001-0004 firmados y el plan de refactor escrito. Objetivo: validación independiente del plan, no co-build. Se hace ANTES de la primera línea de código del refactor.

**Mitigación 2 — Trigger anti-burnout escrito y observable**: si durante 60 días consecutivos David dedica más de 5 horas/semana a tareas operacionales (apagar fuegos, debug producción, mantenimiento) y no a desarrollo de features, **pausa el refactor obligatoriamente** y contrata un freelancer Toptal para cerrar el refactor pendiente. Esta cláusula es un compromiso escrito en este ADR, no una intención.

**Mitigación 3 — ADRs firmados antes de empezar el refactor**: los ADRs 0001-0004 quedan aceptados antes de la primera línea de código. Prohibido cambiar la arquitectura del refactor a mitad del refactor; si surge una decisión nueva, se escribe un ADR nuevo que reemplaza al anterior, no se desvía silenciosamente.

Presupuesto de contingencia para outsource: si Mitigación 2 dispara la contratación de freelancer, presupuesto disponible €15-22k para 4-8 semanas (Toptal Spain). Esta partida se reserva mentalmente desde hoy, no se decide en el momento de crisis.

## Alternativas consideradas

- **Outsource completo desde día 1 a Toptal o agencia** — Descartada por mal ROI específico de Cathedral: la lógica única (multi-SL, intragroup, Verifactu, project_labor_costs) requiere 1-2 meses de onboarding del consultor, mientras que David ya conoce todo el sistema y ha demostrado autonomía resolutiva en las sesiones recientes
- **Fractional CTO retainer mensual** — Descartada por coste excesivo (€4.500-10.000/mes) para el tamaño y madurez de Cathedral; mejor reservar ese presupuesto para freelancer puntual si la Mitigación 2 dispara
- **Refactor solo sin mitigaciones** — Descartada porque la regla SUPREMA `feedback_sistema_infalible.md` exige sistemas a prueba de fallo, incluyendo el factor humano. Refactor solo sin red de seguridad escrita es exposición innecesaria a burnout
- **Discovery DigitalCube AI €2-5k antes de empezar** — Descartada como obligación. Se mantiene como opción si la sesión Codementor (Mitigación 1) levanta dudas estructurales serias que requieran auditoría más profunda

## Consecuencias

### Positivas

- Coste directo del refactor: 0 € (más €60-120 de sesión Codementor)
- David conserva el conocimiento profundo del sistema (no se transfiere a un externo que se vaya)
- Cathedral aprende a mantener su propio sistema en el futuro
- Refactor a velocidad David, ajustable según operativa diaria
- Mitigación 2 protege explícitamente del burnout sin necesidad de detectarlo emocionalmente

### Negativas

- Tiempo personal de David comprometido durante 2-4 semanas
- Otras tareas (libro horas, flipping, fiscal) pueden ralentizarse durante el refactor
- Si Mitigación 2 dispara, hay gasto imprevisto de €15-22k
- Sin segunda opinión continua día a día (sólo la sesión Codementor inicial)

## Criterio para revertir

Contratamos freelancer Toptal Spain por €15-22k para 4-8 semanas si:

- Mitigación 2 se activa (5h/semana operaciones durante 60 días consecutivos)
- Tras 2 semanas de refactor en solitario David no ha conseguido reducir el workflow por debajo de 50 nodos
- Aparece urgencia externa (Verifactu se adelanta, requerimiento AEAT, factura crítica perdida) que requiera capacidad doble inmediata
- David enferma o tiene otra causa de fuerza mayor que bloquee el avance >2 semanas

## Referencias

- [Carta Solo Founders Report 2025](https://carta.com/data/solo-founders-report/)
- [Toptal — Freelance n8n developers Spain](https://www.toptal.com/developers/n8n)
- [DigitalCube AI — Partner Oficial n8n España](https://www.digitalcube.ai/en/partner-oficial-n8n-espana)
- [Codementor — pay-per-session expert sessions](https://www.codementor.io/)
- Memoria Cathedral: `feedback_sistema_infalible.md`, `pendiente_investigacion_arquitectura_post_n8n.md`
