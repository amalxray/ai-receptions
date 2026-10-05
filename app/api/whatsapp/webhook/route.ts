import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getWhatsAppConfig } from '@/lib/config/whatsapp';
import { receivePatientMessage } from '@/lib/services/messageService';

async function markAsRead(messageId: string, phoneNumberId?: string) {
  if (!messageId || !phoneNumberId) return;

  const { accessToken, apiVersion } = getWhatsAppConfig();
  if (!accessToken) return;

  const url = `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(phoneNumberId)}/messages`;

  const response = await fetch(url, {
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
    console.warn('[WhatsApp] markAsRead failed', await response.text().catch(() => ''));
  }
}

async function sendTextMessage(to: string, text: string, phoneNumberId?: string) {
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
      text: { body: text },
    }),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`WhatsApp send failed (${response.status}): ${body}`);
  }

  return body;
}

async function callAIReceptionist({
  from,
  text,
  to,
  phoneNumberId,
}: {
  from: string;
  text: string;
  to?: string;
  phoneNumberId?: string;
}) {
  const clinicId = process.env.WHATSAPP_CLINIC_ID;

  if (clinicId) {
    try {
      const result = await receivePatientMessage({
        clinicId,
        conversationId: `whatsapp:${from}`,
        sessionId: `whatsapp:${from}`,
        userId: null,
        text,
      });

      const aiReply = result?.assistantMessage?.content;
      if (aiReply && String(aiReply).trim()) {
        return String(aiReply).trim();
      }
    } catch (error) {
      console.error('[WhatsApp] AI receptionist failed:', error);
    }
  }

  const fallback = `استلمنا رسالتك: “${text.slice(0, 180)}”`;
  if (to && phoneNumberId) {
    return fallback;
  }
  return 'شكرًا لك، لقد استلمنا رسالتك.';
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const mode = params.get('hub.mode');
  const token = params.get('hub.verify_token');
  const challenge = params.get('hub.challenge');

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }

  return new NextResponse('Forbidden', { status: 403 });
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get('x-hub-signature-256') ?? '';
  const appSecret = process.env.WHATSAPP_APP_SECRET;

  if (appSecret) {
    const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(body).digest('hex')}`;
    if (signature !== expected) {
      return new NextResponse('Forbidden', { status: 403 });
    }
  }

  let payload: any;
  try {
    payload = JSON.parse(body);
  } catch {
    return new NextResponse('Bad Request', { status: 400 });
  }

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      const messages = value.messages ?? [];
      const metadata = value.metadata ?? {};

      for (const message of messages) {
        if (message.type !== 'text') continue;

        const from = message.from;
        const text = message.text?.body ?? '';
        const messageId = message.id;
        const phoneNumberId = metadata.phone_number_id as string | undefined;
        const displayPhone = metadata.display_phone_number as string | undefined;

        if (!from || !text) continue;

        try {
          await markAsRead(messageId, phoneNumberId);

          const reply = await callAIReceptionist({
            from,
            text,
            to: displayPhone,
            phoneNumberId,
          });

          if (reply) {
            await sendTextMessage(from, reply, phoneNumberId);
          }
        } catch (error) {
          console.error('[WhatsApp] Error processing message:', error);
        }
      }
    }
  }

  return new NextResponse('OK', { status: 200 });
}
