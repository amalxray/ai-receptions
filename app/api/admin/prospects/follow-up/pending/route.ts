import { NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/services/platformAdmin';
import { getPendingFollowUps } from '@/lib/services/prospecting/followUp';
import { ProspectEmailError } from '@/lib/services/prospecting/prospectEmail';

export async function GET(req: Request) {
  const gate = await requirePlatformAdmin(req);
  if (!gate.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: gate.status });

  try {
    return NextResponse.json({ data: await getPendingFollowUps() });
  } catch (error) {
    const status = error instanceof ProspectEmailError ? error.status : 500;
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'تعذّر تحميل قائمة المتابعة.',
    }, { status });
  }
}
