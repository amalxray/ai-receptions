import type { Metadata } from 'next';
import Link from 'next/link';
import AskChat from '@/components/ask/AskChat';
import { getAskPageData } from '@/lib/services/askPageData';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function generateMetadata(): Promise<Metadata> {
  const { settings } = await getAskPageData();
  const hero = (settings.hero ?? {}) as { title?: string; subtitle?: string };
  return {
    title: hero.title || 'AI-Receptions — استشارة ذكية',
    description: hero.subtitle || undefined,
  };
}

export default async function AskPage() {
  const { settings, tips, articles, stories, faq } = await getAskPageData();
  const hero = (settings.hero ?? {}) as { title: string; subtitle: string; logo: string; assistant_name: string };
  const colors = (settings.colors ?? {}) as { primary?: string; secondary?: string; heading?: string; warning?: string };
  const sections = (settings.sections ?? {}) as Record<string, boolean>;
  const questions = (settings.questions ?? []) as string[];
  const on = (k: string) => sections[k] !== false;
  const published = (articles as Array<Record<string, unknown>>).filter((a) => a.slug);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100" dir="rtl">
      {/* Hero + Chat */}
      {on('hero') && (
        <section className="relative mx-auto max-w-4xl px-4 pb-10 pt-14 text-center">
          <div className="pointer-events-none absolute inset-0 -z-10" style={{ background: `radial-gradient(60% 60% at 50% 0%, ${colors.primary || '#10B981'}22, transparent)` }} />
          <span className="inline-grid h-20 w-20 place-items-center rounded-3xl bg-gradient-to-br from-emerald-400 to-cyan-500 text-4xl shadow-xl">{hero.logo ?? '🦷'}</span>
          <h1 className="mt-5 font-black text-white" style={{ fontSize: '2rem' }}>{hero.title ?? 'كيف يمكنني مساعدتك؟'}</h1>
          <p className="mx-auto mt-2 max-w-xl text-slate-400">{hero.subtitle ?? 'اكتب مشكلتك، وسأساعدك في العثور على أفضل طبيب قريب منك'}</p>
          <div className="mt-8 text-right">
            <AskChat assistantName={hero.assistant_name ?? 'سنّي'} logo={hero.logo ?? '🦷'} quickQuestions={on('quick_questions') ? questions : []} />
          </div>
        </section>
      )}

      {/* Tips */}
      {on('tips') && (tips as Array<Record<string, unknown>>).length > 0 && (
        <section className="mx-auto max-w-4xl px-4 py-10">
          <h2 className="text-center font-black" style={{ color: colors.heading || '#7C3AED' }}>💡 نصائح مهمة لصحتك</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {(tips as Array<Record<string, unknown>>).slice(0, 3).map((t) => (
              <div key={String(t.id)} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-2xl">{String(t.icon ?? '💡')}</p>
                <p className="mt-2 font-bold text-slate-100">{String(t.title)}</p>
                <p className="mt-1 line-clamp-3 text-sm text-slate-400">{String(t.content)}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Articles */}
      {on('articles') && published.length > 0 && (
        <section className="mx-auto max-w-4xl px-4 py-10">
          <h2 className="text-center font-black" style={{ color: colors.heading || '#7C3AED' }}>📝 مقالات مفيدة</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {published.slice(0, 6).map((a) => (
              <Link key={String(a.id)} href={`/ask/article/${a.slug}`} className="group rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:border-cyan-400/40">
                {(a.featured_image as { image_url?: string } | null)?.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={(a.featured_image as { image_url?: string }).image_url!} alt={String(a.title)} className="mb-3 h-32 w-full rounded-xl object-cover" loading="lazy" />
                )}
                <p className="font-bold text-slate-100 group-hover:text-cyan-300">{String(a.title)}</p>
                {a.excerpt ? <p className="mt-1 line-clamp-2 text-sm text-slate-400">{String(a.excerpt)}</p> : null}
                <p className="mt-2 text-xs text-cyan-400">اقرأ المزيد ←</p>
              </Link>
            ))}
          </div>
          <p className="mt-4 text-center text-sm"><Link href="/ask/articles" className="text-cyan-400 hover:text-cyan-300">كل المقالات ←</Link></p>
        </section>
      )}

      {/* Success stories (simple carousel) */}
      {on('stories') && (stories as Array<Record<string, unknown>>).length > 0 && (
        <section className="mx-auto max-w-4xl px-4 py-10">
          <h2 className="text-center font-black" style={{ color: colors.heading || '#7C3AED' }}>💚 قصص من مرضانا</h2>
          <div className="mt-6 flex snap-x gap-4 overflow-x-auto pb-4">
            {(stories as Array<Record<string, unknown>>).map((s) => (
              <div key={String(s.id)} className="w-72 shrink-0 snap-center rounded-2xl border border-white/10 bg-white/5 p-4">
                {typeof s.image_url === 'string' && s.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.image_url} alt={String(s.patient_name)} className="mb-3 h-28 w-full rounded-xl object-cover" loading="lazy" />
                )}
                <p className="text-amber-400">{'★'.repeat(Number(s.rating ?? 5))}</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">{String(s.content).slice(0, 160)}…</p>
                <p className="mt-3 text-xs font-bold text-slate-200">— {String(s.patient_name)}{s.patient_city ? ` · ${String(s.patient_city)}` : ''}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Fun facts marquee */}
      {on('fun_facts') && (tips as Array<Record<string, unknown>>).filter((t) => t.category === 'fun_fact').length > 0 && (
        <div className="overflow-hidden border-y border-white/10 bg-white/5 py-2">
          <div className="flex w-max gap-10 px-4 text-sm text-cyan-200" style={{ animation: 'ticker 30s linear infinite' }}>
            {(tips as Array<Record<string, unknown>>).filter((t) => t.category === 'fun_fact').map((t) => (
              <span key={String(t.id)}>{String(t.icon ?? '✨')} {String(t.title)}</span>
            ))}
          </div>
        </div>
      )}

      {/* FAQ accordion */}
      {on('faq') && (faq as Array<Record<string, unknown>>).length > 0 && (
        <section className="mx-auto max-w-3xl px-4 py-10">
          <h2 className="text-center font-black" style={{ color: colors.heading || '#7C3AED' }}>❓ أسئلة شائعة</h2>
          <div className="mt-6 space-y-2">
            {(faq as Array<Record<string, unknown>>).map((f) => (
              <details key={String(f.id)} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <summary className="cursor-pointer text-sm font-bold text-slate-100">{String(f.question)}</summary>
                <p className="mt-2 text-sm leading-6 text-slate-400">{String(f.answer)}</p>
              </details>
            ))}
          </div>
        </section>
      )}

      {/* CTA */}
      {on('cta') && (
        <section className="mx-auto max-w-3xl px-4 py-14 text-center">
          <h2 className="text-2xl font-black text-white">جاهز تحجز موعدك؟</h2>
          <p className="mt-2 text-slate-400">اكتب مشكلتك في المحادثة فوق، وسنوجّهك لأقرب طبيب — أو تصفح العيادات مباشرة.</p>
          <Link href="/discover" className="mt-5 inline-block rounded-full px-8 py-3 text-sm font-bold text-slate-950 transition hover:opacity-90" style={{ background: colors.primary || '#10B981' }}>
            🏥 تصفح العيادات والمراكز
          </Link>
        </section>
      )}

      <footer className="border-t border-white/10 py-6 text-center text-sm text-slate-500">
        <nav className="flex flex-wrap justify-center gap-4">
          <Link href="/ask/articles" className="hover:text-cyan-300">📝 المقالات</Link>
          <Link href="/ask/stories" className="hover:text-cyan-300">💚 قصص النجاح</Link>
          <Link href="/ask/tips" className="hover:text-cyan-300">💡 النصائح</Link>
          <Link href="/ask/faq" className="hover:text-cyan-300">❓ الأسئلة الشائعة</Link>
          <Link href="/ask/about" className="hover:text-cyan-300">عن المنصة</Link>
          <Link href="/ask/privacy" className="hover:text-cyan-300">الخصوصية</Link>
          <Link href="/ask/terms" className="hover:text-cyan-300">الشروط</Link>
        </nav>
        <p className="mt-3">AI-Receptions © — موظفة استقبال ذكية لكل عيادة</p>
      </footer>
      <style>{`@keyframes ticker{from{transform:translateX(0)}to{transform:translateX(50%)}}`}</style>
    </main>
  );
}
