-- Bloque 0 F5-BD — Verifactu hash chain en invoices (emitidas)
--
-- Por qué esta migración existe
--   RD 1007/2023 obliga a sociedades desde 1/1/2027 a generar facturas con
--   sistema Verifactu: cada factura emitida tiene hash SHA-256 encadenado al
--   anterior (mismo emisor) + QR AEAT + opcional firma XAdES + opcional
--   envío en tiempo real a AEAT.
--
--   Esta migración añade los campos sin activar la generación automática
--   (eso requiere certificado FNMT por SL, pendiente David). Una vez activado
--   en F5-completo, el trigger calculará hash automáticamente al INSERT.
--
-- Por qué column-based en invoices y NO tabla nueva
--   Verifactu se aplica POR FACTURA EMITIDA. Crear tabla `invoices_emitted`
--   separada duplicaría 90% de campos. Mejor: filtrar por direction='emitida'
--   con UNIQUE constraint parcial. Mismo patrón que `audit_log_chain` para
--   hash encadenado.
--
-- Estado tras esta migración
--   - Schema preparado para Verifactu
--   - Trigger creado pero CONDICIONAL: solo dispara si verifactu_serie IS NOT NULL
--     (es decir, opcional hasta que David active la generación)
--   - Función helper para verificar integridad de la cadena por empresa
--   - Las 691 facturas existentes NO se ven afectadas (siguen sin hash)
--
-- Sprint Bloque 0 F5-BD — sesión 10/05/2026 noche.

-- ============================================================================
-- 1. Columnas Verifactu (solo aplican a direction='emitida')
-- ============================================================================
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS verifactu_serie TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS verifactu_numero TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS verifactu_hash TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS verifactu_prev_hash TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS verifactu_qr_payload TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS verifactu_qr_url TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS verifactu_xades_signature TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS verifactu_xades_signed_at TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS verifactu_sent_at TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS verifactu_csv_aeat TEXT;

-- SII complementario (para facturas que también van a SII por umbral 6M€)
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sii_clave_regimen TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sii_sent_at TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sii_csv_aeat TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sii_fecha_registro TIMESTAMPTZ;

COMMENT ON COLUMN invoices.verifactu_hash IS
  'F5-BD — SHA-256 hex del registro Verifactu. Calculado por trigger al primer '
  'INSERT que tenga verifactu_serie+numero. Encadenado con verifactu_prev_hash '
  'del registro anterior del mismo company_id (issuer).';
COMMENT ON COLUMN invoices.verifactu_prev_hash IS
  'F5-BD — hash del registro emitido inmediatamente anterior por el mismo '
  'company_id. NULL solo en la primera factura emitida de la SL.';
COMMENT ON COLUMN invoices.verifactu_qr_payload IS
  'F5-BD — payload canónico del QR AEAT: nif_emisor|serie|numero|fecha|total|hash. '
  'Formato exacto definido por orden HFP/... (versionable en F5-completo).';
COMMENT ON COLUMN invoices.verifactu_xades_signature IS
  'F5-BD — firma XAdES (Base64) del registro completo, firmada con certificado '
  'FNMT/Sello de Empresa de la SL emisora. NULL hasta que se active F5-completo.';
COMMENT ON COLUMN invoices.verifactu_csv_aeat IS
  'F5-BD — Código Seguro Verificación devuelto por AEAT tras envío telemático '
  '(opcional Verifactu, obligatorio SII). NULL si no se envió.';
COMMENT ON COLUMN invoices.sii_clave_regimen IS
  'F5-BD — clave régimen IVA SII (F1=normal, F2=simplificada, R1-R4=rectificativas, '
  'F3=por empresas/profesionales, etc). Catálogo orden HFP/417/2017.';

