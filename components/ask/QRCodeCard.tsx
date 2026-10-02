'use client';

import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import ShareButtons from './ShareButtons';
import { PRODUCTION_BASE_URL } from '@/lib/communications/links';

/** Big QR card with download + copy + share (for /ask/qr and clinic sharing). */
export default function QRCodeCard({ url, label }: { url: string; label: string }) {
  const [copied, setCopied] = useState(false);
  // Canonical domain for SSR/first paint, then the visitor's actual origin.
  const [base, setBase] = useState(PRODUCTION_BASE_URL);
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.origin) setBase(window.location.origin);
  }, []);
  const full = url.startsWith('http') ? url : `${base}${url}`;

  const download = () => {
    const svg = document.querySelector('#qr-target svg') as unknown as SVGSVGElement | null;
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([`<?xml version="1.0" standalone="no"?>${xml}`], { type: 'image/svg+xml;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = 'sanni-qr.svg';
    a.click();
    URL.revokeObjectURL(href);
  };

  return (
    <div className="w-full max-w-sm rounded-2xl border border-slate-100 bg-white p-5 text-center shadow-sm">
      <div id="qr-target" className="rounded-xl bg-white p-3">
        <QRCodeSVG value={full} size={200} fgColor="#0F172A" bgColor="#FFFFFF" level="M" />
      </div>
      <p className="mt-4 text-gray-800" dir="ltr" style={{ fontSize: 13 }}>{full.replace('https://', '')}</p>
      <p className="mt-2 font-semibold text-gray-700">{label}</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={download}
          className="rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white transition-all duration-300 ease-out hover:bg-emerald-700"
        >
          📥 تنزيل QR
        </button>
        <button
          type="button"
          onClick={() => void navigator.clipboard.writeText(full).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })}
          className="rounded-full bg-slate-100 px-4 py-1.5 text-xs font-semibold text-slate-700 transition-all duration-300 ease-out hover:bg-slate-200"
        >
          {copied ? '✓ نُسخ' : '📋 نسخ الرابط'}
        </button>
      </div>
      <div className="mt-4"><ShareButtons url={full} title={label} compact /></div>
    </div>
  );
}
