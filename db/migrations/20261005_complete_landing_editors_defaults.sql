-- Seed display copy for the landing pricing editor only when no pricing row exists.
-- This changes presentation copy, not billing_plans or checkout prices.
INSERT INTO public.landing_page_content (section_key, content)
VALUES (
  'pricing',
  '{"title":"اختر الخطة التي تناسب نمو عيادتك","badge":"🔒 الأعضاء المؤسسون • مقاعد محدودة فعلياً","highlightedLabel":"⭐ الأعضاء المؤسسون","monthlyLabel":"شهري","yearlyLabel":"سنوي (شهران مجاناً)","trialTitle":"جرّب 30 يوماً مجاناً","trialDescription":"كل ميزات \"متقدمة\" — بدون بطاقة ائتمانية","trialCta":"ابدأ الآن","yearlyNote":"أسعار بالدولار الأمريكي • لا تحتاج إلى التزام سريع • السعر يبقى لك للأبد إذا سجلت مبكراً","trialNote":"جرّب 30 يوماً مجاناً • كل ميزات المتقدمة — بدون بطاقة","footerText":"تبدأ بالتجربة المجانية 30 يوماً بكل ميزات المتقدمة.","footerLinkText":"ابدأ التجربة المجانية","tiers":[{"id":"basic","title":"أساسية","monthly":"$39","yearly":"$399","note":"عيادة واحدة — للممارسة الفردية","features":["عيادة واحدة","حتى 500 مريض","مستخدم واحد","محادثات AI غير محدودة"],"highlighted":false,"buttonText":"اشترك الآن 🚀"},{"id":"advanced","title":"الأعضاء المؤسسون","monthly":"$69","yearly":"$699","note":"مقاعد محدودة فعلياً • السعر يبقى لك للأبد","features":["عيادات متعددة","مرضى غير محدود","4 مستخدمين","فواتير ومدفوعات","واتساب + إشعارات","تقارير"],"highlighted":true,"buttonText":"اشترك الآن 🚀"},{"id":"center","title":"مركز","monthly":"$119","yearly":"$1199","note":"لمراكز الأشعة والمختبرات والسلاسل","features":["عيادات غير محدودة","10 مستخدمين","قبل/بعد Gallery","شارات إنجازات","تحليلات متقدمة","أولوية الدعم"],"highlighted":false,"buttonText":"اشترك الآن 🚀"}]}'::jsonb
)
ON CONFLICT (section_key) DO NOTHING;

-- Update only the untouched historic urgency/colors seed rows. Any customized row is preserved.
UPDATE public.landing_page_content
SET content = '{"text":"عرض التأسيس — أول 100 طبيب بس بسعر ثابت مدى الحياة. باقي","suffix":"مكان","cta":"احجز مكانك","backgroundColor":"#fff7ed","textColor":"#0f172a","tickerSpeed":"off"}'::jsonb,
    updated_at = NOW()
WHERE section_key = 'urgency_bar'
  AND content = '{"text":"عرض التأسيس — أول 100 طبيب بس بسعر ثابت مدى الحياة. باقي","suffix":"مكان","cta":"احجز مكانك"}'::jsonb;

UPDATE public.landing_page_content
SET content = '{"primary":"#8B5CF6","secondary":"#22D3EE","cta":"#0F172A"}'::jsonb,
    updated_at = NOW()
WHERE section_key = 'colors'
  AND content = '{"cta":"","primary":"","secondary":""}'::jsonb;
