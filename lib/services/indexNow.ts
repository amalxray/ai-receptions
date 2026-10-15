/**
 * Phase 5 — IndexNow instant indexing helper.
 *
 * Pings IndexNow (Bing/Yandex) when a review is published so the clinic's
 * /{slug}/reviews page is re-crawled quickly. Best-effort: failures never
 * break the review flow. No-op without INDEXNOW_KEY.
 */
import { logEvent } from '@/lib/server/logging';
import { getAppBaseUrl } from '@/lib/communications/links';

export async function pingIndexNow(urls: string[]): Promise<boolean> {
  const key = process.env.INDEXNOW_KEY;
  if (!key || urls.length === 0) return false;
  try {
    const base = getAppBaseUrl();
    const host = new URL(base).host;
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host, key, keyLocation: `${base}/${key}.txt`, urlList: urls }),
      signal: AbortSignal.timeout(8000),
    });
    const ok = res.ok || res.status === 202;
    logEvent('indexnow_ping', { urls: urls.length, ok, status: res.status });
    return ok;
  } catch (err) {
    logEvent('indexnow_ping_failed', { error: err instanceof Error ? err.message : String(err) }, 'error');
    return false;
  }
}
