import { getWhatsAppConfig } from '@/lib/config/whatsapp';

export async function sendTextMessage(to: string, body: string, phoneNumberId?: string) {
  const { accessToken, apiVersion, phoneId } = getWhatsAppConfig();

  if (!accessToken) {
    throw new Error('WHATSAPP_ACCESS_TOKEN is not configured');
  }

  const targetPhoneId = phoneNumberId || phoneId;
  if (!targetPhoneId) {
    throw new Error('WHATSAPP_PHONE_ID is not configured');
  }

  const response = await fetch(`https://graph.facebook.com/${apiVersion}/${encodeURIComponent(targetPhoneId)}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body },
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`WhatsApp send failed (${response.status}): ${text}`);
  }

  return text;
}

export async function markAsRead(messageId: string, phoneNumberId?: string) {
  if (!messageId || !phoneNumberId) return;

  const { accessToken, apiVersion } = getWhatsAppConfig();
  if (!accessToken) return;

  const response = await fetch(`https://graph.facebook.com/${apiVersion}/${encodeURIComponent(phoneNumberId)}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    console.warn('[WhatsApp] markAsRead failed', errText);
  }
}
