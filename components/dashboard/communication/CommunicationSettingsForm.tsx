'use client';

import { useEffect, useState } from 'react';
import { useSupabaseConfig } from '@/lib/useSupabaseConfig';
import { useClinicContext } from '@/lib/useClinicContext';
import type { ClinicCommunicationSettings } from '@/lib/communications/settings';
import type { ChannelType } from '@/lib/communications/channels/types';

const CHANNELS: { value: ChannelType; label: string }[] = [
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'telegram', label: 'Telegram' },
];

const NOTIFICATION_TYPES: { key: 'reminderChannels' | 'confirmationChannels' | 'cancellationChannels'; label: string }[] = [
  { key: 'reminderChannels', label: 'Reminders' },
  { key: 'confirmationChannels', label: 'Confirmations' },
  { key: 'cancellationChannels', label: 'Cancellations' },
];

const DEFAULT_SETTINGS: ClinicCommunicationSettings = {
  clinicId: '',
  emailEnabled: true,
  smsEnabled: false,
  whatsappEnabled: false,
  telegramEnabled: false,
  reminderChannels: ['email'],
  confirmationChannels: ['email'],
  cancellationChannels: ['email'],
  defaultChannel: 'email',
  remindersEnabled: true,
  reminderOffsetMinutes1: 1440,
  reminderOffsetMinutes2: 120,
  confirmationNotifications: true,
  cancellationNotifications: true,
  reschedulingNotifications: true,
  notificationLanguage: 'ar',
};

