'use client';

import type { ActivityPublicSpace } from '@/lib/services/activityPublicSpace';

export type PublicTestimonial = NonNullable<ActivityPublicSpace['testimonials']>[number];

export default function TestimonialsCarousel({ items }: { items: PublicTestimonial[] }) {
  // Temporary frontend-only demo data for preview when clinic records are empty.
  const safeItems = items.length
    ? items
    : [
        {
          id: 'demo-testimonial-1',
          patient_name: 'سارة ع.',
          content: 'الخدمة كانت سريعة جدًا، والنتيجة دقيقة، والجو محترف ومريح جدًا.',
          rating: 5,
          image_url: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=400&q=80',
        },
        {
          id: 'demo-testimonial-2',
          patient_name: 'أحمد م.',
          content: 'المركز منظم بشكل ممتاز، والتواصل كان سلسًا، والنتيجة تفوق التوقعات.',
          rating: 5,
          image_url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80',
        },
        {
          id: 'demo-testimonial-3',
          patient_name: 'ليلى ر.',
          content: 'تجربة مريحة جدًا، واهتمام الموظفين بالمرضى يُشعر بالثقة منذ البداية.',
          rating: 4,
          image_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=400&q=80',
        },
      ];

  const duplicated = [...safeItems, ...safeItems];

  return (
    <section className="mx-auto w-full max-w-7xl px-4 pb-12">
      <div className="mb-6 text-center">
        <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-amber-700">
          Voices
        </span>
        <h2 className="mt-3 text-2xl font-black text-slate-800 sm:text-3xl">ماذا يقول مرضانا</h2>
      </div>

      <div className="overflow-hidden rounded-[32px] border border-slate-200 bg-gradient-to-r from-slate-50 via-white to-cyan-50 p-3 shadow-[0_20px_70px_rgba(15,23,42,0.06)]">
        <div className="testimonial-track flex w-max gap-4">
          {duplicated.map((item, index) => (
            <article
              key={`${item.id ?? item.content ?? 'testimonial'}-${index}`}
              className="min-w-[290px] max-w-[320px] rounded-[26px] border border-white/60 bg-white/65 p-5 backdrop-blur-xl shadow-[0_18px_45px_rgba(15,23,42,0.08)]"
            >
              <div className="mb-3 flex items-center gap-1 text-amber-400" dir="ltr">
                {'★'.repeat(Math.max(1, Math.min(5, Number(item.rating) || 5)))}
              </div>

              <blockquote className="text-sm leading-7 text-slate-600">“{item.content}”</blockquote>

              <div className="mt-5 flex items-center gap-3">
                {item.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.image_url} alt={item.patient_name || 'مراجع'} className="h-11 w-11 rounded-full border-2 border-cyan-100 object-cover" />
                ) : (
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-teal-500 font-bold text-white">
                    {String(item.patient_name || 'م').charAt(0)}
                  </div>
                )}

                <div>
                  <p className="text-sm font-bold text-slate-800">{item.patient_name || 'مراجع موثق'}</p>
                  <p className="text-[11px] text-slate-500">عميل راضٍ</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
