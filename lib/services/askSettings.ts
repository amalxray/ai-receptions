export const DEFAULT_ADMIN_ASK_SECTIONS_ORDER = [
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
];

export const DEFAULT_PUBLIC_ASK_SECTIONS_ORDER = [
  'hero',
  'stats',
  'quick_questions',
  'chat',
  'clinics',
  'gallery',
  'stories',
  'tips',
  'articles',
  'fun_facts',
  'faq',
  'cta',
];

export const DEFAULT_ASK_SECTIONS = { chat: true };

export function mergeAskSectionsOrder(order: readonly string[], defaults: readonly string[]): string[] {
  const merged = order.filter((section, index) => order.indexOf(section) === index);
  defaults.forEach((section, index) => {
    if (merged.includes(section)) return;
    const nextSection = defaults.slice(index + 1).find((candidate) => merged.includes(candidate));
    const insertionIndex = nextSection ? merged.indexOf(nextSection) : merged.length;
    merged.splice(insertionIndex, 0, section);
  });
  return merged;
}
