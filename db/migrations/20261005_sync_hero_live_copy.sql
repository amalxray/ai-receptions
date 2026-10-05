-- Keep the production Hero appearance unchanged while moving its copy to the CMS.
-- Only migrate the untouched historical seed row; customized Hero content is preserved.
UPDATE public.landing_page_content
SET content = content || jsonb_build_object(
    'headline1', 'استقبالك لا ينام، ومرضاك يحجزون',
    'headline2', 'حتى وأنت في غرفة العلاج.',
    'paragraph', 'كل مكالمة فائتة… مريض يذهب لعيادة أخرى، والفرصة تضيع في ثوانٍ.',
    'description', 'منصة AI-Receptions تشتغل كموظفة استقبال ذكية، تستقبل المرضى، ترد على الأسئلة، وتحجز المواعيد بوضوح، حتى عندما يكون الطبيب في الجلسة أو خارج الدوام.',
    'ctaPrimary', 'ابدأ تجربتك المجانية لمدة 30 يوماً',
    'ctaPrimaryHref', '/register',
    'ctaSecondary', 'شاهد كيف يعمل',
    'ctaSecondaryHref', '#how-it-works',
    'stats', '[{"value":"24/7","label":"متاحة دايماً"},{"value":"<3s","label":"سرعة الرد"},{"value":"100%","label":"فهم اللهجة"}]'::jsonb
),
updated_at = NOW()
WHERE section_key = 'hero'
  AND jsonb_object_length(content) = 6
  AND content ->> 'headline1' = 'كل مكالمة ما ردّيت عليها'
  AND content ->> 'headline2' = 'مريض راح لعيادة تانية'
  AND content ->> 'paragraph' = 'عيادتك بتحتاج موظفة استقبال ما بتنام، ما بتاخد إجازة، وما بتفوّت ولا مريض — بترد بلهجته العامية، بتحجزله موعد فوراً، وبتجاوبه على مدار الساعة.'
  AND content ->> 'ctaPrimary' = 'جرّب المحادثة الآن ←'
  AND content ->> 'ctaSecondary' = 'شوف كيف يشتغل'
  AND content -> 'stats' = '[{"value":"24/7","label":"متاحة دايماً"},{"value":"<3s","label":"سرعة الرد"},{"value":"100%","label":"فهم اللهجة"}]'::jsonb;
