import { loadEnv } from 'vite';

async function main() {
  const localEnv = loadEnv('development', process.cwd(), '');
  for (const key of ['WHATSAPP_PHONE_ID', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_BUSINESS_ACCOUNT_ID', 'WHATSAPP_API_VERSION']) {
    if (!process.env[key] && localEnv[key]) process.env[key] = localEnv[key];
  }

  const recipient = process.env.WHATSAPP_SMOKE_TEST_RECIPIENT || '+970599581178';
  const required = ['WHATSAPP_PHONE_ID', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_BUSINESS_ACCOUNT_ID'];
  const missing = required.filter((key) => !process.env[key]?.trim());
  if (missing.length > 0) {
    console.error(`BLOCKED: missing ${missing.join(', ')}. Configure them in Vercel or ignored .env.local; do not pass secrets on the command line.`);
    process.exitCode = 2;
    return;
  }

  try {
    const { sendTemplateMessage } = await import('@/lib/services/notificationAdapters/whatsappAdapter');
    const result = await sendTemplateMessage(recipient, 'hello_world', 'en_US', []);
    const messageId = result.messages?.[0]?.id;
    console.log(`META_HTTP_STATUS=${result.httpStatus ?? 'unknown'}`);
    console.log(`TEMPLATE=hello_world LANGUAGE=en_US`);
    console.log(`MESSAGE_ID=${messageId ?? 'not-returned'}`);
    console.log(messageId ? 'META_ACCEPTED=true' : 'META_ACCEPTED=false');
    if (!messageId || result.httpStatus !== 200) process.exitCode = 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown WhatsApp smoke-test failure';
    console.error(`SMOKE_TEST_FAILED=${message}`);
    process.exitCode = 1;
  }
}

void main();

