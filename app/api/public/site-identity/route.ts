import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

/** GET /api/public/site-identity — public read of site identity (no auth). */
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('landing_page_content')
      .select('content')
      .eq('section_key', 'site_identity')
      .maybeSingle();
    if (error) throw new Error(error.message);
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: 'حدث خطأ غير متوقع' }, { status: 500 });
  }
}
