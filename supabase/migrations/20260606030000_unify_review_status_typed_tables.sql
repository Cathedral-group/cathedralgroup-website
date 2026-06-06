-- Auditoría profunda 06/06/2026 — Fix #1 (CRÍTICO)
--
-- Las 13 tablas de documentos tipados tenían el CHECK de review_status SIN
-- los valores 'confirmado'/'rechazado', pero /api/documentos/bulk los escribe
-- (acciones confirm/reject) → el INSERT/UPDATE fallaba con 23514 (check_violation)
-- → los botones Aprobar/Rechazar del hub y de la ficha NO funcionaban en
-- documentos no-factura (escrituras, contratos, notas, certificados, etc.).
--
-- invoices/payrolls/quotes YA tenían el CHECK ampliado (no se tocan aquí).
-- documentos_otros conserva además 'reclasificar' (único que lo usa).
--
-- Nombres de constraint verificados en vivo (pg_constraint, sin drift) y
-- validados por agente: todas las filas existentes tienen solo 'pendiente'
-- → el nuevo CHECK es superconjunto del viejo, el ADD no puede fallar.

ALTER TABLE public.contratos DROP CONSTRAINT IF EXISTS contratos_review_status_check;
ALTER TABLE public.contratos ADD CONSTRAINT contratos_review_status_check CHECK (review_status IN ('pendiente','revisado','confirmado','rechazado','error','reprocesar'));

ALTER TABLE public.notas_simples DROP CONSTRAINT IF EXISTS notas_simples_review_status_check;
ALTER TABLE public.notas_simples ADD CONSTRAINT notas_simples_review_status_check CHECK (review_status IN ('pendiente','revisado','confirmado','rechazado','error','reprocesar'));

ALTER TABLE public.escrituras DROP CONSTRAINT IF EXISTS escrituras_review_status_check;
ALTER TABLE public.escrituras ADD CONSTRAINT escrituras_review_status_check CHECK (review_status IN ('pendiente','revisado','confirmado','rechazado','error','reprocesar'));

ALTER TABLE public.licencias DROP CONSTRAINT IF EXISTS licencias_review_status_check;
ALTER TABLE public.licencias ADD CONSTRAINT licencias_review_status_check CHECK (review_status IN ('pendiente','revisado','confirmado','rechazado','error','reprocesar'));

ALTER TABLE public.certificaciones_obra DROP CONSTRAINT IF EXISTS certificaciones_obra_review_status_check;
ALTER TABLE public.certificaciones_obra ADD CONSTRAINT certificaciones_obra_review_status_check CHECK (review_status IN ('pendiente','revisado','confirmado','rechazado','error','reprocesar'));

ALTER TABLE public.certificados DROP CONSTRAINT IF EXISTS certificados_review_status_check;
ALTER TABLE public.certificados ADD CONSTRAINT certificados_review_status_check CHECK (review_status IN ('pendiente','revisado','confirmado','rechazado','error','reprocesar'));

ALTER TABLE public.informes DROP CONSTRAINT IF EXISTS informes_review_status_check;
ALTER TABLE public.informes ADD CONSTRAINT informes_review_status_check CHECK (review_status IN ('pendiente','revisado','confirmado','rechazado','error','reprocesar'));

ALTER TABLE public.seguros DROP CONSTRAINT IF EXISTS seguros_review_status_check;
ALTER TABLE public.seguros ADD CONSTRAINT seguros_review_status_check CHECK (review_status IN ('pendiente','revisado','confirmado','rechazado','error','reprocesar'));

ALTER TABLE public.modelos_fiscales DROP CONSTRAINT IF EXISTS modelos_fiscales_review_status_check;
ALTER TABLE public.modelos_fiscales ADD CONSTRAINT modelos_fiscales_review_status_check CHECK (review_status IN ('pendiente','revisado','confirmado','rechazado','error','reprocesar'));

ALTER TABLE public.justificantes_pago DROP CONSTRAINT IF EXISTS justificantes_pago_review_status_check;
ALTER TABLE public.justificantes_pago ADD CONSTRAINT justificantes_pago_review_status_check CHECK (review_status IN ('pendiente','revisado','confirmado','rechazado','error','reprocesar'));

ALTER TABLE public.albaranes DROP CONSTRAINT IF EXISTS albaranes_review_status_check;
ALTER TABLE public.albaranes ADD CONSTRAINT albaranes_review_status_check CHECK (review_status IN ('pendiente','revisado','confirmado','rechazado','error','reprocesar'));

ALTER TABLE public.presupuestos DROP CONSTRAINT IF EXISTS presupuestos_review_status_check;
ALTER TABLE public.presupuestos ADD CONSTRAINT presupuestos_review_status_check CHECK (review_status IN ('pendiente','revisado','confirmado','rechazado','error','reprocesar'));

ALTER TABLE public.documentos_otros DROP CONSTRAINT IF EXISTS documentos_otros_review_status_check;
ALTER TABLE public.documentos_otros ADD CONSTRAINT documentos_otros_review_status_check CHECK (review_status IN ('pendiente','revisado','confirmado','rechazado','error','reprocesar','reclasificar'));

NOTIFY pgrst, 'reload schema';
