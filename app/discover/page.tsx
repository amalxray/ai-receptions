import type { Metadata } from 'next';
import { getDiscoverEntries, type DiscoverCenterEntry } from '@/lib/services/discoverDirectory';
import { DISCOVERY_PAGE_SIZE, type DiscoveryEntry } from '@/lib/services/doctorPublicProfile';
import { ACTIVITY_TYPE_LABELS_AR } from '@/lib/services/activityTypes';

/**
 * PP-8D — Discovery V1 (/discover): public directory of eligible doctors and centers.
 *
 * READ-ONLY public surface: shared search across doctor and center sections
 * with deterministic ordering and 20-per-page pagination — no ranking, no
 * reviews, no marketplace features (spec §9). Cards link to the existing
 * public profile pages; booking/chat CTAs remain untouched.
 *
 * Doctor eligibility is enforced by getDiscoveryEntries (PP-8A opt-in flag +
 * visibility + publishable type + active clinic + active/trialing subscription).
 * Center eligibility uses the activity-space opt-in and subscription gates.
 */

export const dynamic = 'force-dynamic';

/**
 * PP-8C/8D correctness: the directory must NEVER be served from Next's fetch
 * data cache (a cached subscriptions response would show stale eligibility).
 * Route-scoped opt-out — the shared supabaseAdmin client stays untouched.
 */
export const fetchCache = 'force-no-store';

export const metadata: Metadata = {
  title: 'دليل الأطباء والمراكز — ابحث عن طبيب أو مركز',
  description:
    'دليل عام للأطباء ومراكز الأشعة ومختبرات الأسنان المؤهلة على منصة AI-Receptions.',
  alternates: { canonical: '/discover' },
};

export type DiscoverPageProps = {
  searchParams?: {
    q?: string;
    specialty?: string;
    city?: string;
    page?: string;
  };
};

function clampParam(v: string | undefined, max: number): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t ? t.slice(0, max) : undefined;
}

