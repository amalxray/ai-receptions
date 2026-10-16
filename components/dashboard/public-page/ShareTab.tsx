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
            className="rounded-full border border-slate-700 bg-slate-950 px-5 py-2 text-sm font-semibold text-slate-200 hover:border-cyan-500/50 hover:text-white transition-all"
          >
            مشاهدة الصفحة العامة
          </Link>
          <button
            type="button"
            onClick={onCopyLink}
            className="rounded-full border border-slate-700 bg-slate-950 px-5 py-2 text-sm font-semibold text-slate-200 hover:border-cyan-500/50 hover:text-white transition-all"
          >
            نسخ الرابط
          </button>
          <button
            type="button"
            onClick={onDownloadQr}
            className="rounded-full border border-slate-700 bg-slate-950 px-5 py-2 text-sm font-semibold text-slate-200 hover:border-cyan-500/50 hover:text-white transition-all"
          >
            تنزيل رمز QR
          </button>
          <code dir="ltr" className="w-full truncate rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-300">
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
          <code dir="ltr" className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">
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
