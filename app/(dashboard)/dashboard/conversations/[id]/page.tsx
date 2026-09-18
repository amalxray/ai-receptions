import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * P3 fix (Global by Default): the global AI-conversations list links to
 * /dashboard/conversations/<id>, but the real detail page lives under
 * /dashboard/<clinicSlug>/conversations/<id>. This shim resolves the
 * conversation's clinic slug server-side and redirects there — no 404 for any
 * clinic, past or future. Never touches DB rows (read-only).
 */
export default async function GlobalConversationRedirect({
  params,
}: {
  // `await` works both for Next 15 (Promise) and Next 14 (plain object).
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let target = '/dashboard';
  try {
    const { data: conversation } = await supabaseAdmin
      .from('conversations')
      .select('clinic_id')
      .eq('id', id)
      .maybeSingle();
    if (conversation?.clinic_id) {
      const { data: clinic } = await supabaseAdmin
        .from('clinics')
        .select('slug')
        .eq('id', conversation.clinic_id)
        .maybeSingle();
      if (clinic?.slug) target = `/dashboard/${clinic.slug}/conversations/${id}`;
    }
  } catch {
    // fall through to the dashboard root — never a 500 on a broken link
  }
  redirect(target);
}
