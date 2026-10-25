-- Phase: Sync legacy plans (advanced/center) to match new plans (clinic_69/center_119)
-- Legacy plans remain for existing subscribers but limits match the new tiers.

UPDATE public.billing_plans
   SET limits = '{"users":3}'::jsonb,
       name = 'عيادة',
       name_en = 'Clinic',
       price_per_month = 6900,
       ask_boost = 0
 WHERE plan_id = 'advanced';

UPDATE public.billing_plans
   SET limits = '{"users":null}'::jsonb,
       name = 'مركز',
       name_en = 'Center',
       price_per_month = 11900,
       ask_boost = 1
 WHERE plan_id = 'center';

-- Do NOT delete legacy plans (existing subscribers keep their records).
