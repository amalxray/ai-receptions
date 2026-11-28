export const PLATFORM_LINKS = {
  home: 'https://www.dentairec.com',
  ask: 'https://www.dentairec.com/ask',
  discover: 'https://www.dentairec.com/discover',
  showcaseImaging: 'https://amal-x-ray-center.dentairec.com',
  whatsapp: 'https://wa.me/970569509093',
  supportEmail: 'info@dentairec.com',
  supportPhone: '+970569509093',
} as const;

export const PLATFORM_LINKS_ARABIC_BLOCK = `
🔗 تعرّف على المنصة:
• الموقع: ${PLATFORM_LINKS.home}
• مساعد AI مجاني: ${PLATFORM_LINKS.ask}
• دليل العيادات: ${PLATFORM_LINKS.discover}
• مثال حي — مركز أمل لتصوير الأسنان: ${PLATFORM_LINKS.showcaseImaging}
• واتساب: ${PLATFORM_LINKS.whatsapp}
`.trim();
