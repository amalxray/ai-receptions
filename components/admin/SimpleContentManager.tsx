'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

export type FieldSpec = {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'checkbox' | 'image';
  required?: boolean;
  placeholder?: string;
};

type Props = {
  title: string;
  subtitle: string;
  endpoint: string; // admin CRUD base, e.g. /api/admin/tips
  fields: FieldSpec[];
  icon: string;
};

/**
 * SIMPLE CONTENT MANAGER — generic owner CRUD list for the /ask content
 * tables (stories / tips / faq). Field-driven: list + create + edit + delete
 * against the guarded admin APIs, with public visibility right after save.
 */
export default function SimpleContentManager({ title, subtitle, endpoint, fields, icon }: Props) {
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(endpoint);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'فشل التحميل');
      setItems((json.data ?? []) as Record<string, unknown>[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل التحميل');
    } finally {
      setLoading(false);
    }
  }, [endpoint]);
  useEffect(() => { void load(); }, [load]);

  const openNew = () => {
    const init: Record<string, unknown> = {};
    for (const f of fields) init[f.key] = f.type === 'checkbox' ? true : f.type === 'number' ? 0 : '';
    setDraft(init);
    setEditingId(null);
    setOpen(true);
  };

  const openEdit = (item: Record<string, unknown>) => {
    const init: Record<string, unknown> = {};
    for (const f of fields) init[f.key] = item[f.key] ?? (f.type === 'checkbox' ? false : f.type === 'number' ? 0 : '');
    setDraft(init);
    setEditingId(String(item.id));
    setOpen(true);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {};
      for (const f of fields) {
        const v = draft[f.key];
        if (f.type === 'number') payload[f.key] = Number(v) || 0;
        else if (f.type === 'checkbox') payload[f.key] = Boolean(v);
        else payload[f.key] = String(v ?? '').trim() || (f.required ? '' : null);
      }
      const res = editingId
        ? await fetch(endpoint + '/' + editingId, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        : await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'فشل الحفظ');
      setNotice('✓ حُفظ');
      setOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل الحفظ');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('حذف نهائياً؟')) return;
    setBusy(true);
    try {
      const res = await fetch(endpoint + '/' + id, { method: 'DELETE' });
      if (!res.ok) throw new Error('فشل الحذف');
      setNotice('✓ حُذف');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل الحذف');
    } finally {
      setBusy(false);
    }
  };

  const mainField = fields[0];
  const second = fields[1];

  return (
    <div className="rounded-[2rem] border border-slate-800 bg-slate-900/90 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">{icon} {title}</h2>
          <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
        </div>
        <button type="button" onClick={openNew} className="rounded-full bg-violet-600 px-5 py-2 text-sm font-semibold text-white hover:bg-violet-500">➕ إضافة</button>
      </div>

      {error && <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div>}
      {notice && <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{notice}</div>}

      {loading ? (
        <p className="mt-5 text-sm text-slate-400">جارٍ التحميل...</p>
      ) : items.length === 0 ? (
        <p className="mt-5 text-sm text-slate-500">لا توجد عناصر بعد.</p>
      ) : (
        <ul className="mt-5 divide-y divide-slate-800">
          {items.map((it) => (
            <li key={String(it.id)} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
              <div className="min-w-0">
                {typeof it.image_url === 'string' && it.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.image_url} alt="" className="mb-1 h-14 w-20 rounded-lg object-cover" loading="lazy" />
                ) : null}
                <p className="truncate font-semibold text-slate-200">{String(it[mainField.key] ?? '')}</p>
                {second && <p className="truncate text-xs text-slate-500">{String(it[second.key] ?? '')}</p>}
                {typeof it.is_active === 'boolean' && !it.is_active && <span className="text-xs text-rose-300">🔴 مخفي</span>}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => openEdit(it)} className="rounded-full bg-slate-700 px-3 py-1 text-xs text-slate-200 hover:bg-slate-600">✏️ تعديل</button>
                <button type="button" onClick={() => void remove(String(it.id))} className="rounded-full bg-rose-500/15 px-3 py-1 text-xs text-rose-300 hover:bg-rose-500/25">🗑️ حذف</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-4">
          <div className="mx-auto w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">{editingId ? '✏️ تعديل' : '➕ إضافة'}</h3>
              <button type="button" onClick={() => setOpen(false)} className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">إغلاق ✕</button>
            </div>
            <div className="mt-4 space-y-3">
              {fields.map((f) => (
                <div key={f.key}>
                  <label className="block text-xs text-slate-400">{f.label}{f.required ? ' *' : ''}</label>
                  {f.type === 'textarea' ? (
                    <textarea
                      value={String(draft[f.key] ?? '')}
                      onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                      rows={f.key === 'content' ? 5 : 3}
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                    />
                  ) : f.type === 'checkbox' ? (
                    <label className="mt-1 flex items-center gap-2 text-sm text-slate-300">
                      <input type="checkbox" checked={Boolean(draft[f.key])} onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.checked }))} className="accent-violet-500" />
                      مفعّل
                    </label>
                  ) : (
                    <input
                      type={f.type === 'number' ? 'number' : 'text'}
                      dir={f.type === 'image' ? 'ltr' : undefined}
                      value={String(draft[f.key] ?? '')}
                      onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => void save()} disabled={busy} className="rounded-full bg-violet-600 px-5 py-2 text-sm font-semibold text-white hover:bg-violet-500">{busy ? 'جارٍ الحفظ...' : '💾 حفظ'}</button>
              <button type="button" onClick={() => setOpen(false)} className="rounded-full bg-slate-800 px-4 py-2 text-sm text-slate-300">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