-- ============================================================================
-- 2. UNIQUE constraint para emitidas: (company_id, serie, numero)
-- ============================================================================
-- Solo aplica a direction='emitida' con serie+numero rellenos. Las recibidas
-- usan number (campo existente) que es el del proveedor — no único entre
-- empresas. Las emitidas legacy (pre-Verifactu) tendrán verifactu_serie NULL
-- y no entran en este unique.
CREATE UNIQUE INDEX IF NOT EXISTS invoices_verifactu_unique_emitida
  ON invoices (company_id, verifactu_serie, verifactu_numero)
  WHERE direction = 'emitida'
    AND deleted_at IS NULL
    AND verifactu_serie IS NOT NULL
    AND verifactu_numero IS NOT NULL;

COMMENT ON INDEX invoices_verifactu_unique_emitida IS
  'F5-BD — garantiza serie+numero único POR empresa emisora. Previene duplicados '
  'en la misma serie. Cumple obligación Verifactu de correlatividad.';

-- Index para queries por hash chain (último por company)
CREATE INDEX IF NOT EXISTS invoices_verifactu_chain
  ON invoices (company_id, created_at DESC)
  WHERE direction = 'emitida' AND verifactu_hash IS NOT NULL;

-- ============================================================================
-- 3. Trigger BEFORE INSERT calcular hash automáticamente
--    Solo se activa si la fila tiene verifactu_serie + numero (opt-in).
-- ============================================================================
CREATE OR REPLACE FUNCTION invoices_verifactu_compute_hash()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp, extensions
AS $$
DECLARE
  v_prev_hash TEXT;
  v_canonical TEXT;
  v_company_cif TEXT;
BEGIN
  -- Salir si no es factura emitida o no tiene serie+numero
  IF NEW.direction <> 'emitida'
     OR NEW.verifactu_serie IS NULL
     OR NEW.verifactu_numero IS NULL THEN
    RETURN NEW;
  END IF;

  -- Si ya viene hash poblado (por ejemplo desde n8n F5-completo), respetarlo
  IF NEW.verifactu_hash IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Obtener CIF de la empresa emisora
  SELECT cif INTO v_company_cif
    FROM companies
    WHERE id = NEW.company_id;

  -- Obtener hash de la factura inmediatamente anterior del mismo emisor
  SELECT verifactu_hash INTO v_prev_hash
    FROM invoices
    WHERE company_id = NEW.company_id
      AND direction = 'emitida'
      AND verifactu_hash IS NOT NULL
      AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1;

  NEW.verifactu_prev_hash := v_prev_hash;

  -- Payload canónico: nif|serie|numero|fecha|total|prev_hash
  v_canonical :=
    COALESCE(v_company_cif, '') || '|' ||
    NEW.verifactu_serie || '|' ||
    NEW.verifactu_numero || '|' ||
    COALESCE(NEW.issue_date::text, '') || '|' ||
    COALESCE(NEW.amount_total::text, '0') || '|' ||
    COALESCE(v_prev_hash, '');

  NEW.verifactu_hash := encode(extensions.digest(v_canonical, 'sha256'), 'hex');

  -- QR payload (formato simplificado — F5-completo aplicará formato AEAT exacto)
  NEW.verifactu_qr_payload :=
    'NIF=' || COALESCE(v_company_cif, '') ||
    '|SERIE=' || NEW.verifactu_serie ||
    '|NUM=' || NEW.verifactu_numero ||
    '|FECHA=' || COALESCE(NEW.issue_date::text, '') ||
    '|TOTAL=' || COALESCE(NEW.amount_total::text, '0') ||
    '|HASH=' || NEW.verifactu_hash;

  -- QR URL: hasta que AEAT publique endpoint, dejamos un placeholder
  -- determinístico que se actualizará en F5-completo con el endpoint real
  NEW.verifactu_qr_url :=
    'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=' ||
    COALESCE(v_company_cif, '') ||
    '&numserie=' || NEW.verifactu_serie || NEW.verifactu_numero ||
    '&fecha=' || COALESCE(NEW.issue_date::text, '') ||
    '&importe=' || COALESCE(NEW.amount_total::text, '0');

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION invoices_verifactu_compute_hash IS
  'F5-BD — calcula hash chain Verifactu automáticamente al INSERT/UPDATE de '
  'factura emitida con serie+numero. Conditional: salta si direction<>emitida '
  'o falta serie/numero. Idempotente: respeta hash ya rellenado.';

