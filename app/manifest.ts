/**
 * Platform Web App Manifest — static fallback for `app/layout.tsx`
 * (`manifest: '/manifest.json'`).
 *
 * Icons are served from `/icons/` and cover PWA install targets:
 *   - 192x192 — Android Chrome
 *   - 512x512 — Android Chrome splash / store listing
 */
export const manifest = {
  name: 'AI-Receptions',
  short_name: 'AI-Receptions',
  description: 'موظفة الاستقبال الرقمية لعيادتك — حجز 24/7، محادثة ذكية، وأمان كامل.',
  start_url: '/',
  display: 'standalone',
  background_color: '#0A192F',
  theme_color: '#10B981',
  orientation: 'portrait',
  scope: '/',
  icons: [
    {
      src: '/icons/icon-192.png',
      sizes: '192x192',
      type: 'image/png',
      purpose: 'any',
    },
    {
      src: '/icons/icon-512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'any',
    },
  ],
} as const;

export default manifest;
