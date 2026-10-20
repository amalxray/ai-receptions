import { expect, test } from '@playwright/test';

test('renders streamed assistant text before the response finishes', async ({ page }) => {
  await page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window);
    let releaseSecondChunk;
    let notifyFirstChunk;
    window.__releaseSecondChunk = new Promise((resolve) => { releaseSecondChunk = resolve; });
    window.__firstChunkSent = new Promise((resolve) => { notifyFirstChunk = resolve; });

    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.startsWith('/api/booking/clinic?')) {
        return new Response(JSON.stringify({ data: { name: 'Streaming test clinic' } }), {
          headers: { 'content-type': 'application/json' },
        });
      }

      if (url === '/api/public/ai/messages' && init?.method === 'POST') {
        await new Promise((resolve) => setTimeout(resolve, 300));
        const body = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(`${JSON.stringify({ type: 'token', text: '\u0628\u062f\u0627\u064a\u0629 \u0627\u0644\u0631\u062f' })}\n`));
            notifyFirstChunk();
            window.__releaseSecondChunk.then(() => {
              controller.enqueue(new TextEncoder().encode(`${JSON.stringify({ type: 'token', text: ' \u062b\u0645 \u0627\u0643\u062a\u0645\u0644' })}\n`));
              controller.enqueue(new TextEncoder().encode(`${JSON.stringify({
                type: 'done',
                payload: {
                  conversation_id: 'streaming-test-conversation',
                  assistant_message: { content: '\u0628\u062f\u0627\u064a\u0629 \u0627\u0644\u0631\u062f \u062b\u0645 \u0627\u0643\u062a\u0645\u0644' },
                },
              })}\n`));
              controller.close();
            });
          },
        });
        return new Response(body, { headers: { 'content-type': 'application/x-ndjson' } });
      }

      return nativeFetch(input, init);
    };
    window.__allowStreamToFinish = () => releaseSecondChunk();
  });

  const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000';
  await page.goto(`${baseURL}/chat?clinic=streaming-test`);
  const input = page.getByRole('textbox');
  await input.fill('\u0633\u0624\u0627\u0644 \u062a\u062c\u0631\u064a\u0628\u064a');
  await page.getByRole('button', { name: '\u0625\u0631\u0633\u0627\u0644' }).click();

  await expect(page.getByText('\u0623\u0628\u062d\u062b...')).toBeVisible();
  await page.evaluate(() => window.__firstChunkSent);
  await expect(page.getByText('\u0623\u062c\u0645\u0639...')).toBeVisible();
  await expect(page.getByText('\u0628\u062f\u0627\u064a\u0629 \u0627\u0644\u0631\u062f', { exact: true })).toBeVisible();
  await expect(page.getByText('\u0628\u062f\u0627\u064a\u0629 \u0627\u0644\u0631\u062f \u062b\u0645 \u0627\u0643\u062a\u0645\u0644', { exact: true })).toHaveCount(0);

  await page.evaluate(() => window.__allowStreamToFinish());
  await expect(page.getByText('\u0628\u062f\u0627\u064a\u0629 \u0627\u0644\u0631\u062f \u062b\u0645 \u0627\u0643\u062a\u0645\u0644', { exact: true })).toBeVisible();
});
