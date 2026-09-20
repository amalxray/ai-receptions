import type { MetadataRoute } from 'next';
import { getAppBaseUrl } from '@/lib/communications/links';

/**
 * PP-8C — robots.txt foundation.
 *
 * Allow public surfaces; disallow authenticated/operational areas. Private
 * doctor profiles resolve to 404 and noindex profiles carry a robots
 * noindex meta — per Google guidance such URLs are NOT blocked here
 * (blocking would prevent crawling the noindex directive).
 * Sitemap points at the indexable-entities-only sitemap (PP-8C).
 */
export default function robots(): MetadataRoute.Robots {
  const base = getAppBaseUrl();
  // AEO/GEO — AI answer-engine crawlers get explicit allow rules (same
  // disallow surface as the wildcard rule: authenticated/operational areas).
  // Omitted bots (e.g. Bingbot, Googlebot) are covered by the '*' rule below.
  const aiBots = [
    'GPTBot',
    'OAI-SearchBot',
    'ChatGPT-User',
    'Google-Extended',
    'PerplexityBot',
    'Perplexity-User',
    'ClaudeBot',
    'Claude-User',
    'anthropic-ai',
    'Applebot-Extended',
    'Bytespider',
  ];
  const disallow = ['/dashboard/', '/admin/', '/portal/', '/api/'];
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow,
      },
      ...aiBots.map((userAgent) => ({ userAgent, allow: '/', disallow })),
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
