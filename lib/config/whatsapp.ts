export type WhatsAppConfig = {
  phoneId: string;
  accessToken: string;
  businessAccountId: string;
  apiVersion: string;
};

/** WhatsApp Cloud API values are server-only and intentionally empty until configured. */
export const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID ?? '';
export const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN ?? '';
export const WHATSAPP_BUSINESS_ACCOUNT_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ?? '';
export const WHATSAPP_API_VERSION = process.env.WHATSAPP_API_VERSION ?? 'v26.0';

export function getWhatsAppConfig(): WhatsAppConfig {
  return {
    phoneId: WHATSAPP_PHONE_ID,
    accessToken: WHATSAPP_ACCESS_TOKEN,
    businessAccountId: WHATSAPP_BUSINESS_ACCOUNT_ID,
    apiVersion: WHATSAPP_API_VERSION,
  };
}
