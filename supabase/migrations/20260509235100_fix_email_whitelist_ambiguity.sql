-- Fix bug ambigüedad PL/pgSQL en check_supplier_email_whitelist
-- (la columna count_uso colisionaba con el OUT parameter del RETURN TABLE)

CREATE OR REPLACE FUNCTION public.check_supplier_email_whitelist(p_supplier_nif text, p_email_address text)
 RETURNS TABLE(is_known boolean, count_uso integer, primer_uso timestamp with time zone, alert text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_existing RECORD;
  v_email_norm TEXT;
BEGIN
  v_email_norm := LOWER(TRIM(p_email_address));
  IF v_email_norm = '' OR p_supplier_nif IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, NULL::TIMESTAMPTZ, 'sin_datos'::TEXT;
    RETURN;
  END IF;

  SELECT * INTO v_existing FROM supplier_email_whitelist sew
  WHERE sew.supplier_nif = p_supplier_nif AND sew.email_address = v_email_norm;

  IF v_existing.id IS NULL THEN
    INSERT INTO supplier_email_whitelist (supplier_nif, email_address, confirmado)
    VALUES (p_supplier_nif, v_email_norm, FALSE)
    ON CONFLICT (supplier_nif, email_address) DO NOTHING;

    IF EXISTS (SELECT 1 FROM supplier_email_whitelist sew2
               WHERE sew2.supplier_nif = p_supplier_nif
                 AND sew2.email_address <> v_email_norm) THEN
      RETURN QUERY SELECT FALSE, 1,
        CURRENT_TIMESTAMP::TIMESTAMPTZ,
        format('§EMAIL_NUEVO:Email %s no es habitual para proveedor %s — verificar si es legítimo (anti-BEC)', v_email_norm, p_supplier_nif)::TEXT;
    ELSE
      RETURN QUERY SELECT FALSE, 1, CURRENT_TIMESTAMP::TIMESTAMPTZ, 'primer_email_proveedor'::TEXT;
    END IF;
  ELSE
    -- Email ya conocido → incrementar contador (qualificar columna para evitar ambigüedad con OUT param)
    UPDATE supplier_email_whitelist sew
    SET count_uso = sew.count_uso + 1, ultimo_uso = NOW()
    WHERE sew.id = v_existing.id;
    RETURN QUERY SELECT TRUE, (v_existing.count_uso + 1), v_existing.primer_uso, NULL::TEXT;
  END IF;
END;
$function$;
