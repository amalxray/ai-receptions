'use client';

import React from 'react';

import Section from './shared/Section';
import Toggle from './shared/Toggle';
import type { InfoFormState, PageConfig, UpdateFn, ReloadFn, PublicContactField } from './shared/types';
import { validatePublicContactValue, SOCIAL_FIELD_KEYS, SOCIAL_ICONS, SOCIAL_LABELS, SECTION_LABELS } from './SocialContactForm';

type Props = {
  config: PageConfig;
  form: Record<PublicContactField, string>;
  setForm: React.Dispatch<React.SetStateAction<Record<PublicContactField, string>>>;
  update: UpdateFn;
  toggleSection: (key: string, v: boolean) => void;
  toggleService: (id: string) => void;
  toggleProvider: (id: string) => void;
};

/** Content tab (moved verbatim): contact + sections + services + providers. */
export default function ContentTab({ config, form, setForm, update, toggleSection, toggleService, toggleProvider }: Props) {
  return (
    <div className="space-y-4">
      <Section title="روابط التواصل" subtitle="تظهر في قسم التواصل بالصفحة العامة.">
        <div className="grid gap-4 sm:grid-cols-2">
          {SOCIAL_FIELD_KEYS.map((key) => {
            const error = validatePublicContactValue(key, form[key]);
            const baseClass = `w-full rounded-lg border bg-slate-950 px-3 py-2 text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40 ${error ? 'border-red-500/50 bg-red-950/30 text-red-200' : 'border-slate-700 text-slate-100 hover:border-slate-600'}`;
            return (
              <label key={key} className="block">
                <span className="mb-1 flex items-center gap-2 text-sm font-medium text-slate-400">
                  <span aria-hidden="true">{SOCIAL_ICONS[key]}</span>
                  {SOCIAL_LABELS[key]}
                </span>
                <input
                  type={key === 'email' ? 'email' : key === 'website' ? 'url' : 'text'}
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  placeholder={
                    key === 'email'
                      ? 'example@clinic.com'
                      : key === 'website'
                        ? 'https://example.com'
                        : key === 'whatsapp'
                          ? '+9665...'
                          : key === 'facebook'
                            ? 'https://facebook.com/...'
                            : 'https://instagram.com/...'
                  }
                  aria-invalid={Boolean(error)}
                  className={baseClass}
                />
                {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : null}
              </label>
            );
          })}
        </div>
      </Section>

      <Section title="أقسام الصفحة" subtitle="أظهر أو أخفِ كل قسم. الأقسام المخفية لا تعرض محتوى فارغًا.">
        <div className="grid gap-3 sm:grid-cols-2">
          {Object.entries(SECTION_LABELS).map(([key, label]) => (
            <Toggle key={key} checked={config.sections[key] ?? false} onChange={(v) => toggleSection(key, v)} label={label} />
          ))}
        </div>
      </Section>

      <Section title="الخدمات" subtitle="اختر الخدمات التي تظهر في الصفحة العامة. الإخفاء لا يؤثر على الحجز.">
        {config.services.length === 0 ? (
          <p className="text-sm text-slate-400">لا توجد خدمات نشطة بعد. أضف خدمات من صفحة «الخدمات».</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {config.services.map((s) => (
              <Toggle key={s.id} checked={!config.hidden_services.includes(s.id)} onChange={() => toggleService(s.id)} label={s.name} />
            ))}
          </div>
        )}
      </Section>

      <Section title="مقدمو الخدمة" subtitle="اختر من يظهر في الصفحة العامة. لا يؤثر على تخصيص الحجز.">
        {config.providers.length === 0 ? (
          <p className="text-sm text-slate-400">لا يوجد مقدمو خدمة بعد. أضفهم من صفحة «مقدمو الخدمة».</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {config.providers.map((p) => (
              <Toggle key={p.id} checked={!config.hidden_providers.includes(p.id)} onChange={() => toggleProvider(p.id)} label={`${p.name}${p.specialty ? ` — ${p.specialty}` : ''}`} />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
