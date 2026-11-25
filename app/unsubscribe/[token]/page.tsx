import { notFound } from 'next/navigation';
import { z } from 'zod';
import UnsubscribeConfirmation from './UnsubscribeConfirmation';
import { supabaseAdmin } from '@/lib/supabase/admin';

export default async function UnsubscribePage({ params }: { params: { token: string } }) {
  const token = z.string().uuid().safeParse(params.token);
  if (!token.success) notFound();

  const { data, error } = await supabaseAdmin
    .from('prospects')
    .select('unsubscribed_at')
    .eq('unsubscribe_token', token.data)
    .maybeSingle();
  if (error) throw new Error(`تعذّر التحقق من رابط إلغاء الاشتراك: ${error.message}`);
  if (!data) notFound();

  return (
    <main dir="rtl" className="mx-auto flex min-h-screen max-w-xl items-center px-6 py-16">
      <section className="w-full rounded-3xl border border-slate-700 bg-slate-900 p-8 text-slate-100">
        <h1 className="text-2xl font-bold">إلغاء الاشتراك</h1>
        {data.unsubscribed_at ? (
          <p role="status" className="mt-6 text-emerald-200">تم إلغاء الاشتراك مسبقاً.</p>
        ) : (
          <UnsubscribeConfirmation token={token.data} />
        )}
      </section>
    </main>
  );
}
