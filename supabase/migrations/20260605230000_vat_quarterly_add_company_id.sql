-- vat_quarterly: añadir company_id (la vista agregaba TODAS las empresas juntas y
-- no tenía company_id, así que el filtro .eq('company_id') de los consumidores
-- (dashboard IVA KPI, /admin/informes pestañas IVA + Gráficas) fallaba en silencio
-- → "Sin datos". Además casteamos year/quarter a int (PostgREST devuelve numeric
-- como string y rompía las comparaciones `=== year` del front) y excluimos las
-- facturas borradas (deleted_at).
--
-- Aplicada a producción vía Management API el 05/06/2026 (este archivo refleja el repo).
-- Sin dependencias (verificado pg_depend). View → sin pérdida de datos.

DROP VIEW IF EXISTS public.vat_quarterly;

CREATE VIEW public.vat_quarterly AS
SELECT
    company_id,
    EXTRACT(year FROM issue_date)::int AS year,
    (ceil(EXTRACT(month FROM issue_date) / 3.0))::int AS quarter,
    sum(CASE WHEN direction = 'emitida' THEN vat_amount ELSE 0::numeric END) AS vat_repercutido,
    sum(CASE WHEN direction = 'recibida' THEN vat_amount ELSE 0::numeric END) AS vat_soportado,
    sum(CASE WHEN direction = 'emitida' THEN vat_amount ELSE 0::numeric END)
      - sum(CASE WHEN direction = 'recibida' THEN vat_amount ELSE 0::numeric END) AS cuota_a_ingresar
FROM invoices
WHERE doc_type = 'factura' AND issue_date IS NOT NULL AND deleted_at IS NULL
GROUP BY company_id, EXTRACT(year FROM issue_date), ceil(EXTRACT(month FROM issue_date) / 3.0);

GRANT SELECT ON public.vat_quarterly TO service_role, authenticated, anon;
