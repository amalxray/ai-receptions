'use client';

import { useState } from 'react';
import NotificationsInbox from '@/components/notifications/NotificationsInbox';
import NotificationTemplateManager from '@/components/dashboard/NotificationTemplateManager';

const TABS = [
  { id: 'inbox', label: 'الواردة' },
  { id: 'templates', label: 'القوالب' },
] as const;

type TabId = (typeof TABS)[number]['id'];

/**
 * #35 / #36 — one page, two concerns: the live in-app inbox and the editable
 * message templates. Keeping them as tabs preserves both deep links.
 */
export default function NotificationsTabs() {
  const [tab, setTab] = useState<TabId>('inbox');

  return (
    <div className="space-y-5">
      <div className="flex w-fit rounded-2xl border border-slate-800 bg-slate-900/80 p-1" role="tablist">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={`rounded-xl px-5 py-1.5 text-xs font-medium transition ${
                active ? 'bg-cyan-500 font-semibold text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'inbox' ? <NotificationsInbox /> : <NotificationTemplateManager />}
    </div>
  );
}
