# ADR-0003: Timing implementación Verifactu emisión

## Estado

Aceptada — 2026-05-16

## Contexto

Cathedral House Investment SL (CIF B19761915) emite facturas a clientes de reformas además de procesar facturas recibidas de proveedores. El admin actual genera estas facturas como PDFs custom con razón social, NIF y datos legales básicos, pero **no cumplen el sistema Verifactu** (Real Decreto 1007/2023 + Real Decreto 254/2025): no llevan QR de verificación, no se firman digitalmente con cert FNMT, no encadenan hash SHA-256, no se envían a AEAT en tiempo real.

La obligatoriedad real, tras el retraso del Real Decreto 254/2025, queda así:

- Sociedades de capital (Cathedral): **1 de enero de 2027**
- Autónomos: **1 de julio de 2027**

Margen real disponible desde hoy: ~7-8 meses.

Trabajo ya completado en el sistema (commit `391620a` del 10/05/2026):

- Schema BD Verifactu en tabla `invoices` (14 columnas adicionales)
- Trigger BD `audit_log_chain` SHA-256 hash chain
- RPC `verify_chain_integrity`

Pendiente para cumplimiento real:

- Cert FNMT de persona física representante (David) — trámite presencial con cita previa, espera típica de varias semanas
- Generador Facturae 3.2.2 XML firmado con XAdES-BES desde el admin
- QR Verifactu en el PDF emitido apuntando a `prewww2.aeat.es/...`
- Cliente HTTP con mutual TLS para envío al endpoint AEAT `RegFactuSistemaFacturacion`
- Decisión modo Verifactu (envío inmediato) vs No-Verifactu (custodia local 4 años)
- Activación de los triggers BD ya schemados al hacer `INSERT` con `direction=emitida`

## Decisión

Implementación escalonada en dos fases con calendario fijo:

**Fase A — Trámite cert FNMT (esta semana, 2026-05-19 / 2026-05-23)**: David tramita cita previa en FNMT (Fábrica Nacional de Moneda y Timbre, oficina Madrid) y obtiene certificado FNMT-RCM de persona física como representante de Cathedral House Investment SL. Este trámite es presencial e independiente del desarrollo, se inicia **ya** porque la espera (cita + tramitación) es de semanas y bloquea el envío AEAT.

**Fase B — Desarrollo Verifactu (agosto-septiembre 2026)**: durante 4-6 semanas de trabajo intermitente, David implementa generador Facturae XML, QR Verifactu en PDF, activación trigger hash chain BD, cliente HTTP mutual TLS, modo No-Verifactu local (custodia 4 años en Supabase Storage cifrado).

**Fase C — Envío AEAT live (octubre-noviembre 2026)**: David activa el envío en producción con el cert FNMT ya obtenido. Validación con facturas de prueba contra sandbox AEAT antes de pasar a producción.

Mientras tanto, **NO se modifica la generación actual de PDFs custom**. Cathedral sigue emitiendo facturas como hasta hoy hasta agosto 2026 mínimo. El refactor de procesamiento recibidas (ADR-0001) tiene prioridad operativa por estar provocando bugs activos cada semana.

## Alternativas consideradas

- **Empezar Verifactu emisión ahora (mayo-junio 2026)** — Descartada porque (a) ADR-0001 tiene prioridad operativa, (b) hacer dos refactors grandes en paralelo aumenta riesgo de regresión, (c) el margen legal es suficiente para diferir a Q3
- **Esperar a Q4 2026 para empezar todo** — Descartada porque deja menos margen ante imprevistos (errores en cert FNMT, bugs en endpoint AEAT, validación sandbox); el cert FNMT debe iniciarse YA aunque el desarrollo se difiera
- **Pagar SaaS Verifactu-compliant (Holded, Quipu, Sage50)** — Descartada porque obligaría a migrar gestión de facturación emitida fuera del admin propio de Cathedral, perdiendo trazabilidad con `project_labor_costs`, multi-SL, intragroup_transactions y el resto del sistema integrado. Coste-beneficio negativo en este perfil

## Consecuencias

### Positivas

- Margen legal respetado con tiempo de seguridad (~3-4 meses de colchón antes del deadline)
- Foco operativo en una cosa a la vez (ADR-0001 ahora, Verifactu después)
- Cert FNMT iniciado YA descongestiona el camino crítico de Q3-Q4
- Modo No-Verifactu local primero permite validar generador XML y QR antes del envío AEAT real
- Schema BD ya hecho (commit 391620a) no se toca, se reutiliza tal cual

### Negativas

- Cathedral sigue emitiendo PDFs no-Verifactu durante ~5 meses más
- Si Real Decreto 254/2025 se adelantara, el plan tendría que reordenarse (probabilidad baja según comunicación oficial actual)
- Si el cert FNMT se demora más de 8 semanas, comprime el calendario de desarrollo

## Criterio para revertir

Reordenamos prioridades y adelantamos Verifactu a junio-julio 2026 si:

- AEAT publica nueva normativa que adelanta la fecha de obligatoriedad para sociedades
- Cathedral recibe inspección AEAT o requerimiento específico
- El cert FNMT se obtiene en menos de 2 semanas, liberando margen
- ADR-0001 (refactor recibidas) se completa antes de lo previsto

## Referencias

- [Real Decreto 1007/2023 — BOE-A-2023-24840](https://www.boe.es/buscar/act.php?id=BOE-A-2023-24840)
- [Real Decreto 254/2025 — prórroga Verifactu](https://noticias.juridicas.com/actualidad/noticias/20735-nueva-prorroga:-verifactu-no-sera-obligatorio-hasta-2027-para-sociedades-y-otros-contribuyentes/)
- [AEAT — Sistemas Informáticos de Facturación Verifactu](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/preguntas-frecuentes/sistemas-verifactu.html)
- [FNMT — Certificado de Representante de Persona Jurídica](https://www.sede.fnmt.gob.es/certificados/persona-fisica)
- Commit `391620a` schema Verifactu BD aplicado
- Memoria Cathedral: `cathedral-pendiente.md` entry 10/05/2026 sección F5-BD Verifactu
