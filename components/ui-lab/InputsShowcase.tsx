'use client';

import { useState } from 'react';
import { Search, UserRound } from 'lucide-react';

export default function InputsShowcase() {
  const [query, setQuery] = useState('');

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <label className="rounded-2xl border border-white/[0.06] bg-slate-950/55 p-4">
        <span className="mb-3 block text-xs font-semibold text-slate-400">تركيز مضيء</span>
        <input type="text" placeholder="اكتب هنا..." className="w-full rounded-xl border border-slate-700/70 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/70 focus:ring-4 focus:ring-cyan-400/10 focus:shadow-[0_0_24px_-12px_rgba(34,211,238,0.8)]" />
      </label>

      <label className="rounded-2xl border border-white/[0.06] bg-slate-950/55 p-4">
        <span className="mb-3 block text-xs font-semibold text-slate-400">أيقونة داخلية · Search</span>
        <span className="relative block">
          <Search size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-500" />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث عن موعد..." className="w-full rounded-xl border border-slate-700/70 bg-slate-900/80 py-3 pr-11 pl-4 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-300/60 focus:ring-4 focus:ring-emerald-400/10" />
        </span>
      </label>

      <div className="rounded-2xl border border-white/[0.06] bg-slate-950/55 p-4">
        <label className="mb-3 block text-xs font-semibold text-slate-400" htmlFor="floating-name">عنوان عائم</label>
        <span className="group relative block">
          <UserRound size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 transition group-focus-within:text-cyan-200" />
          <input id="floating-name" type="text" placeholder=" " className="peer w-full rounded-xl border border-slate-700/70 bg-slate-900/80 px-11 pb-3 pt-5 text-sm text-white outline-none transition focus:border-cyan-300/60 focus:ring-4 focus:ring-cyan-400/10" />
          <span className="pointer-events-none absolute right-11 top-1/2 -translate-y-1/2 text-sm text-slate-500 transition-all peer-focus:top-3 peer-focus:translate-y-0 peer-focus:text-[10px] peer-focus:text-cyan-200 peer-[:not(:placeholder-shown)]:top-3 peer-[:not(:placeholder-shown)]:translate-y-0 peer-[:not(:placeholder-shown)]:text-[10px]">الاسم الكامل</span>
        </span>
      </div>
    </div>
  );
}
