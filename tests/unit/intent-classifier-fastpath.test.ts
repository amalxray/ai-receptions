/**
 * Fast-path intent classification regression suite (20 mandatory scenarios).
 *
 * Verifies that classifyIntent resolves obvious small-talk (greeting/goodbye)
 * DETERMINISTICALLY — WITHOUT calling the LLM — while every other intent
 * (booking, general_question, …) still falls through to the LLM. The AI provider
 * mock records whether `generate` was invoked so each case proves the routing:
 *
 *   - path === 'fast'  → generate MUST NOT be called (no AI latency).
 *   - path === 'ai'    → generate MUST be called (LLM still classifies it).
 *
 * A fast-path case is additionally made robust by having the mock LLM return a
 * DIFFERENT intent ('unknown'): if the fast-path is ever bypassed the assertion
 * still catches the wrong intent instead of silently passing.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

// logging has no side effects we want in a unit test.
vi.mock('@/lib/server/logging', () => ({ logEvent: vi.fn() }));

// Controllable AI provider mock. `generate` records calls and returns whatever
// the test configures, so we can prove fast-path short-circuited (not called)
// vs. fell through to the LLM (called).
const providerMock = vi.hoisted(() => {
  const generate = vi.fn();
  return {
    generate,
    getProvider: vi.fn(() => ({ id: 'mock-provider', generate })),
    registerProvider: vi.fn(),
    listProviders: vi.fn(() => []),
  };
});
vi.mock('@/lib/ai/provider', () => ({
  getProvider: providerMock.getProvider,
  registerProvider: providerMock.registerProvider,
  listProviders: providerMock.listProviders,
}));

import { classifyIntent } from '@/lib/ai/intentClassifier';

const FAST = 'fast' as const;
const AI = 'ai' as const;

type Row = { n: number; msg: string; expect: string; path: typeof FAST | typeof AI };

const SCENARIOS: Row[] = [
  { n: 1, msg: 'مرحبا', expect: 'greeting', path: FAST },
  { n: 2, msg: 'أهلا', expect: 'greeting', path: FAST },
  { n: 3, msg: 'السلام عليكم', expect: 'greeting', path: FAST },
  { n: 4, msg: 'هاي', expect: 'greeting', path: FAST },
  { n: 5, msg: 'شكراً', expect: 'goodbye', path: FAST },
  { n: 6, msg: 'باي', expect: 'goodbye', path: FAST },
  { n: 7, msg: 'مرحبا بدي أحجز', expect: 'appointment_booking', path: AI },
  { n: 8, msg: 'بدي أحجز', expect: 'appointment_booking', path: AI },
  { n: 9, msg: 'شو الخدمات؟', expect: 'general_question', path: AI },
  { n: 10, msg: 'كيفك؟', expect: 'greeting', path: FAST },
  { n: 11, msg: 'شو ساعات العمل؟', expect: 'general_question', path: AI },
  { n: 12, msg: 'ألم في الضرس', expect: 'general_question', path: AI },
  { n: 13, msg: 'مرحبا كيفك', expect: 'greeting', path: FAST },
  { n: 14, msg: 'بدي أحجز تصوير', expect: 'appointment_booking', path: AI },
  { n: 15, msg: 'شكراً كتير', expect: 'goodbye', path: FAST },
  { n: 16, msg: 'مع السلامة', expect: 'goodbye', path: FAST },
  { n: 17, msg: 'صباح الخير', expect: 'greeting', path: FAST },
  { n: 18, msg: 'مساء الخير', expect: 'greeting', path: FAST },
  { n: 19, msg: 'السلام عليكم بدي أسأل', expect: 'general_question', path: AI },
  { n: 20, msg: 'أهلاً شو في', expect: 'greeting', path: FAST },
];

describe('classifyIntent fast-path (20 scenarios)', () => {
  beforeEach(() => {
    providerMock.generate.mockReset();
  });

  it('covers exactly the 20 mandated scenarios', () => {
    expect(SCENARIOS).toHaveLength(20);
    expect(SCENARIOS.map((r) => r.n)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  for (const row of SCENARIOS) {
    it(`#${row.n} "${row.msg}" → ${row.expect} (${row.path === FAST ? 'fast, no AI' : 'AI'})`, async () => {
      // The LLM mock returns the expected intent for AI cases, and a clearly
      // wrong 'unknown' for fast cases (so a bypass would be caught).
      providerMock.generate.mockResolvedValue({
        text: JSON.stringify({ intent: row.path === AI ? row.expect : 'unknown', confidence: 0.9, entities: {} }),
      });

      const result = await classifyIntent(row.msg);

      expect(result.intent).toBe(row.expect);

      if (row.path === FAST) {
        expect(providerMock.generate).not.toHaveBeenCalled();
      } else {
        expect(providerMock.generate).toHaveBeenCalledTimes(1);
      }
    });
  }
});
