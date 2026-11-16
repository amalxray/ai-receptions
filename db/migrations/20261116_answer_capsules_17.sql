BEGIN;

UPDATE public.platform_articles
SET content = CASE
      WHEN content ~* '^<div class="answer-capsule">' THEN content
      ELSE '<div class="answer-capsule"><p><strong>الإجابة السريعة:</strong> تجربة مريض الأسنان تبدأ من أول استفسار، لا عند كرسي العلاج؛ لذلك حسّن التواصل والحجز والاستقبال والزيارة والمتابعة كرحلة واحدة. أجب عن الرسائل والهاتف بوضوح، أكّد الموعد وأرسل تذكيراً، ثم تابع بعد الزيارة. راجع نقاط الانتظار والتأخير بانتظام، واطلب ملاحظات المرضى لتحسين الخدمة دون كشف معلوماتهم.</p></div>' ||
        regexp_replace(content, '^(<br\s*/?>\s*)?<h2[^>]*>\s*الإجابة السريعة\s*</h2>(\s*(<br\s*/?>\s*)*<p\b[^>]*>.*?</p>)?', '', 'is')
    END,
    updated_at = now()
WHERE slug = 'رحلة-المريض-في-عيادة-الأسنان-كيف-تحسن-تجربته-من-أول-اتصال-حتى-انتهاء-الزيارة؟'
  AND status = 'published'
  AND content NOT ILIKE '<div class="answer-capsule">%';

UPDATE public.platform_articles
SET content = CASE
      WHEN content ~* '^<div class="answer-capsule">' THEN content
      ELSE '<div class="answer-capsule"><p><strong>الإجابة السريعة:</strong> أتمتة المهام المتكررة في عيادة الأسنان تنظّم العمل ولا تعني الاستغناء عن الموظفين. ابدأ بالرد على الاستفسارات، تأكيد المواعيد وتذكير المرضى، ثم تنظيم الطلبات والمعلومات. أبقِ الحالات الحساسة والتواصل الذي يحتاج تعاطفاً بيد الفريق، وراجع دقة الرسائل والحجوزات قبل اعتماد النظام.</p></div>' ||
        regexp_replace(content, '^(<br\s*/?>\s*)?<h2[^>]*>\s*الإجابة السريعة\s*</h2>(\s*(<br\s*/?>\s*)*<p\b[^>]*>.*?</p>)?', '', 'is')
    END,
    updated_at = now()
WHERE slug = 'مهام-إدارية-يمكن-أتمتتها-في-عيادة-الأسنان-اليوم'
  AND status = 'published'
  AND content NOT ILIKE '<div class="answer-capsule">%';

UPDATE public.platform_articles
SET content = CASE
      WHEN content ~* '^<div class="answer-capsule">' THEN content
      ELSE '<div class="answer-capsule"><p><strong>الإجابة السريعة:</strong> ظهور عيادة الأسنان في Google Maps يبدأ بملف Google Business Profile موثّق ومكتمل، لا بمجرد إنشاء الملف. أدخل الاسم والعنوان والهاتف وساعات العمل والتصنيف الصحيح، وأضف الموقع والخدمات، ثم حافظ على اتساق البيانات واجمع مراجعات حقيقية. لا يمكن ضمان ترتيب محدد؛ فالنتائج تتأثر بملاءمة البحث والمسافة والسمعة.</p></div>' ||
        regexp_replace(content, '^(<br\s*/?>\s*)?<h2[^>]*>\s*الإجابة السريعة\s*</h2>(\s*(<br\s*/?>\s*)*<p\b[^>]*>.*?</p>)?', '', 'is')
    END,
    updated_at = now()
WHERE slug = 'كيف-تظهر-عيادة-الأسنان-في-نتائج-google-maps؟-دليل-تحسين-الظهور-المحلي'
  AND status = 'published'
  AND content NOT ILIKE '<div class="answer-capsule">%';

