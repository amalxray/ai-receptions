'use client';

import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import ShareButtons from './ShareButtons';

const BASE = process.env.NEXT_PUBLIC_APP_URL || 'https://www.dentairec.com';

/** Big QR card with download + copy + share (for /ask/qr and clinic sharing). */
export default function QRCodeCard({ url, label }: { url: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const full = url.startsWith('http') ? url : `${BASE}${url}`;

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
    <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white p-6 text-center shadow-xl">
      <div id="qr-target" className="rounded-xl bg-white p-3">
        <QRCodeSVG value={full} size={200} fgColor="#0F172A" bgColor="#FFFFFF" level="M" />
      </div>
      <p className="mt-4 text-gray-800" dir="ltr" style={{ fontSize: 13 }}>{full.replace('https://', '')}</p>
      <p className="mt-2 font-semibold text-gray-700">{label}</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={download}
          className="rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-500"
        >
          📥 تنزيل QR
        </button>
        <button
          type="button"
          onClick={() => void navigator.clipboard.writeText(full).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })}
          className="rounded-full bg-white/80 px-4 py-1.5 text-xs font-semibold text-gray-800 hover:bg-white/90"
        >
          {copied ? '✓ نُسخ' : '📋 نسخ الرابط'}
        </button>
      </div>
      <div className="mt-4"><ShareButtons url={full} title={label} compact /></div>
    </div>
  );
}
