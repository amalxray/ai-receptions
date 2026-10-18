import { describe, expect, it } from 'vitest';
import { openAICompatibleTextStream } from './openaiCompatibleStream';

describe('openAICompatibleTextStream', () => {
  it('decodes SSE deltas incrementally, including split UTF-8 chunks', async () => {
    const encoder = new TextEncoder();
    const chunks = [
      'data: {"choices":[{"delta":{"content":"مرح"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"با"}}]}\n\n',
      'data: [DONE]\n\n',
    ].map((chunk) => encoder.encode(chunk));
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    });
    const response = new Response(body);
    const reader = openAICompatibleTextStream(response).getReader();
    const decoder = new TextDecoder();
    let text = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }

    expect(text).toBe('مرحبا');
  });

  it('propagates a provider SSE error', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"error":{"message":"Authentication failed"}}\n\n'));
        controller.close();
      },
    });
    const reader = openAICompatibleTextStream(new Response(body)).getReader();

    await expect(reader.read()).rejects.toThrow('Authentication failed');
  });
});