UPDATE public.platform_articles
SET content = CASE
      WHEN content ~* '^<div class="answer-capsule">' THEN content
      ELSE '<div class="answer-capsule"><p><strong>الإجابة السريعة:</strong> زيادة الحجوزات دون رفع ميزانية الإعلانات تبدأ بتحويل الاستفسارات الحالية إلى مواعيد مؤكدة. سهّل الوصول إلى الهاتف وواتساب والحجز، وردّ سريعاً بمعلومات واضحة عن الخدمة والخطوة التالية، ثم تابع من لم يؤكد الموعد. راجع أين يتوقف المرضى في الرحلة، ولا تعدهم بتوفر موعد قبل التحقق.</p></div>' ||
        regexp_replace(content, '^(<br\s*/?>\s*)?<h2[^>]*>\s*الإجابة السريعة\s*</h2>(\s*(<br\s*/?>\s*)*<p\b[^>]*>.*?</p>)?', '', 'is')
    END,
    updated_at = now()
WHERE slug = 'كيف-تزيد-حجوزات-عيادة-الأسنان-دون-زيادة-ميزانية-الإعلانات؟'
  AND status = 'published'
  AND content NOT ILIKE '<div class="answer-capsule">%';

UPDATE public.platform_articles
SET content = CASE
      WHEN content ~* '^<div class="answer-capsule">' THEN content
      ELSE '<div class="answer-capsule"><p><strong>الإجابة السريعة:</strong> تعامل مع المراجعة السلبية بهدوء ومهنية؛ انتظر حتى تهدأ قبل الرد، واشكر المريض واعترف بالمشكلة واعتذر عند الحاجة. انقل تفاصيل الحالة إلى اتصال خاص، ثم تابع السبب داخلياً ودرّب الفريق. لا تجادل علناً ولا تكشف أي معلومات صحية أو شخصية، حتى لو ذكرها صاحب المراجعة.</p></div>' ||
        regexp_replace(content, '^(<br\s*/?>\s*)?<h2[^>]*>\s*الإجابة السريعة\s*</h2>(\s*(<br\s*/?>\s*)*<p\b[^>]*>.*?</p>)?', '', 'is')
    END,
    updated_at = now()
WHERE slug = 'تقييمات-المرضى-لعيادة-الأسنان-كيف-تتعامل-مع-المراجعات-السلبية؟'
  AND status = 'published'
  AND content NOT ILIKE '<div class="answer-capsule">%';

UPDATE public.platform_articles
SET content = CASE
      WHEN content ~* '^<div class="answer-capsule">' THEN content
      ELSE '<div class="answer-capsule"><p><strong>الإجابة السريعة:</strong> لتحويل المكالمات الفائتة إلى حجوزات، سجّل الاتصالات التي لم يُرد عليها وأعد التواصل سريعاً عبر الهاتف أو واتساب. ضع تغطية خارج الدوام، واستخدم رداً آلياً يجيب عن الأسئلة الشائعة ويبدأ الحجز عند ملاءمته. لا تعتبر كل اتصال حجزاً مؤكداً؛ تحقّق من الموعد مع المريض.</p></div>' ||
        regexp_replace(content, '^(<br\s*/?>\s*)?<h2[^>]*>\s*الإجابة السريعة\s*</h2>(\s*(<br\s*/?>\s*)*<p\b[^>]*>.*?</p>)?', '', 'is')
    END,
    updated_at = now()
WHERE slug = 'كيف-تحوّل-مكالمات-عيادة-الأسنان-الفائتة-إلى-حجوزات؟'
  AND status = 'published'
  AND content NOT ILIKE '<div class="answer-capsule">%';

UPDATE public.platform_articles
SET content = CASE
      WHEN content ~* '^<div class="answer-capsule">' THEN content
      ELSE '<div class="answer-capsule"><p><strong>الإجابة السريعة:</strong> ألم الأسنان الليلي قد يرتبط بتسوس أو التهاب أو أسباب أخرى، وتخفيفه حتى الصباح مؤقت لا يغني عن فحص طبيب الأسنان. استخدم المسكن فقط وفق إرشاد الطبيب أو الصيدلي، وضع كمادة باردة على الخد 15 دقيقة ثم أرحه 15 دقيقة. اطلب رعاية عاجلة عند تورم شديد أو صعوبة التنفس أو البلع.</p></div>' ||
        regexp_replace(content, '^(<br\s*/?>\s*)?<h2[^>]*>\s*الإجابة السريعة\s*</h2>(\s*(<br\s*/?>\s*)*<p\b[^>]*>.*?</p>)?', '', 'is')
    END,
    updated_at = now()
