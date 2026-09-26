import type { Metadata, Viewport } from 'next';
import { Tajawal, IBM_Plex_Sans_Arabic, IBM_Plex_Mono } from 'next/font/google';
import Script from 'next/script';
import { getAppBaseUrl } from '@/lib/communications/links';
import { PLATFORM_VIEWPORT } from '@/lib/services/pwaManifest';
import './globals.css';

const tajawal = Tajawal({
  subsets: ['arabic'],
  weight: ['400', '500', '700', '800', '900'],
  variable: '--font-tajawal',
  display: 'swap',
});

const ibmPlexArabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-plex-arabic',
  display: 'swap',
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-plex-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(getAppBaseUrl()),
  title: 'AI-Receptions — موظفة الاستقبال الرقمية لعيادتك',
  description: 'نظام استقبال ذكي لعيادات الأسنان مع محادثة AI، حجز 24/7، وأمان كامل.',
  // Bing Webmaster verification → renders <meta name="msvalidate.01" content="…">
  // PWA - installable app: web manifest, iOS standalone meta and icons.
  manifest: '/manifest.json',
  applicationName: 'AI-Receptions',
  appleWebApp: { capable: true, title: 'AI-Receptions', statusBarStyle: 'default' },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  formatDetection: { telephone: false },
  verification: {
    other: {
      'msvalidate.01': 'AB6893BB9C46704C823CBA7063CE0B53',
    },
  },
};

// #40 — mobile viewport: explicit device-width, no layout-breaking zoom lock
// (maximumScale keeps pinch-zoom accessible), safe-area aware for notched phones.
// PWA per-clinic identity: single-sourced in `lib/services/pwaManifest`
// (PLATFORM_VIEWPORT). The tenant space re-uses it and swaps ONLY `themeColor`
// for the clinic's color, so the two can never drift apart.
export const viewport: Viewport = PLATFORM_VIEWPORT;

/** AEO/GEO — platform-level Organization entity (answer engines + AI crawlers). */
function OrganizationJsonLd() {
  const base = getAppBaseUrl();
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'AI-Receptions',
    alternateName: 'سنّي',
    url: base,
    logo: `${base}/icons/icon-512.png`,
    description:
      'منصة موظفة استقبال ذكية للعيادات ومراكز التصوير الطبي في فلسطين — حجز مواعيد تلقائي وإدارة مرضى 24/7.',
    areaServed: { '@type': 'AdministrativeArea', name: 'فلسطين' },
    knowsLanguage: ['ar', 'en'],
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
    />
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`${tajawal.variable} ${ibmPlexArabic.variable} ${ibmPlexMono.variable}`}>
      <body>
        <OrganizationJsonLd />
        {children}
        {/* PWA - register the offline shell worker once per page load. */}
        <Script id="pwa-sw-register" strategy="afterInteractive">
          {`if ('serviceWorker' in navigator) { window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function () {}); }); }`}
        </Script>
      </body>
    </html>
  );
}