export default function CommunicationSettingsForm() {
  const { isConfigured: isSupabaseConfigured } = useSupabaseConfig();
  const {
    clinicId,
    authHeaders,
    loading: clinicLoading,
    error: clinicError,
  } = useClinicContext();
  const [settings, setSettings] = useState<ClinicCommunicationSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [calendarStatus, setCalendarStatus] = useState<{ configured: boolean; connected: boolean; connected_at: string | null; email: string | null; missing_settings: string[] } | null>(null);
  const [calendarBusy, setCalendarBusy] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    if (clinicLoading) { setLoading(true); return; }
    if (!clinicId) {
      if (clinicError) setError(clinicError);
      setLoading(false);
      return;
    }
    void loadSettings(clinicId);
    void loadCalendarStatus(clinicId);
    const calendarResult = new URLSearchParams(window.location.search).get('google_calendar');
    if (calendarResult === 'connected') setSuccess('تم ربط Google Calendar بهذه العيادة بنجاح.');
    if (calendarResult === 'failed') setError('لم يكتمل ربط Google Calendar. تحقق من إعداد OAuth وحاول مرة أخرى.');
    if (calendarResult === 'cancelled') setError('تم إلغاء ربط Google Calendar.');
    if (calendarResult) {
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('google_calendar');
      window.history.replaceState(null, '', `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSupabaseConfigured, clinicLoading, clinicId]);

  async function loadCalendarStatus(id: string) {
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/clinic/google-calendar?clinic_id=${encodeURIComponent(id)}`, { headers });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'تعذر تحميل حالة التقويم.');
      setCalendarStatus(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل حالة التقويم.');
    }
  }

  function connectGoogleCalendar() {
    if (!clinicId) return;
    setCalendarBusy(true);
    setError(null);
    window.location.assign('/api/clinic/google-calendar/connect');
  }

  async function disconnectGoogleCalendar() {
    if (!clinicId) return;
    setCalendarBusy(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/clinic/google-calendar?clinic_id=${encodeURIComponent(clinicId)}`, {
        method: 'DELETE',
        headers,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'تعذر فصل Google Calendar.');
      setCalendarStatus((current) => current ? { ...current, connected: false, connected_at: null, email: null } : current);
      setSuccess('تم فصل تقويم Google عن هذه العيادة.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر فصل Google Calendar.');
    } finally {
      setCalendarBusy(false);
    }
  }

  async function loadSettings(id: string) {
    setLoading(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/clinic/communication-settings?clinic_id=${encodeURIComponent(id)}`, { headers });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to load settings');
      setSettings(body.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }

  function toggleChannel(channel: ChannelType) {
    setSettings((prev) => {
      const key = channel === 'email' ? 'emailEnabled' : channel === 'sms' ? 'smsEnabled' : channel === 'whatsapp' ? 'whatsappEnabled' : 'telegramEnabled';
      return { ...prev, [key]: !prev[key] };
    });
  }

  function toggleNotificationChannel(typeKey: 'reminderChannels' | 'confirmationChannels' | 'cancellationChannels', channel: ChannelType) {
    setSettings((prev) => {
      const current = prev[typeKey];
      const next = current.includes(channel) ? current.filter((c) => c !== channel) : [...current, channel];
      return { ...prev, [typeKey]: next };
    });
  }

  async function handleSave() {
    if (!clinicId) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/clinic/communication-settings?clinic_id=${encodeURIComponent(clinicId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(settings),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to save settings');
      setSettings(body.data);
      setSuccess('Settings saved successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-400">Loading communication settings...</p>;
  }

  return (
    <div className="space-y-6">
      {error && (
        <div role="alert" className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}
      {success && (
        <div role="status" className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {success}
        </div>
      )}

      <section className="rounded-[1.5rem] border border-slate-800 bg-slate-950/70 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-white">تقويم Google للعيادة</h3>
            <p className="mt-1 text-xs text-slate-400">
              اربط حساب Google الخاص بهذه العيادة لمزامنة الحجوزات والتحقق من الأوقات المشغولة.
            </p>
            <p className={`mt-2 text-sm ${calendarStatus?.connected ? 'text-emerald-300' : 'text-amber-300'}`}>
              {!calendarStatus
                ? 'جارٍ التحقق من حالة الربط...'
                : !calendarStatus.configured
                  ? `إعداد OAuth غير مكتمل. الإعدادات الناقصة: ${calendarStatus.missing_settings.join('، ')}`
                  : calendarStatus.connected
                    ? `التقويم متصل بالحساب ${calendarStatus.email ?? 'Google'}${calendarStatus.connected_at ? ` منذ ${new Date(calendarStatus.connected_at).toLocaleString('ar')}` : ''}.`
                    : 'التقويم غير متصل؛ ستُسجل الحجوزات محلياً فقط.'}
            </p>
          </div>
          {calendarStatus?.connected ? (
            <button
              type="button"
              onClick={() => void disconnectGoogleCalendar()}
              disabled={calendarBusy}
              className="rounded-xl border border-red-500/40 px-4 py-2 text-sm font-semibold text-red-300 disabled:opacity-50"
            >
              {calendarBusy ? 'جارٍ الفصل...' : 'فصل التقويم'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void connectGoogleCalendar()}
              disabled={calendarBusy || !clinicId}
              className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {calendarBusy ? 'جارٍ التحقق من الإعداد...' : 'ربط Google Calendar'}
            </button>
          )}
        </div>
      </section>

      {/* Channel enablement */}
      <div className="rounded-[1.5rem] border border-slate-800 bg-slate-950/70 p-5">
        <p className="text-sm font-semibold text-white">Enabled Channels</p>
        <p className="mt-1 text-xs text-slate-400">Toggle which channels this clinic can use for notifications.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {CHANNELS.map((channel) => {
            const enabled = channel.value === 'email' ? settings.emailEnabled : channel.value === 'sms' ? settings.smsEnabled : channel.value === 'whatsapp' ? settings.whatsappEnabled : settings.telegramEnabled;
            return (
              <button
                key={channel.value}
                type="button"
                onClick={() => toggleChannel(channel.value)}
                className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${
                  enabled ? 'border-cyan-500/70 bg-cyan-500/10' : 'border-slate-800 bg-slate-950/60'
                }`}
              >
                <span className="text-sm font-semibold text-white">{channel.label}</span>
                <span className={`text-xs font-semibold ${enabled ? 'text-cyan-300' : 'text-slate-500'}`}>
                  {enabled ? 'ON' : 'OFF'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Notification-type channel routing */}
      <div className="rounded-[1.5rem] border border-slate-800 bg-slate-950/70 p-5">
        <p className="text-sm font-semibold text-white">Notification Channels</p>
        <p className="mt-1 text-xs text-slate-400">Choose which channels are used for each notification type.</p>
        <div className="mt-4 space-y-5">
          {NOTIFICATION_TYPES.map((type) => (
            <div key={type.key}>
              <p className="text-sm font-medium text-slate-300">{type.label}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {CHANNELS.map((channel) => {
                  const selected = settings[type.key].includes(channel.value);
                  return (
                    <button
                      key={channel.value}
                      type="button"
                      onClick={() => toggleNotificationChannel(type.key, channel.value)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                        selected ? 'border-cyan-500/70 bg-cyan-500/10 text-cyan-300' : 'border-slate-700 text-slate-400'
                      }`}
                    >
                      {channel.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Default channel */}
      <div className="rounded-[1.5rem] border border-slate-800 bg-slate-950/70 p-5">
        <p className="text-sm font-semibold text-white">Default Channel</p>
        <p className="mt-1 text-xs text-slate-400">Used when a notification type has no explicit channel routing.</p>
        <select
          value={settings.defaultChannel}
          onChange={(e) => setSettings((prev) => ({ ...prev, defaultChannel: e.target.value as ChannelType }))}
          className="mt-3 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
        >
          {CHANNELS.map((channel) => (
            <option key={channel.value} value={channel.value}>
              {channel.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-full bg-cyan-500 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}