WHERE slug = 'لم-الأسنان-المفاجئ-ليلاً-حلول-مؤقتة-حتى-الصباح'
  AND status = 'published'
  AND content NOT ILIKE '<div class="answer-capsule">%';

UPDATE public.platform_articles
SET content = CASE
      WHEN content ~* '^<div class="answer-capsule">' THEN content
      ELSE '<div class="answer-capsule"><p><strong>الإجابة السريعة:</strong> لا تحتاج العيادة بالضرورة إلى برامج كثيرة؛ الأهم أن تتكامل أدوات المواعيد وملفات المرضى والفواتير والتواصل والتقارير. ارسم سير العمل أولاً، وحدد أين تُكرر البيانات أو تضيع المتابعة، ثم اختر نظاماً يربط العمليات الأساسية. تحقق من الصلاحيات والنسخ الاحتياطي وتدريب الفريق قبل نقل بيانات المرضى.</p></div>' ||
        regexp_replace(content, '^(<br\s*/?>\s*)?<h2[^>]*>\s*الإجابة السريعة\s*</h2>(\s*(<br\s*/?>\s*)*<p\b[^>]*>.*?</p>)?', '', 'is')
    END,
    updated_at = now()
WHERE slug = 'هل-تحتاج-عيادة-الأسنان-إلى-أكثر-من-برنامج؟-دليل-الطبيب-لبناء-عيادة-رقمية-متكاملة'
  AND status = 'published'
  AND content NOT ILIKE '<div class="answer-capsule">%';

UPDATE public.platform_articles
SET content = CASE
      WHEN content ~* '^<div class="answer-capsule">' THEN content
      ELSE '<div class="answer-capsule"><p><strong>الإجابة السريعة:</strong> الذكاء الاصطناعي لا يعرف تفاصيل عيادة الأسنان تلقائياً؛ يحتاج معلومات موثوقة ومحدّثة عن الخدمات والأطباء والمواعيد والأسعار والموقع. نظّم هذه البيانات في مصدر واضح، وحدد ما يجب أن يفعله عند غياب الإجابة أو تعارضها، مثل إحالة السؤال لموظف. لا تتركه يخمّن معلومات طبية أو مواعيد غير متاحة.</p></div>' ||
        regexp_replace(content, '^(<br\s*/?>\s*)?<h2[^>]*>\s*الإجابة السريعة\s*</h2>(\s*(<br\s*/?>\s*)*<p\b[^>]*>.*?</p>)?', '', 'is')
    END,
    updated_at = now()
WHERE slug = 'كيف-يفهم-الذكاء-الاصطناعي-عيادة-الأسنان-ويجيب-المرضى-من-معلوماتها؟'
  AND status = 'published'
  AND content NOT ILIKE '<div class="answer-capsule">%';

UPDATE public.platform_articles
SET content = CASE
      WHEN content ~* '^<div class="answer-capsule">' THEN content
      ELSE '<div class="answer-capsule"><p><strong>الإجابة السريعة:</strong> قد تفقد العيادة مريضاً محتملاً قبل الحجز عندما يجد معلومات ناقصة أو لا يعرف الخدمة المناسبة أو لا يرى طريقاً واضحاً للتواصل. وضّح الخدمات والأطباء وموقع العيادة، واجعل الاتصال والحجز بخطوات قليلة، وأجب عن الاستفسار بسرعة. راقب الاستفسارات التي لم تتحول لمواعيد، ثم حسّن موضع التعثر.</p></div>' ||
        regexp_replace(content, '^(<br\s*/?>\s*)?<h2[^>]*>\s*الإجابة السريعة\s*</h2>(\s*(<br\s*/?>\s*)*<p\b[^>]*>.*?</p>)?', '', 'is')
    END,
    updated_at = now()
WHERE slug = 'لماذا-تفقد-عيادات-الأسنان-مرضى-محتملين-قبل-أن-يحجزوا؟'
  AND status = 'published'
  AND content NOT ILIKE '<div class="answer-capsule">%';

