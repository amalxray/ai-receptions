import type { Metadata } from 'next';
import { Tajawal, IBM_Plex_Sans_Arabic, IBM_Plex_Mono } from 'next/font/google';
import { getAppBaseUrl } from '@/lib/communications/links';
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
  verification: {
    other: {
      'msvalidate.01': 'AB6893BB9C46704C823CBA7063CE0B53',
    },
  },
};

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
      </body>
    </html>
  );
}
