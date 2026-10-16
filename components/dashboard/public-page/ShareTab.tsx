'use client';

import React from 'react';

import Link from 'next/link';
import Section from './shared/Section';
import type { PageConfig } from './shared/types';

type Props = {
  config: PageConfig;
  provisioning: boolean;
  onEnsureSubdomain: () => void;
  onCopyLink: () => void;
  onDownloadQr: () => void;
};

/** Share tab (moved verbatim): public URL + tenant subdomain + QR. */
export default function ShareTab({ config, provisioning, onEnsureSubdomain, onCopyLink, onDownloadQr }: Props) {
  return (
    <div className="space-y-4">
      <Section title="صفحتك العامة" subtitle="رابط دائم يمكن مشاركته مع المرضى.">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={config.pageUrl}
            className="rounded-full border border-slate-700 bg-slate-950 px-5 py-2 text-sm font-semibold text-slate-200 transition-all hover:border-cyan-500/50 hover:text-white"
          >
            مشاهدة الصفحة العامة
          </Link>
          <button
            type="button"
            onClick={onCopyLink}
            className="rounded-full bg-gradient-to-l from-cyan-500 to-emerald-500 px-5 py-2 text-sm font-semibold text-slate-950 transition-all hover:shadow-[0_0_20px_rgba(34,211,238,0.45)] hover:scale-[1.02] active:scale-[0.98]"
          >
            نسخ الرابط
          </button>
          <button
            type="button"
            onClick={onDownloadQr}
            className="rounded-full border border-slate-700 bg-slate-950 px-5 py-2 text-sm font-semibold text-slate-200 transition-all hover:border-cyan-500/50 hover:text-white"
          >
            تنزيل رمز QR
          </button>
          <code dir="ltr" className="w-full truncate rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-400">
            {config.canonicalUrl}
          </code>
        </div>
      </Section>

      <Section
        title="النطاق الخاص بالعيادة"
        subtitle="نطاق فرعي ثابت باسم عيادتك يعمل من الجوال والمطبوعات ورسائل واتساب."
      >
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
              config.subdomainReady
                ? 'bg-emerald-50 text-emerald-700'
                : config.subdomainStatus === 'failed'
                  ? 'bg-red-50 text-red-700'
                  : 'bg-amber-50 text-amber-700'
            }`}
          >
            {config.subdomainReady
              ? '● يعمل'
              : config.subdomainStatus === 'failed'
                ? '● تعذّر التجهيز'
                : '● قيد التجهيز'}
          </span>
          <code dir="ltr" className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-400">
            {config.canonicalUrl}
          </code>
          {!config.subdomainReady && (
            <button
              type="button"
              onClick={onEnsureSubdomain}
              disabled={provisioning}
              className="rounded-full bg-cyan-600 px-5 py-2 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-50"
            >
              {provisioning ? 'جارٍ التجهيز...' : config.subdomainStatus === 'failed' ? 'إعادة المحاولة' : 'تجهيز النطاق'}
            </button>
          )}
        </div>
        {config.subdomainError && !config.subdomainReady ? (
          <p className="mt-2 text-xs text-red-600">{config.subdomainError}</p>
        ) : null}
      </Section>
    </div>
  );
}
