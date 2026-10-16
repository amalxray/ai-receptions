'use client';

import React from 'react';

import ImageUpload from '@/components/ui/ImageUpload';
import Section from './shared/Section';
import Toggle from './shared/Toggle';
import type { InfoFormState, PageConfig, UpdateFn, ReloadFn } from './shared/types';

type Props = {
  config: PageConfig;
  form: InfoFormState;
  setForm: React.Dispatch<React.SetStateAction<InfoFormState>>;
  contactError: string | null;
  saving: boolean;
  onSaveInfo: () => void;
  update: UpdateFn;
  load: ReloadFn;
};

/** Identity tab (moved verbatim): identity + cover/logo + phone/prices. */
export default function IdentityTab({ config, form, setForm, contactError, saving, onSaveInfo, update, load }: Props) {
  return (
    <div className="space-y-4">
      <Section title="الهوية والنبذة" subtitle="الاسم والشعار والنبذة تظهر في الصفحة العامة.">
        <div className="grid gap-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-400">نبذة قصيرة</span>
            <input
              type="text"
              value={form.tagline}
              onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))}
              maxLength={300}
              placeholder="مثال: مركز تصوير متخصص بأسنان الأطفال"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 hover:border-slate-600 focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500/50"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-400">الوصف</span>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              maxLength={3000}
              rows={3}
              placeholder="نبذة عن العيادة وخدماتها..."
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 hover:border-slate-600 focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500/50"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-400">من نحن (تفصيلي)</span>
            <textarea
              value={form.about}
              onChange={(e) => setForm((f) => ({ ...f, about: e.target.value }))}
              maxLength={6000}
              rows={4}
              placeholder="نص تفصيلي يظهر في قسم «من نحن»..."
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 hover:border-slate-600 focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500/50"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <ImageUpload
              label="غلاف الصفحة العامة"
              title="غلاف الصفحة العامة"
              value={form.cover_url || null}
              onChange={(url) => setForm((f) => ({ ...f, cover_url: url }))}
              aspect="wide"
              uploadEndpoint="/api/clinic/public-page/cover"
            />
            <ImageUpload
              label="شعار العيادة"
              title="شعار يظهر في رأس الصفحة العامة"
              value={form.logo || null}
              onChange={(url) => setForm((f) => ({ ...f, logo: url }))}
              aspect="square"
              uploadEndpoint="/api/clinic/public-page/logo"
            />
          </div>
          <div>
            <Toggle
              checked={form.show_providers}
              onChange={(v) => setForm((f) => ({ ...f, show_providers: v }))}
              label="إظهار مقدمي الخدمة"
            />
            <p className="mt-1 text-xs text-slate-500">
              ملاحظة: إخفاء مقدمي الخدمة من الصفحة العامة لا يمنع الحجز لديهم.
            </p>
          </div>
          <div>
            <Toggle
              checked={form.discovery_enabled}
              onChange={(v) => setForm((f) => ({ ...f, discovery_enabled: v }))}
              label="السماح باكتشاف العيادة في البحث العام"
            />
            <p className="mt-1 text-xs text-slate-500">
              عند التفعيل، قد تظهر عيادتك في نتائج البحث والاكتشاف العام.
            </p>
          </div>
          {contactError ? <p className="text-sm text-red-600">{contactError}</p> : null}
          <div>
            <button
              type="button"
              onClick={onSaveInfo}
              disabled={saving}
              className="rounded-full bg-gradient-to-l from-cyan-500 to-emerald-500 px-6 py-2.5 text-sm font-semibold text-slate-950 hover:shadow-[0_0_20px_rgba(34,211,238,0.45)] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {saving ? 'جارٍ الحفظ...' : 'حفظ الهوية'}
            </button>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-6">
          <Toggle checked={config.show_phone} onChange={(v) => void update({ show_phone: v }).then(() => load())} label="إظهار رقم الهاتف" />
          <Toggle checked={config.show_prices} onChange={(v) => void update({ show_prices: v }).then(() => load())} label="إظهار الأسعار" />
        </div>
      </Section>
    </div>
  );
}