-- Trigger en INSERT
DROP TRIGGER IF EXISTS invoices_verifactu_hash_insert ON invoices;
CREATE TRIGGER invoices_verifactu_hash_insert
BEFORE INSERT ON invoices
FOR EACH ROW EXECUTE FUNCTION invoices_verifactu_compute_hash();

-- Trigger en UPDATE solo cuando se rellenan serie/numero por primera vez
-- (después de INSERT inicial sin Verifactu activo). NO recalcular si ya hay hash.
DROP TRIGGER IF EXISTS invoices_verifactu_hash_update ON invoices;
CREATE TRIGGER invoices_verifactu_hash_update
BEFORE UPDATE OF verifactu_serie, verifactu_numero ON invoices
FOR EACH ROW
WHEN (OLD.verifactu_hash IS NULL AND NEW.verifactu_serie IS NOT NULL AND NEW.verifactu_numero IS NOT NULL)
EXECUTE FUNCTION invoices_verifactu_compute_hash();

-- ============================================================================
-- 4. RPC `verify_verifactu_chain_integrity` — verificar que la cadena de hashes
--    de una empresa es coherente (cada hash deriva del anterior).
-- ============================================================================
CREATE OR REPLACE FUNCTION verify_verifactu_chain_integrity(p_company_id UUID)
RETURNS TABLE(
  total_invoices BIGINT,
  with_hash BIGINT,
  chain_breaks BIGINT,
  first_invoice_at TIMESTAMPTZ,
  last_invoice_at TIMESTAMPTZ,
  status TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_total BIGINT;
  v_with_hash BIGINT;
  v_breaks BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_total
    FROM invoices
    WHERE company_id = p_company_id
      AND direction = 'emitida'
      AND deleted_at IS NULL;

  SELECT COUNT(*) INTO v_with_hash
    FROM invoices
    WHERE company_id = p_company_id
      AND direction = 'emitida'
      AND deleted_at IS NULL
      AND verifactu_hash IS NOT NULL;

  -- Contar breaks: filas con prev_hash que NO coincide con el hash de la fila
  -- anterior por created_at del mismo company_id
  WITH chain AS (
    SELECT
      id,
      verifactu_hash,
      verifactu_prev_hash,
      LAG(verifactu_hash) OVER (PARTITION BY company_id ORDER BY created_at) AS expected_prev
    FROM invoices
    WHERE company_id = p_company_id
      AND direction = 'emitida'
      AND deleted_at IS NULL
      AND verifactu_hash IS NOT NULL
  )
  SELECT COUNT(*) INTO v_breaks
    FROM chain
    WHERE COALESCE(verifactu_prev_hash, '') <> COALESCE(expected_prev, '');

  RETURN QUERY
  SELECT
    v_total,
    v_with_hash,
    v_breaks,
    (SELECT MIN(created_at) FROM invoices WHERE company_id = p_company_id AND direction = 'emitida' AND deleted_at IS NULL),
    (SELECT MAX(created_at) FROM invoices WHERE company_id = p_company_id AND direction = 'emitida' AND deleted_at IS NULL),
    CASE
      WHEN v_total = 0 THEN 'no_invoices'
      WHEN v_with_hash = 0 THEN 'verifactu_inactive'
      WHEN v_breaks > 0 THEN 'chain_broken'
      WHEN v_with_hash < v_total THEN 'partial_coverage'
      ELSE 'healthy'
    END;
END;
$$;

COMMENT ON FUNCTION verify_verifactu_chain_integrity IS
  'F5-BD — verifica integridad de la cadena Verifactu para una empresa. '
  'Cuenta breaks: filas donde prev_hash no coincide con el hash de la fila '
  'anterior. Status posibles: no_invoices, verifactu_inactive, chain_broken, '
  'partial_coverage, healthy.';
