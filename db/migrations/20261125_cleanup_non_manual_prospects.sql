-- Remove provider-discovered rows before the multi-source quality-filter rollout.
-- Manual rows, including the existing test row, are intentionally preserved.

DELETE FROM public.prospects
WHERE source <> 'manual';