function pageParam(v: string | undefined): number {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

function buildQuery(params: Record<string, string | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) qs.set(k, v);
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export default async function DiscoverPage({ searchParams }: DiscoverPageProps) {
  const sp = searchParams ?? {};
  const q = clampParam(sp.q, 100);
  const specialty = clampParam(sp.specialty, 120);
  const city = clampParam(sp.city, 100);
  const requestedPage = pageParam(sp.page);

  let result = {
    doctors: [] as DiscoveryEntry[],
    centers: [] as DiscoverCenterEntry[],
    doctorPagination: {
      total: 0,
      page: 1,
      pageSize: DISCOVERY_PAGE_SIZE,
      totalPages: 1,
    },
  };
  let loadError: string | null = null;
  try {
    result = await getDiscoverEntries({ q, specialty, city, page: requestedPage });
  } catch (e) {
    loadError = e instanceof Error ? e.message : 'تعذر تحميل الدليل';
  }

  const hasFilters = Boolean(q || specialty || city);
  const hasResults = result.doctors.length > 0 || result.centers.length > 0;

  return (
    <main dir="rtl" className="min-h-screen bg-stone-950 text-stone-100">
      <div className="mx-auto max-w-4xl px-4 py-10">
        <header className="mb-6 text-center">
          <h1 className="text-3xl font-bold text-white">دليل الأطباء والمراكز</h1>
          <p className="mt-2 text-sm text-stone-400">
            ابحث عن طبيب أو مركز شريك، وادخل إلى صفحته العامة.
            {/* تم إخفاء «أو تتحدث مع الاستقبال الذكي» — re-enable by uncommenting */}
          </p>
        </header>

        {loadError ? (
          <p className="rounded-xl border border-red-900 bg-red-950 p-4 text-sm text-red-300">
            تعذر تحميل الدليل الآن — جرّب لاحقًا.
          </p>
        ) : null}

        {/* ============ SEARCH — بسيطة وغير معقدة ============ */}
        <form
          method="get"
          className="mb-8 grid gap-3 rounded-xl border border-stone-800 bg-stone-900 p-4 sm:grid-cols-3"
        >
          <label className="block text-xs text-stone-400">
            اسم الطبيب أو المركز
            <input
              type="text"
              name="q"
              maxLength={100}
              defaultValue={q ?? ''}
              placeholder="مثال: أحمد"
              className="mt-1 w-full rounded-md border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-100"
            />
          </label>
          <label className="block text-xs text-stone-400">
            التخصص أو نوع المركز
            <input
              type="text"
              name="specialty"
              maxLength={120}
              defaultValue={specialty ?? ''}
              placeholder="مثال: تقويم أو مركز أشعة"
              className="mt-1 w-full rounded-md border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-100"
            />
          </label>
          <label className="block text-xs text-stone-400">
            المدينة / المنطقة
            <input
              type="text"
              name="city"
              maxLength={100}
              defaultValue={city ?? ''}
              placeholder="مثال: عمّان"
              className="mt-1 w-full rounded-md border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-100"
            />
          </label>
          <div className="flex items-center gap-3 sm:col-span-3">
            <button
              type="submit"
              className="rounded-md bg-teal-500 px-6 py-2 text-sm font-semibold text-stone-900 transition hover:bg-teal-400"
            >
              ابحث
            </button>
            {hasFilters && (
              <a href="/discover" className="text-xs text-stone-400 hover:underline">
                مسح الفلاتر
              </a>
            )}
          </div>
        </form>

        {!hasResults && !loadError ? (
          <p className="rounded-xl border border-dashed border-stone-700 p-6 text-center text-sm text-stone-500">
            لا نتائج مطابقة — جرّب اسمًا أو تخصصًا أو مدينة أخرى.
          </p>
        ) : hasResults ? (
          <div className="space-y-10">
            <section aria-labelledby="discover-doctors-heading">
              <h2 id="discover-doctors-heading" className="mb-4 text-2xl font-bold text-white">
                الأطباء
              </h2>
              {result.doctors.length === 0 ? (
                <p className="rounded-xl border border-dashed border-stone-700 p-6 text-center text-sm text-stone-500">
                  لا توجد نتائج مطابقة في قسم الأطباء.
                </p>
              ) : (
                <>
                  <p className="mb-4 text-xs text-stone-500">
                    {result.doctorPagination.total} نتيجة · صفحة {result.doctorPagination.page} من {result.doctorPagination.totalPages}
                  </p>
                  <ul className="grid gap-4 sm:grid-cols-2">
                    {result.doctors.map((entry) => (
                      <li key={entry.slug} className="rounded-xl border border-stone-800 bg-stone-900 p-4">
                        <a href={`/d/${encodeURIComponent(entry.slug)}`} className="group block">
                          <div className="flex items-center gap-3">
                            {entry.photo_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={entry.photo_url}
                                alt={`صورة ${entry.name}`}
                                className="h-14 w-14 rounded-full border border-teal-500/40 object-cover"
                              />
                            ) : (
                              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-teal-500/30 bg-stone-800 text-xl font-bold text-teal-300">
                                {entry.name.charAt(0)}
                              </div>
                            )}
                            <div>
                              <h2 className="font-semibold text-stone-100 group-hover:text-teal-300">
                                {entry.name}
                              </h2>
                              <p className="text-sm text-teal-300">
                                {entry.specialty ?? entry.title ?? 'مقدم رعاية أسنان'}
                              </p>
                              <p className="mt-0.5 text-xs text-stone-500">
                                {entry.clinicName}
                                {(entry.city || entry.area) &&
                                  ` · ${[entry.city, entry.area].filter(Boolean).join(' — ')}`}
                              </p>
                            </div>
                          </div>
                          <p className="mt-3 text-xs text-teal-300/80 group-hover:underline">
                            عرض الملف المهني ↗
                          </p>
                        </a>
                      </li>
                    ))}
                  </ul>

                  {result.doctorPagination.totalPages > 1 && (
                    <nav className="mt-8 flex items-center justify-center gap-4 text-sm">
                      {result.doctorPagination.page > 1 ? (
                        <a
                          href={`/discover${buildQuery({ q, specialty, city, page: String(result.doctorPagination.page - 1) })}`}
                          className="rounded-md border border-stone-700 px-4 py-2 text-stone-200 hover:border-stone-400"
                        >
                          السابق
                        </a>
                      ) : (
                        <span className="rounded-md border border-stone-800 px-4 py-2 text-stone-600">السابق</span>
                      )}
                      <span className="text-stone-500">
                        {result.doctorPagination.page} / {result.doctorPagination.totalPages}
                      </span>
                      {result.doctorPagination.page < result.doctorPagination.totalPages ? (
                        <a
                          href={`/discover${buildQuery({ q, specialty, city, page: String(result.doctorPagination.page + 1) })}`}
                          className="rounded-md border border-stone-700 px-4 py-2 text-stone-200 hover:border-stone-400"
                        >
                          التالي
                        </a>
                      ) : (
                        <span className="rounded-md border border-stone-800 px-4 py-2 text-stone-600">التالي</span>
                      )}
                    </nav>
                  )}
                </>
              )}
            </section>

            {result.centers.length > 0 && (
              <section aria-labelledby="discover-centers-heading">
                <h2 id="discover-centers-heading" className="mb-4 text-2xl font-bold text-white">
                  🏥 المراكز الشريكة
                </h2>
                <ul className="grid gap-4 sm:grid-cols-2">
                  {result.centers.map((center) => (
                    <li key={center.id} className="rounded-xl border border-stone-800 bg-stone-900 p-4">
                      <div className="mb-3 inline-flex rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-1 text-xs font-semibold text-teal-300">
                        {ACTIVITY_TYPE_LABELS_AR[center.activityType]}
                      </div>
                      <h3 className="text-lg font-semibold text-stone-100">{center.name}</h3>
                      <p className="mt-1 text-sm text-stone-400">
                        {center.city ?? center.area ?? 'الموقع قيد التحديد'}
                      </p>
                      {center.address && (
                        <p className="mt-1 text-xs text-stone-500">{center.address}</p>
                      )}
                      {center.description && (
                        <p className="mt-3 line-clamp-3 text-sm text-stone-300">
                          {center.description}
                        </p>
                      )}
                      <a
                        href={`/c/${encodeURIComponent(center.slug)}`}
                        className="mt-4 inline-flex rounded-md bg-teal-500 px-4 py-2 text-sm font-semibold text-stone-900 transition hover:bg-teal-400"
                      >
                        عرض الملف ↗
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        ) : null}

        <footer className="mt-12 text-center text-xs text-stone-600">
          © AI-Receptions · دليل الأطباء والمراكز ·{' '}
          <a href="/" className="hover:underline">
            منصة الاستقبال الذكي للعيادات
          </a>
        </footer>
      </div>
    </main>
  );
}

