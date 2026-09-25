/**
 * /ask conversational assistant (platform-wide, NOT clinic-scoped).
 *
 * Triage flow: 1) understand the symptom + severity in Arabic dialect,
 * 2) if we have a location → suggest nearest clinics and answer;
 *    3) otherwise → reply keeps the conversation going and signals
 *       `needs_location: true` so the UI shows the LocationPrompt.
 *
 * The AI layer deliberately reuses the provider registry so /ask works with
 * whichever provider the platform configured (openai/anthropic/ollama).
 * When no provider is registered, a rule-based reply still drives the flow
 * (always functional, never blocked on the model).
 *
 * Reliability (Phase 12): the call goes through generateWithFailover()
 * (bounded retry + failover to the next registered provider) instead of a bare
 * provider.generate(), so a 429/timeout no longer costs a conversation turn.
 * If every candidate fails, the failure is logged and the rule-based reply
 * below still answers.
 */
import { getProvider } from '@/lib/ai/provider';
import { ensureAIProviders } from '@/lib/ai/providers/registry';
import { generateWithFailover } from '@/lib/ai/resilience';
import { logEvent } from '@/lib/server/logging';
import { runNearbyClinics, getAskSettings } from '@/lib/services/askContent';
import { clinicSpaceUrl } from '@/lib/vercel/domains';

export type AskLocation = { lat: number; lng: number; city?: string | null } | null;

export type SuggestedClinic = {
  id: string;
  name: string;
  slug: string;
  type: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  google_maps_url: string | null;
  distance_km: number | null;
  booking_url: string;
};

export type AskReply = {
  reply: string;
  suggested_clinics: SuggestedClinic[];
  needs_location: boolean;
};

const DENTAL_HINT = /طاحون|ضرس|سن|ألم|وجع|تفتيح|تبييض|تقويم|زراعة|تنظيف|قيح|ورم|نزيف|بانوراما|عصب|حشو|خلع|صفراء|كلاب/i;

async function nearbySuggestions(location: AskLocation, limit = 3) {
  if (!location) return [];
  try {
    const rows = await runNearbyClinics(location.lat, location.lng, 50, limit);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      type: r.activity_type,
      address: r.address_line ?? null,
      city: r.city ?? null,
      phone: r.phone ?? null,
      google_maps_url: r.google_maps_url ?? null,
      distance_km: r.distance_km != null ? Number(r.distance_km) : null,
      // Canonical tenant subdomain (Phase E) — the legacy apex path `/{slug}`
      // 301-redirects here, so a suggestion link must never encode it.
      booking_url: clinicSpaceUrl(r.slug),
    }));
  } catch {
    return [];
  }
}

function severityReply(message: string): { reply: string; urgent: boolean } {
  if (/ألم حاد|ورم|نزيف|طوارئ|طارئ|مكسور|انكسر|أوجاع شديدة/i.test(message)) {
    return {
      reply:
        'يبدو أنك تعاني من حالة قد تكون طارئة. سلامتك أولاً — لو عندك ألم حاد أو تورم أو نزيف، يفضّل التوجه لطبيب فوراً أو للطوارئ. نعملك اقتراح أقرب المراكز اللي تقدر تساعدك لو أعطيتنا موقعك (أو اختار مدينتك).',
      urgent: true,
    };
  }
  if (/طاحون|ضرس|سن(ي|ة)?/i.test(message)) {
    return {
      reply:
        'أتفهم — ألم الأسنان مزعج جداً. عشان أساعدك ألاقي أقرب مركز/عيادة منك وأعرف إذا بدك حجز فوري، محتاج أعرف منطقتك (📍 حدد موقعك أو اختر مدينتك). وبستفسر منك: هل الألم مستمر أم متقطع؟ وهو رايح أو جاي؟',
      urgent: false,
    };
  }
  return {
    reply:
      'وصلتنا مشكلتك، وبنساعدك من خلالها! لتحديد أنسب طبيب أو مركز قريب، محتاج أعرف موقعك (📍 حدد موقعك أو اختر مدينتك يدوياً). وبعدها بنسألك سؤالين سريعين عشان نوجهك صح.',
    urgent: false,
  };
}

async function aiReply(message: string): Promise<string> {
  // Register the platform-configured providers before asking the registry
  // (same call the orchestrator/knowledge pipeline make at startup).
  ensureAIProviders();
  const provider = getProvider();
  if (!provider) return ''; // fallback to rule-based below
  try {
    const system =
      'أنت مساعد صحي رقمي باللهجة الفلسطينية تابع لمنصة تصل المرضى بأقرب مراكز/عيادات/مختبرات الأسنان. ارد بشكل ودّي قصير (١-٣ جمل)، اسأل سؤال توضيحي واحد إذا لزم، لا تشخّص أمراضاً بدل الطبيب، وحذّر للطوارئ إذا كان الوصف خطيراً.';
    const res = await generateWithFailover({
      prompt: `${system}\n\nالمريض يقول:\n${message.substring(0, 500)}\n\nرد:\n`,
      maxTokens: 220,
      temperature: 0.6,
    });
    const text = (res?.text ?? '').trim();
    return text.slice(0, 600);
  } catch (err) {
    // Total AI failure (all candidates exhausted) — rule-based reply takes over.
    logEvent(
      'ask_ai_reply_failed',
      { error: err instanceof Error ? err.message : String(err) },
      'warn'
    );
    return '';
  }
}

export async function answerAsk(input: {
  message: string;
  location: AskLocation;
}): Promise<AskReply> {
  const message = (input.message ?? '').trim().slice(0, 1000);
  const hasLocation = Boolean(input.location?.lat && input.location?.lng);

  const needLocation = isAskForLocation(message);
  const suggestions = hasLocation ? await nearbySuggestions(input.location) : [];

  if (needLocation && !hasLocation) {
    return {
      reply: 'طبعاً! عشان نلاقي أقرب شي لبيتك، حط موقعك (📍 حدد موقعي) أو اختر مدينتك من القائمة.',
      suggested_clinics: [],
      needs_location: true,
    };
  }

  // AI first, rule-based fallback keeps it alive without a model.
  const generated = await aiReply(message);
  const base = severityReply(message);
  const reply = generated || base.reply;

  if (hasLocation) {
    if (suggestions.length === 0) {
      return {
        reply: `${reply}\n\nما لقينا مراكز ضمن نطاق 50 كم منك حالياً، بس تقدر تتصفح المنصة وتشوف العيادات المتاحة.`,
        suggested_clinics: [],
        needs_location: false,
      };
    }
    const lines = suggestions.map((c, i) =>
      `${i + 1}. ${c.name} — ${c.city ?? ''} (${c.distance_km != null ? `${c.distance_km} كم` : 'قريب'})${c.address ? `، ${c.address}` : ''}`
    );
    return {
      reply: `${reply}\n\n🎯 وجدت أقرب ${suggestions.length} مراكز لموقعك:\n${lines.join('\n')}\n\nاختر واحداً وسأعطيك تفاصيله ورابط الحجز.`,
      suggested_clinics: suggestions,
      needs_location: false,
    };
  }

  return { reply, suggested_clinics: [], needs_location: !hasLocation };
}

function isAskForLocation(message: string): boolean {
  return /وين|مكانك|موقعك|عنوانك|أقرب|قريب/i.test(message);
}
