import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';

const tokenSchema = z.string().uuid();

function exactIlikePattern(value: string) {
  return value.replace(/[\\%_]/g, '\\$&');
}

export async function POST(
  _request: Request,
  { params }: { params: { token: string } },
) {
  const parsedToken = tokenSchema.safeParse(params.token);
  if (!parsedToken.success) {
    return NextResponse.json({ error: 'رابط إلغاء الاشتراك غير صالح.' }, { status: 400 });
  }

  const { data: prospect, error: lookupError } = await supabaseAdmin
    .from('prospects')
    .select('id, email')
    .eq('unsubscribe_token', parsedToken.data)
    .maybeSingle();
  if (lookupError) {
    return NextResponse.json({ error: 'تعذّر التحقق من رابط إلغاء الاشتراك.' }, { status: 500 });
  }
  if (!prospect) {
    return NextResponse.json({ error: 'رابط إلغاء الاشتراك غير موجود أو منتهي.' }, { status: 404 });
  }

  let updateQuery = supabaseAdmin
    .from('prospects')
    .update({ unsubscribed_at: new Date().toISOString() });
  if (typeof prospect.email === 'string' && prospect.email.trim()) {
    updateQuery = updateQuery.ilike('email', exactIlikePattern(prospect.email.trim()));
  } else {
    updateQuery = updateQuery.eq('id', prospect.id);
  }
  const { error: updateError } = await updateQuery;
  if (updateError) {
    return NextResponse.json({ error: 'تعذّر تسجيل إلغاء الاشتراك.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
