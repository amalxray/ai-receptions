export const APPOINTMENT_CONFIRMATION = 'appointment_confirmation';
export const APPOINTMENT_REMINDER = 'appointment_reminder';

/** Human-readable copy to register/approve in Meta Business Manager. */
export const WHATSAPP_TEMPLATE_COPY = {
  [APPOINTMENT_CONFIRMATION]: 'تم تأكيد موعدك في {clinic_name} يوم {date} الساعة {time}.',
  [APPOINTMENT_REMINDER]: 'تذكير بموعدك غداً في {clinic_name}.',
} as const;

/** Variable order expected by the positional body parameters in Meta templates. */
export const WHATSAPP_TEMPLATE_VARIABLES = {
  [APPOINTMENT_CONFIRMATION]: ['clinic_name', 'date', 'time'],
  [APPOINTMENT_REMINDER]: ['clinic_name'],
} as const;

export type WhatsAppTemplateName =
  | typeof APPOINTMENT_CONFIRMATION
  | typeof APPOINTMENT_REMINDER;

export function templateForNotificationType(type: string): WhatsAppTemplateName {
  switch (type) {
    case 'appointment_confirmation':
    case 'booking_acknowledgement':
      return APPOINTMENT_CONFIRMATION;
    case 'appointment_reminder':
      return APPOINTMENT_REMINDER;
    default:
      throw new Error(`No approved WhatsApp template is configured for notification type: ${type}`);
  }
}