UPDATE public.platform_articles
SET content = CASE
      WHEN content ~* '^<div class="answer-capsule">' THEN content
      ELSE '<div class="answer-capsule"><p><strong>الإجابة السريعة:</strong> الاستقبال الذكي يتيح للمريض التواصل خارج ساعات الدوام، وطرح الأسئلة الشائعة، والتعرّف على الخدمات وبدء طلب حجز بحسب بيانات العيادة. جهّز معلومات محدثة وقواعد واضحة للتحويل إلى الفريق، واطلب بيانات المريض الضرورية فقط. لا تجعله يشخّص الألم أو يؤكد موعداً قبل التحقق من توفره.</p></div>' ||
        regexp_replace(content, '^(<br\s*/?>\s*)?<h2[^>]*>\s*الإجابة السريعة\s*</h2>(\s*(<br\s*/?>\s*)*<p\b[^>]*>.*?</p>)?', '', 'is')
    END,
    updated_at = now()
WHERE slug = 'كيف-يعمل-الاستقبال-الذكي-لعيادة-الأسنان-على-مدار-24-ساعة؟'
  AND status = 'published'
  AND content NOT ILIKE '<div class="answer-capsule">%';

UPDATE public.platform_articles
SET content = CASE
      WHEN content ~* '^<div class="answer-capsule">' THEN content
      ELSE '<div class="answer-capsule"><p><strong>الإجابة السريعة:</strong> موظف الاستقبال بالذكاء الاصطناعي نظام برمجي يرد على استفسارات المرضى، يفهم طلباتهم، ويوجّههم إلى معلومات أو إجراءات استقبال محددة، مثل بدء حجز. زوّده بمعلومات العيادة وقواعدها، وراقب دقة الردود. هو طبقة مساندة للفريق، وليس بديلاً تلقائياً عن الموظف أو عن التقييم الطبي.</p></div>' ||
        regexp_replace(content, '^(<br\s*/?>\s*)?<h2[^>]*>\s*الإجابة السريعة\s*</h2>(\s*(<br\s*/?>\s*)*<p\b[^>]*>.*?</p>)?', '', 'is')
    END,
    updated_at = now()
WHERE slug = 'ما-هو-موظف-الاستقبال-بالذكاء-الاصطناعي-لعيادات-الأسنان؟-الدليل-الكامل'
  AND status = 'published'
  AND content NOT ILIKE '<div class="answer-capsule">%';

UPDATE public.platform_articles
SET content = CASE
      WHEN content ~* '^<div class="answer-capsule">' THEN content
      ELSE '<div class="answer-capsule"><p><strong>الإجابة السريعة:</strong> لا يلزم أن يكون موعد التنظيف المهني كل ستة أشهر مناسباً للجميع؛ يحدد طبيب الأسنان الفاصل وفق حالة اللثة وتراكم الجير وعوامل الخطورة. تذكر المقالة أن الجلسة في نابلس تستغرق 30–45 دقيقة وتكلف 80–150 شيكلاً. اسأل عن الفحص والتلميع وما يشمله السعر، وراجع الطبيب لتحديد الموعد المناسب لك.</p></div>' ||
        regexp_replace(content, '^(<br\s*/?>\s*)?<h2[^>]*>\s*الإجابة السريعة\s*</h2>(\s*(<br\s*/?>\s*)*<p\b[^>]*>.*?</p>)?', '', 'is')
    END,
    updated_at = now()
WHERE slug = 'dental-cleaning-every-6-months'
  AND status = 'published'
  AND content NOT ILIKE '<div class="answer-capsule">%';

UPDATE public.platform_articles
SET content = CASE
      WHEN content ~* '^<div class="answer-capsule">' THEN content
      ELSE '<div class="answer-capsule"><p><strong>الإجابة السريعة:</strong> قد يبدأ تسوس الأسنان ببقعة بيضاء قبل ظهور الألم؛ لذلك لا تنتظر وجعاً لتطلب الفحص. يذكر المقال أن المراحل المبكرة قد تستفيد من الفلورايد وتحسين العناية الغذائية، بينما الحفرة تحتاج تقييماً وعلاجاً عند الطبيب. نظّف بين الأسنان وقلل تكرار السكريات، وراجع الطبيب عند الحساسية أو تغيّر سطح السن.</p></div>' ||
        regexp_replace(content, '^(<br\s*/?>\s*)?<h2[^>]*>\s*الإجابة السريعة\s*</h2>(\s*(<br\s*/?>\s*)*<p\b[^>]*>.*?</p>)?', '', 'is')
    END,
    updated_at = now()
