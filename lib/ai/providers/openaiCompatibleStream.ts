/** Converts OpenAI-compatible chat-completion SSE chunks into plain UTF-8 text. */
export function openAICompatibleTextStream(response: Response): ReadableStream<Uint8Array> {
  if (!response.body) throw new Error('AI provider returned no stream body');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';
  let sawDone = false;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const pump = async () => {
        const enqueueDataLine = (line: string) => {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) return;
          const data = trimmed.slice(5).trim();
          if (!data || data === '[DONE]') {
            if (data === '[DONE]') sawDone = true;
            return;
          }
          const event = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: unknown }; finish_reason?: string | null }>;
            error?: { message?: string };
          };
          if (event.error?.message) throw new Error(event.error.message);
          const content = event.choices?.[0]?.delta?.content;
          if (typeof content === 'string' && content) controller.enqueue(encoder.encode(content));
        };

        try {
          while (!sawDone) {
            const { done, value } = await reader.read();
            buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop() ?? '';
            for (const line of lines) enqueueDataLine(line);
            if (done) {
              if (buffer) enqueueDataLine(buffer);
              break;
            }
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        } finally {
          reader.releaseLock();
        }
      };

      // Do not return the pump promise: the stream must be readable while the
      // provider is still generating, not only after the SSE body has closed.
      void pump();
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}
