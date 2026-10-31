import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildSalesPrompt, type SalesChatMessage } from '@/lib/ai/prompts/salesPrompt';
import { generateWithFailover } from '@/lib/ai/resilience';
import { ensureAIProviders } from '@/lib/ai/providers/registry';
import { logEvent } from '@/lib/server/logging';
import { RateLimiter, getClientId } from '@/lib/services/gateway/security/rate-limiter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const salesMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(2000),
});

const requestSchema = z.object({
  messages: z.array(salesMessageSchema).min(1).max(12),
});

const salesLimiter = new RateLimiter(20, 60_000);
const SALES_PROVIDER_CHAIN = ['gemini', 'groq'] as const;
const BOOKING_REQUEST = /(?:احجز|حجز|موعد|مواعيد|للمريض|appointment|book(?:ing)?|schedule)/i;
const PRICE_REQUEST = /(?:سعر|أسعار|تكلفة|اشتراك|بكم|قديش|price|pricing|cost|fee|how\s+much)/i;

const BOOKING_REDIRECT_MESSAGE = 'أنا بوت مبيعات للمنصة ولا أحجز مواعيد المرضى. استخدم مساعد الاستقبال عبر /ask لإتمام الحجز.';
const SALES_PRICE_MESSAGE = 'عرض التأسيس لأول 100 مشترك — الأسعار تثبت مدى الحياة:\n\n• الأساسية: $99 بدل $39/شهر\n• المتقدمة: $179 بدل $69/شهر\n• المركز: $299 بدل $119/شهر\n\nإذا كانت 5 مكالمات مرضى تضيع يومياً بعد الدوام، فأنت قد تخسر آلاف الدولارات شهرياً؛ اشتراك $39 أقل من تكلفة مريض واحد ضائع. وبالمقارنة، الحجز المنفصل (100-150$) والمحاسبة (150-200$) وحملة بسيطة (300-500$) وحدها تتجاوز السعر بكثير — بينما تحصل هنا على SEO وAEO واستقبال ذكي 24/7. ابدأ الآن من /register. ما أكبر تحدٍ يواجهك في إدارة عيادتك حالياً؟';
const SALES_FALLBACK_MESSAGE = SALES_PRICE_MESSAGE;

function hasCompletePriceAndPsychologyReply(message: string): boolean {
  return ['$39', '$69', '$119'].every((price) => message.includes(price))
    && /(?:خس|مريض|ROI|عائد|استثمار)/i.test(message);
}

function responseForBookingRequest() {
  return NextResponse.json({
    message: BOOKING_REDIRECT_MESSAGE,
    redirectTo: '/ask',
    cta: { label: 'اذهب إلى مساعد الاستقبال', href: '/ask' },
    provider: 'guardrail',
  });
}

export async function POST(request: Request) {
  if (!salesLimiter.isAllowed(getClientId(request))) {
    return NextResponse.json(
      { error: 'لقد أرسلت رسائل كثيرة بسرعة. انتظر قليلاً ثم أعد المحاولة.' },
      { status: 429, headers: { 'Retry-After': '60' } },
    );
  }

  try {
    const body = await request.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'بيانات المحادثة غير صالحة.' }, { status: 400 });
    }

    const messages = parsed.data.messages as SalesChatMessage[];
    const latestUserMessage = [...messages].reverse().find((message) => message.role === 'user');
    if (!latestUserMessage) {
      return NextResponse.json({ error: 'أرسل رسالة للمتابعة.' }, { status: 400 });
    }

    if (BOOKING_REQUEST.test(latestUserMessage.content)) {
      return responseForBookingRequest();
    }

    // The route owns its provider registration and never imports the clinic
    // orchestrator. The allowed list keeps this public bot isolated to the
    // requested free-tier chain: Gemini first, Groq second.
    ensureAIProviders();

    if (!process.env.GEMINI_API_KEY && !process.env.GROQ_API_KEY) {
      return NextResponse.json({
        message: SALES_FALLBACK_MESSAGE,
        cta: { label: 'ابدأ الآن', href: '/register' },
        provider: 'fallback',
        degraded: true,
      });
    }

    const isPriceRequest = PRICE_REQUEST.test(latestUserMessage.content);
    const result = await generateWithFailover({
      prompt: `${buildSalesPrompt(messages)}${isPriceRequest ? '\n\nأولوية قصوى لهذا الدور: هذا سؤال سعر مباشر. ابدأ بالأسعار الثلاثة الدقيقة ($39 و$69 و$119) مع أسعارها الأصلية، ثم اذكر تأثير الخسارة وROI قبل أي سؤال توضيحي.' : ''}`,
      maxTokens: 520,
      temperature: 0.55,
      preferredProviderId: 'gemini',
      allowedProviderIds: SALES_PROVIDER_CHAIN,
    });

    const generatedMessage = result.text.trim();
    const message = isPriceRequest && !hasCompletePriceAndPsychologyReply(generatedMessage)
      ? SALES_PRICE_MESSAGE
      : generatedMessage || SALES_FALLBACK_MESSAGE;

    return NextResponse.json({
      message,
      cta: { label: 'ابدأ الآن', href: '/register' },
      provider: result.providerId,
    });
  } catch (error) {
    logEvent('sales_bot_generation_failed', {
      route: '/api/public/ai/sales-bot',
      provider_chain: SALES_PROVIDER_CHAIN,
      error: error instanceof Error ? error.message : String(error),
    }, 'error');

    return NextResponse.json({
      message: SALES_FALLBACK_MESSAGE,
      cta: { label: 'ابدأ الآن', href: '/register' },
      provider: 'fallback',
      degraded: true,
    });
  }
}