WHERE slug = 'tooth-decay-symptoms-prevention'
  AND status = 'published'
  AND content NOT ILIKE '<div class="answer-capsule">%';

UPDATE public.platform_articles
SET content = CASE
      WHEN content ~* '^<div class="answer-capsule">' THEN content
      ELSE '<div class="answer-capsule"><p><strong>الإجابة السريعة:</strong> اختر مركز تصوير الأسنان بحسب حاجة الطبيب وجودة الخدمة، لا السعر وحده. اسأل عن جهاز رقمي وخيار جرعة منخفضة، وتوفر الفحص المطلوب، وتسليم الصور رقمياً بصيغة DICOM، ووقت استلام النتيجة والسعر قبل التصوير. اطلب من طبيبك تحديد نوع الصورة ومنطقة التصوير، خصوصاً إذا كان الفحص لطفل أو سيتكرر.</p></div>' ||
        regexp_replace(content, '^(<br\s*/?>\s*)?<h2[^>]*>\s*الإجابة السريعة\s*</h2>(\s*(<br\s*/?>\s*)*<p\b[^>]*>.*?</p>)?', '', 'is')
    END,
    updated_at = now()
WHERE slug = 'choose-imaging-center-nablus'
  AND status = 'published'
  AND content NOT ILIKE '<div class="answer-capsule">%';

UPDATE public.platform_articles
SET content = CASE
      WHEN content ~* '^<div class="answer-capsule">' THEN content
      ELSE '<div class="answer-capsule"><p><strong>الإجابة السريعة:</strong> يورد دليل نابلس 2026 أسعاراً تبدأ من 20 شيكلاً للأشعة الوتدية، ونحو 30 للبانوراما، و70–300 للتصوير المقطعي CBCT بحسب حجم الحقل. يتغير السعر أيضاً مع نوع الجهاز وطريقة تسليم الصورة. اسأل عن السعر النهائي والفحص المطلوب وملف DICOM قبل الحجز، ولا تختَر تصويراً دون طلب طبي.</p></div>' ||
        regexp_replace(content, '^(<br\s*/?>\s*)?<h2[^>]*>\s*الإجابة السريعة\s*</h2>(\s*(<br\s*/?>\s*)*<p\b[^>]*>.*?</p>)?', '', 'is')
    END,
    updated_at = now()
WHERE slug = 'dental-imaging-prices-nablus-2026'
  AND status = 'published'
  AND content NOT ILIKE '<div class="answer-capsule">%';

UPDATE public.platform_articles
SET content = CASE
      WHEN content ~* '^<div class="answer-capsule">' THEN content
      ELSE '<div class="answer-capsule"><p><strong>الإجابة السريعة:</strong> البانوراما صورة ثنائية الأبعاد عامة، أما CBCT فيوفر صورة ثلاثية الأبعاد وقياسات أدق عند الحاجة. يذكر الدليل أن البانوراما تستغرق نحو 15 ثانية وتبدأ من 30 شيكلاً، بينما CBCT في نابلس 70–300 شيكل. يختار طبيب الأسنان النوع وفق السؤال السريري؛ دعه يحدد إن كانت التفاصيل الإضافية ستغيّر القرار.</p></div>' ||
        regexp_replace(content, '^(<br\s*/?>\s*)?<h2[^>]*>\s*الإجابة السريعة\s*</h2>(\s*(<br\s*/?>\s*)*<p\b[^>]*>.*?</p>)?', '', 'is')
    END,
    updated_at = now()
WHERE slug = 'cbct-vs-panorama-difference'
  AND status = 'published'
  AND content NOT ILIKE '<div class="answer-capsule">%';

COMMIT;
