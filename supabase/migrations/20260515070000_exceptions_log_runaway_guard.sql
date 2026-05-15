-- Defense Layer 3 (research-validated 15/05/2026): BD-level HARD CAP runaway guard.
--
-- Incidente 11-14/05/2026: workflow general acumuló 50.998 attempts gpt_attempt
-- mismo file_hash en 3+ días (1.188/h sostenido). Causa raíz: mismatch fallback
-- chain Check Anti-Bucle GPT URL vs Registrar Intento GPT body. URL filtraba
-- por source='' (vacío) → COUNT=0 siempre → loop nunca bloqueado.
--
-- Solución defense in depth (Microsoft Azure AI guidance + APIM circuit breaker):
-- TRIGGER BEFORE INSERT marca row blocked_loop in-place si > 10 attempts mismo
-- source en últimos 30 minutos. Independiente de la lógica del workflow.
-- Si workflow URL filter falla, BD igual bloquea.

CREATE OR REPLACE FUNCTION public.exceptions_log_runaway_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INT;
  v_window INTERVAL := INTERVAL '30 minutes';
  v_hard_cap INT := 10;
BEGIN
  IF NEW.ai_guess IS DISTINCT FROM 'gpt_attempt' THEN RETURN NEW; END IF;
  IF NEW.source IS NULL OR length(NEW.source) = 0 THEN
    NEW.resolved := TRUE;
    NEW.resolved_at := NOW();
    NEW.resolved_by := 'auto_runaway_guard:empty_source';
    NEW.resolution := jsonb_build_object('reason','runaway_guard:source_empty_blocked_at_insert','timestamp',NOW()::text);
    NEW.ai_guess := 'blocked_loop';
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_count
    FROM public.exceptions_log
    WHERE source = NEW.source
      AND ai_guess IN ('gpt_attempt','blocked_loop')
      AND created_at > NOW() - v_window;

  IF v_count >= v_hard_cap THEN
    NEW.resolved := TRUE;
    NEW.resolved_at := NOW();
    NEW.resolved_by := 'auto_runaway_guard';
    NEW.resolution := jsonb_build_object(
      'reason','runaway_guard:hard_cap_exceeded',
      'prior_count', v_count,
      'window_min', 30,
      'hard_cap', v_hard_cap
    );
    NEW.ai_guess := 'blocked_loop';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.exceptions_log_runaway_guard() IS
  'Defense Layer 3: hard cap 10 gpt_attempt mismo source en 30min. Marca blocked_loop in-place. Independiente del workflow.';

DROP TRIGGER IF EXISTS exceptions_log_runaway_guard_trg ON public.exceptions_log;
CREATE TRIGGER exceptions_log_runaway_guard_trg
  BEFORE INSERT ON public.exceptions_log
  FOR EACH ROW
  EXECUTE FUNCTION public.exceptions_log_runaway_guard();

-- Index parcial para que el COUNT del trigger sea instant en source+30min window
CREATE INDEX IF NOT EXISTS exceptions_log_source_recent_idx
  ON public.exceptions_log (source, created_at DESC)
  WHERE ai_guess IN ('gpt_attempt','blocked_loop');
