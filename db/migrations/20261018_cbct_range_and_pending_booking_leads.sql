-- Keep CBCT pricing as an explicit range and retain chat booking requests
-- when live availability cannot be verified.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.clinic_services
SET description = 'السعر من 70 إلى 300 شيكل حسب طلب الطبيب (سن واحد، جزء، فك واحد، أو فكين).',
    pricing_type = 'range',
    price = NULL,
    price_min = 70,
    price_max = 300
WHERE deleted_at IS NULL
  AND (
    name ILIKE '%CBCT%'
    OR name ILIKE '%طبقي%'
    OR name ILIKE '%مقطعي%'
  );
