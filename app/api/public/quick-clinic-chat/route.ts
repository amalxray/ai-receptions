import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';

const postSchema = z.object({
  clinicId: z.string().uuid(),
  message: z.string().min(1).max(1000),
});

function priceDisplay(s: { price: number | null; price_min: number | null; price_max: number | null }): string {
  if (s.price_min != null && s.price_max != null) return `${s.price_min}-${s.price_max} ₪`;
  if (s.price != null) return `${s.price} ₪`;
  return 'غير محدد';
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 });
    }
    const { clinicId, message } = parsed.data;

    const { data: clinic } = await supabaseAdmin
      .from('clinics')
      .select('name, activity_type, working_hours, phone')
      .eq('id', clinicId)
      .single();

    if (!clinic) {
      return NextResponse.json({ error: 'العيادة غير موجودة' }, { status: 404 });
    }

    const table =
      clinic.activity_type === 'imaging_center' ? 'imaging_services' :
      clinic.activity_type === 'dental_lab' ? 'lab_services' :
      'clinic_services';

    const { data: services } = await supabaseAdmin
      .from(table)
      .select('name, price, price_min, price_max, duration_minutes')
      .eq('clinic_id', clinicId)
      .eq('active', true)
      .order('sort_order', { ascending: true })
      .limit(6);

    const servicesList = (services ?? []).map((s) => `- ${s.name}: ${priceDisplay(s)} (${s.duration_minutes ?? 'غير محدد'} دقيقة)`).join('\n');

    const systemPrompt = `أنت موظفة استقبال ذكية لـ ${clinic.name}.

الخدمات والأسعار:
${servicesList}

أوقات العمل: ${clinic.working_hours ?? 'غير محدد'}

المريض يكتب لك. رد باختصار ولباقة.
- إذا ذكر ألماً أو مشكلة صحية: طمئنه، اقترح زيارة.
- إذا أراد الحجز: وجه لزر "احجز في 30 ثانية" على الصفحة.
- لا تعطِ أسعاراً غير موجودة في القائمة.
- لا تشخّص طبياً.`;

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message },
        ],
        stream: true,
        temperature: 0.6,
        max_tokens: 400,
      }),
    });

    if (!res.ok || !res.body) {
      return NextResponse.json({ error: 'فشل خدمة المحادثة' }, { status: 502 });
    }

    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
      async start(controller) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('data:')) continue;
              const data = trimmed.slice(5).trim();
              if (data === '[DONE]') continue;
              try {
                const json = JSON.parse(data);
                const token = json.choices?.[0]?.delta?.content ?? '';
                if (token) {
                  controller.enqueue(encoder.encode(JSON.stringify({ token }) + '\n'));
                }
              } catch {
                // ignore parse errors
              }
            }
          }
        } finally {
          controller.close();
        }
      }
    }), {
      headers: { 'Content-Type': 'application/x-ndjson' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
