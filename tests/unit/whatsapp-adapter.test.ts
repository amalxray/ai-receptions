import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WhatsAppConfig } from '@/lib/config/whatsapp';
import { buildWhatsAppMessagesUrl, sendTemplateMessage } from '@/lib/services/notificationAdapters/whatsappAdapter';

const config: WhatsAppConfig = {
  phoneId: '1234567890',
  accessToken: 'test-access-token',
  businessAccountId: '9876543210',
  apiVersion: 'v19.0',
};

const originalFetch = global.fetch;

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe('WhatsApp Cloud API adapter', () => {
  it('builds the message endpoint from the phone number ID', () => {
    expect(buildWhatsAppMessagesUrl(config.phoneId, config.apiVersion))
      .toBe('https://graph.facebook.com/v19.0/1234567890/messages');
  });

  it('sends an approved template with correctly formatted positional body parameters', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ messages: [{ id: 'wamid.test' }] }),
    } as unknown as Response);
    global.fetch = fetchMock;

    await expect(sendTemplateMessage(
      '+970 56 950 9093',
      'appointment_confirmation',
      'ar',
      ['Amal X-Ray Center', '2026-10-05', '10:30'],
      config,
    )).resolves.toEqual({ messages: [{ id: 'wamid.test' }] });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v19.0/1234567890/messages');
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer test-access-token');
    const body = JSON.parse(String(init.body));
    expect(body).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '970569509093',
      type: 'template',
      template: {
        name: 'appointment_confirmation',
        language: { code: 'ar' },
        components: [{
          type: 'body',
          parameters: [
            { type: 'text', text: 'Amal X-Ray Center' },
            { type: 'text', text: '2026-10-05' },
            { type: 'text', text: '10:30' },
          ],
        }],
      },
    });
  });

  it('throws when credentials are missing instead of pretending delivery succeeded', async () => {
    await expect(sendTemplateMessage('970569509093', 'appointment_reminder', 'ar', ['Clinic'], {
      phoneId: '',
      accessToken: '',
      businessAccountId: '',
      apiVersion: 'v19.0',
    })).rejects.toThrow('WHATSAPP_ACCESS_TOKEN is not configured');
  });

  it('surfaces Meta API failures for notification queue retry/status handling', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: vi.fn().mockResolvedValue({ error: { message: 'Template not approved' } }),
    } as unknown as Response);

    await expect(sendTemplateMessage('970569509093', 'appointment_reminder', 'ar', ['Clinic'], config))
      .rejects.toThrow('WhatsApp Cloud API error (400): Template not approved');
  });

  it('propagates network errors to the queue worker', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'));

    await expect(sendTemplateMessage('970569509093', 'appointment_reminder', 'ar', ['Clinic'], config))
      .rejects.toThrow('fetch failed');
  });
});
