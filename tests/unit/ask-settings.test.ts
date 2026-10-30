import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ADMIN_ASK_SECTIONS_ORDER,
  DEFAULT_ASK_SECTIONS,
  mergeAskSectionsOrder,
} from '@/lib/services/askSettings';

describe('ask section settings', () => {
  it('includes chat in the admin defaults and keeps it enabled by default', () => {
    expect(DEFAULT_ADMIN_ASK_SECTIONS_ORDER).toContain('chat');
    expect(DEFAULT_ASK_SECTIONS.chat).toBe(true);
  });

  it('inserts newly added chat after quick questions for existing saved orders', () => {
    const legacyOrder = ['hero', 'quick_questions', 'tips', 'articles'];

    expect(mergeAskSectionsOrder(legacyOrder, DEFAULT_ADMIN_ASK_SECTIONS_ORDER)).toEqual([
      'hero',
      'quick_questions',
      'chat',
      'tips',
      'articles',
      'stories',
      'fun_facts',
      'faq',
      'cta',
      'gallery',
    ]);
  });

  it('preserves a customized order while adding missing sections', () => {
    const customOrder = ['tips', 'hero', 'quick_questions', 'chat'];

    expect(mergeAskSectionsOrder(customOrder, DEFAULT_ADMIN_ASK_SECTIONS_ORDER).slice(0, 4)).toEqual(customOrder);
  });
});
