/**
 * Regression suite for the "المساعد غير متاح" root causes (Groq empty response
 * + malformed classifier JSON). Covers:
 *  - Fix 1: Groq retries ONCE in place on an empty (non-filtered) response, then
 *    succeeds; if still empty it throws so resilience.ts fails over to Gemini.
 *  - Fix 2: the intent classifier tolerates ```json fences, surrounding prose,
 *    trailing commas and smart quotes instead of throwing.
 *  - Arabic-Indic digits (٠-٩) are normalised to Latin before time/intent parsing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockLogging = vi.hoisted(() => ({ logEvent: vi.fn() }));
vi.mock('@/lib/server/logging', () => mockLogging);

import { GroqProvider } from '@/lib/ai/providers/groq';
import { extractBookingIntent, extractPreferredTimeRange } from '@/lib/ai/understanding';

function okResponse(text: string) {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: text }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      model: 'openai/gpt-oss-120b',
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

/** An empty, non-filtered Groq response — the production failure mode. */
function emptyResponse() {
  return new Response(
    JSON.stringify({ choices: [{ message: { content: '' }, finish_reason: 'stop' }], usage: {} }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

describe('Groq empty-response retry (Fix 1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GROQ_API_KEY = 'gsk-test-key-not-real';
    delete process.env.GROQ_MODEL;
  });
  afterEach(() => {
    delete process.env.GROQ_API_KEY;
    vi.unstubAllGlobals();
  });

  it('retries ONCE in place on empty content, then returns the good response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(emptyResponse())
      .mockResolvedValueOnce(okResponse('أهلاً، كيف أساعدك؟'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await GroqProvider.generate({ prompt: 'مرحبا' });

    expect(result.text).toBe('أهلاً، كيف أساعدك؟');
    expect(fetchMock).toHaveBeenCalledTimes(2); // one empty + one good
  });

  it('throws after exhausting retries so resilience fails over to Gemini', async () => {
    // Fresh Response per call — a Response body can only be read once, and the
    // real Groq endpoint returns a new Response on every attempt.
    const fetchMock = vi.fn().mockImplementation(async () => emptyResponse());
    vi.stubGlobal('fetch', fetchMock);

    await expect(GroqProvider.generate({ prompt: 'مرحبا' })).rejects.toThrow(/no content in message/);
    expect(fetchMock).toHaveBeenCalledTimes(2); // initial + 1 retry, then give up
  });

  it('does NOT retry a legitimate content_filter turn (returns empty, no throw)', async () => {
    const filtered = new Response(
      JSON.stringify({ choices: [{ message: { content: '' }, finish_reason: 'content_filter' }], usage: {} }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
    const fetchMock = vi.fn().mockResolvedValue(filtered);
    vi.stubGlobal('fetch', fetchMock);

    const result = await GroqProvider.generate({ prompt: 'مرحبا' });
    expect(result.text).toBe('');
    expect(fetchMock).toHaveBeenCalledTimes(1); // no retry
  });

  it('does NOT retry a real provider error (401) — fails over immediately', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'invalid key' } }), { status: 401 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(GroqProvider.generate({ prompt: 'hi' })).rejects.toThrow(/Authentication failed/);
    expect(fetchMock).toHaveBeenCalledTimes(1); // no retry on non-transient
  });
});

describe('Arabic-Indic digit normalisation (Arabic ٠-٩ → Latin)', () => {
  it('normalises Arabic digits in a bare-hour time ("الساعة ٥")', () => {
    // Levantine PM default: 5 → 17:00 at-or-after.
    expect(extractPreferredTimeRange('بدي يوم الاحد الساعة ٥')?.from).toBe('17:00');
  });

  it('normalises Arabic digits in an explicit HH:MM time ("٩:٣٠")', () => {
    const range = extractPreferredTimeRange('الساعة ٩:٣٠');
    expect(range?.from).toBe('21:30'); // 9 → +12 (PM) since it parsed as bare hour with minutes
  });

  it('leaves Latin-digit times unchanged', () => {
    expect(extractPreferredTimeRange('بدي يوم الاحد الساعة 5')?.from).toBe('17:00');
  });

  it('booking intent still detected when digits are Arabic-Indic', () => {
    expect(extractBookingIntent('بدي أحجز موعد')).toBe(true);
  });
});

describe('Classifier JSON robustness (Fix 2) via classifyIntentSemantic', () => {
  // Mock the provider so classifyIntentSemantic returns whatever `text` we set.
  const providerMock = vi.hoisted(() => {
    const generate = vi.fn();
    return { generate, getProvider: vi.fn(() => ({ id: 'mock', generate })) };
  });
  vi.mock('@/lib/ai/provider', () => providerMock);

  // Imported lazily inside tests after the mock is registered.
  async function classify(raw: string) {
    providerMock.generate.mockResolvedValue({ text: raw });
    const { classifyIntentSemantic } = await import('@/lib/ai/intentClassifier');
    return classifyIntentSemantic('بدي أحجز');
  }

  beforeEach(() => vi.clearAllMocks());

  it('parses a clean JSON object', async () => {
    const r = await classify('{"intent":"appointment_booking","confidence":0.9,"entities":{}}');
    expect(r?.intent).toBe('appointment_booking');
  });

  it('parses JSON wrapped in a ```json fence', async () => {
    const r = await classify('```json\n{"intent":"general_question","confidence":0.8,"entities":{}}\n```');
    expect(r?.intent).toBe('general_question');
  });

  it('parses JSON surrounded by prose', async () => {
    const r = await classify('Here is the result: {"intent":"goodbye","confidence":0.7,"entities":{}} — done.');
    expect(r?.intent).toBe('goodbye');
  });

  it('repairs a trailing comma before the closing brace', async () => {
    const r = await classify('{"intent":"greeting","confidence":0.9,"entities":{},}');
    expect(r?.intent).toBe('greeting');
  });

  it('repairs smart/curly double quotes', async () => {
    const r = await classify('{“intent”:“patient_complaint”,“confidence”:0.6,“entities”:{}}');
    expect(r?.intent).toBe('patient_complaint');
  });

  it('returns null when the payload is genuinely unparseable', async () => {
    const r = await classify('totally not json at all');
    expect(r).toBeNull();
  });
});

