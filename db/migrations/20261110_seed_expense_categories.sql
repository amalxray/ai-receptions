INSERT INTO public.clinic_expense_categories (clinic_id, name, is_active)
SELECT clinics.id, categories.name, true
FROM public.clinics AS clinics
CROSS JOIN (
  VALUES ('تأمين'::text), ('ترخيص وزارة الصحة'::text)
) AS categories(name)
WHERE clinics.deleted_at IS NULL
ON CONFLICT (clinic_id, name) DO NOTHING;
