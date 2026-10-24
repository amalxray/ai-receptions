-- Phase 1: Add three billing plans (data only; no application logic changes).
-- Keep this migration mirrored in supabase/migrations so `supabase db push`
-- applies this same version from the Supabase CLI migration directory.

ALTER TABLE public.billing_plans
  ADD COLUMN IF NOT EXISTS ask_boost integer NOT NULL DEFAULT 0;

ALTER TABLE public.billing_plans
  ADD COLUMN IF NOT EXISTS is_legacy boolean NOT NULL DEFAULT false;

INSERT INTO public.billing_plans
  (plan_id, name, name_en, currency, price_per_month, billing_interval,
   stripe_price_id, is_active, is_public, display_order, features, limits,
   metadata, is_legacy, ask_boost)
VALUES
  ('solo_39', 'طبيب', 'Doctor', 'usd', 3900, 'month',
   NULL, true, true, 1,
   '["ai","booking","public_page","reviews","crm","finance","google_calendar","notifications"]'::jsonb,
   '{"users":1}'::jsonb,
   '{"tier":"solo","max_clinics":1}'::jsonb, false, 0),
  ('clinic_69', 'عيادة', 'Clinic', 'usd', 6900, 'month',
   NULL, true, true, 2,
   '["ai","booking","public_page","reviews","crm","finance","google_calendar","notifications"]'::jsonb,
   '{"users":3}'::jsonb,
   '{"tier":"clinic","max_clinics":1}'::jsonb, false, 0),
  ('center_119', 'مركز', 'Center', 'usd', 11900, 'month',
   NULL, true, true, 3,
   '["ai","booking","public_page","reviews","crm","finance","google_calendar","notifications"]'::jsonb,
   '{"users":null}'::jsonb,
   '{"tier":"center","max_clinics":null}'::jsonb, false, 1)
ON CONFLICT (plan_id) DO NOTHING;

INSERT INTO public.plan_activity_caps
  (plan_id, activity_type, capability_key, limit_value)
SELECT 'solo_39', activity_type, capability_key, limit_value
  FROM public.plan_activity_caps
 WHERE plan_id = 'basic'
ON CONFLICT (plan_id, activity_type, capability_key) DO NOTHING;

INSERT INTO public.plan_activity_caps
  (plan_id, activity_type, capability_key, limit_value)
SELECT 'clinic_69', activity_type, capability_key, limit_value
  FROM public.plan_activity_caps
 WHERE plan_id = 'advanced'
ON CONFLICT (plan_id, activity_type, capability_key) DO NOTHING;

INSERT INTO public.plan_activity_caps
  (plan_id, activity_type, capability_key, limit_value)
SELECT 'center_119', activity_type, capability_key, limit_value
  FROM public.plan_activity_caps
 WHERE plan_id = 'center'
ON CONFLICT (plan_id, activity_type, capability_key) DO NOTHING;

UPDATE public.billing_plans
   SET is_active = false,
       is_legacy = true
 WHERE plan_id IN ('basic', 'advanced', 'center');
