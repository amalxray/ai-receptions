'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSupabaseConfig } from '@/lib/useSupabaseConfig';
import { useClinicContext } from '@/lib/useClinicContext';
import EmptyState from '@/components/dashboard/EmptyState';
import Skeleton from '@/components/ui/Skeleton';
import LocationPicker, { type LocationValue } from '@/components/dashboard/clinic/LocationPicker';

type ClinicProfile = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  address_detail: string | null;
  city: string | null;
  area: string | null;
  email: string | null;
  slug: string;
  latitude: number | null;
  longitude: number | null;
};

type SetupStatus = {
  status: 'ready' | 'incomplete';
  ready: boolean;
  checks: {
    profile: boolean;
    providers: boolean;
    services: boolean;
    schedule: boolean;
    assignment: boolean;
  };
  assignmentStatus: 'ok' | 'missing' | 'not_used';
  missing: string[];
};

const CHECK_ITEMS: { key: keyof SetupStatus['checks']; label: string; href: string; cta: string }[] = [
  { key: 'profile', label: 'Clinic profile', href: '/dashboard/clinic-setup', cta: 'Complete your clinic profile' },
  { key: 'providers', label: 'Providers', href: '/dashboard/providers', cta: 'Add your first provider' },
  { key: 'services', label: 'Services', href: '/dashboard/services', cta: 'Add your first service' },
  { key: 'schedule', label: 'Working hours', href: '/dashboard/providers', cta: 'Configure working hours' },
  { key: 'assignment', label: 'Service assignments', href: '/dashboard/providers', cta: 'Assign services to providers' },
];

export default function ClinicSetupManager() {
  // `configLoading` = the Supabase health-check is still in flight; `checkFailed`
  // = the check itself errored (network/server). Neither may be reported to the
  // user as "Supabase is not configured".
  const {
    isConfigured: isSupabaseConfigured,
    loading: configLoading,
    checkFailed,
  } = useSupabaseConfig();
  const {
    clinicId,
    authHeaders,
    loading: clinicLoading,
    error: clinicError,
  } = useClinicContext();
  const [profile, setProfile] = useState<ClinicProfile | null>(null);
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', address: '', email: '' });
  // Location (map + geocoding) — persisted via the profile API (clinics.lat/lng).
  const [location, setLocation] = useState<LocationValue>({
    latitude: '',
    longitude: '',
    city: '',
    area: '',
    address: '',
    address_detail: '',
  });

  useEffect(() => {
    if (configLoading) { setLoading(true); return; }
    // Not configured on purpose → the "not configured" state is handled in
    // render(). A failed check is NOT a configuration answer.
    if (!isSupabaseConfigured && !checkFailed) { setLoading(false); return; }
    if (clinicLoading) { setLoading(true); return; }
    if (!clinicId) {
      if (clinicError) setError(clinicError);
      setLoading(false);
      return;
    }
    let mounted = true;
    async function load() {
      setError(null);
      try {
        await Promise.all([loadProfile(clinicId), loadStatus(clinicId)]);
      } catch (e) {
        if (mounted) setError(e instanceof Error ? e.message : 'Failed to load clinic');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSupabaseConfigured, configLoading, checkFailed, clinicLoading, clinicId]);

  async function loadProfile(id: string) {
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/clinic/profile?clinic_id=${encodeURIComponent(id)}`, { headers });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to load profile');
      setProfile(body.data);
      setForm({
        name: body.data.name || '',
        phone: body.data.phone || '',
        address: body.data.address || '',
        email: body.data.email ?? body.data.website ?? '',
      });
      setLocation({
        latitude: body.data.latitude != null ? String(body.data.latitude) : '',
        longitude: body.data.longitude != null ? String(body.data.longitude) : '',
        city: body.data.city || '',
        area: body.data.area || '',
        address: '',
        address_detail: body.data.address_detail || body.data.address || '',
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load profile');
    }
  }

  async function loadStatus(id: string) {
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/clinic/setup-status?clinic_id=${encodeURIComponent(id)}`, { headers });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to load status');
      setStatus(body.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load status');
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!clinicId) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/clinic/profile?clinic_id=${encodeURIComponent(clinicId)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify({
          name: form.name,
          phone: form.phone || null,
          address: form.address || null,
          email: form.email || null,
          latitude: location.latitude !== '' ? Number(location.latitude) : undefined,
          longitude: location.longitude !== '' ? Number(location.longitude) : undefined,
          city: location.city || null,
          area: location.area || null,
          address_detail: location.address_detail || null,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to save profile');
      setProfile(body.data);
      setSuccess('Clinic profile saved.');
      await loadStatus(clinicId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  }

  if (loading || configLoading) return <Skeleton className="h-60" />;
  // Only claim "not configured" once the health-check actually answered that
  // way: while it is in flight we show the skeleton, and if it failed we fall
  // through to the real load error below.
  if (!isSupabaseConfigured && !checkFailed) return <EmptyState title="Supabase is not configured" description="Enable your clinic backend to set up your clinic." />;
  if (error && !profile) return <EmptyState title="Service unavailable" description={error} />;

  return (
    <div className="space-y-6">
      {error && <div role="alert" className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}
      {success && <div role="status" className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{success}</div>}

      {/* Readiness banner */}
      {status && (
        <div className={`rounded-[1.5rem] border p-5 ${status.ready ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-amber-500/40 bg-amber-500/10'}`}>
          <div className="flex items-center gap-3">
            <span className={`flex h-10 w-10 items-center justify-center rounded-full text-xl ${status.ready ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>
              {status.ready ? '✓' : '!'}
            </span>
            <div>
              <p className={`text-lg font-semibold ${status.ready ? 'text-emerald-300' : 'text-amber-300'}`}>
                {status.ready ? 'Ready for booking' : 'Setup incomplete'}
              </p>
              <p className="text-sm text-slate-400">
                {status.ready
                  ? 'Your clinic is ready to accept its first patient.'
                  : 'Complete the checklist below to start accepting bookings.'}
              </p>
            </div>
          </div>
          {!status.ready && status.missing.length > 0 && (
            <ul className="mt-4 space-y-1 text-sm text-slate-300">
              {status.missing.map((m) => (
                <li key={m} className="flex items-center gap-2">
                  <span className="text-amber-400">•</span> {m}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Checklist */}
      {status && (
        <div className="rounded-[1.5rem] border border-slate-800 bg-slate-950/70 p-5">
          <p className="text-sm font-semibold text-white">Setup Checklist</p>
          <div className="mt-4 space-y-2">
            {CHECK_ITEMS.map((item) => {
              const done = status.checks[item.key];
              return (
                <div key={item.key} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${done ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-500'}`}>
                      {done ? '✓' : ''}
                    </span>
                    <span className={`text-sm ${done ? 'text-slate-300' : 'text-slate-400'}`}>{item.label}</span>
                  </div>
                  {!done && (
                    <Link href={item.href} className="rounded-full bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400">
                      {item.cta}
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Clinic profile form */}
      <div className="rounded-[1.5rem] border border-slate-800 bg-slate-950/70 p-5">
        <p className="text-sm font-semibold text-white">Clinic Profile</p>
        <p className="mt-1 text-xs text-slate-400">Basic information shown to patients on the booking page.</p>
        <form onSubmit={handleSaveProfile} className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-xs text-slate-400">Clinic name *</label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required className="mt-1 w-full rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-slate-100" />
          </div>
          <div>
            <label className="text-xs text-slate-400">Phone</label>
            <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="mt-1 w-full rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-slate-100" />
          </div>
          <div>
            <label className="text-xs text-slate-400">العنوان</label>
            <input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} className="mt-1 w-full rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-slate-100" />
          </div>
          <div>
            <label className="text-xs text-slate-400">البريد الإلكتروني ✉️</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              dir="ltr"
              className="mt-1 w-full rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-slate-100"
            />
          </div>
          <div className="md:col-span-2">
            <p className="mb-2 text-xs font-semibold text-slate-300">📍 موقع العيادة على الخريطة</p>
            <p className="mb-3 text-xs text-slate-500">
              اضغط على الخريطة أو اسحب العلامة لضبط الموقع — يظهر على صفحتك العامة ويساعد المرضى في الوصول.
            </p>
            <LocationPicker value={location} onChange={setLocation} />
            {location.latitude !== '' && location.longitude !== '' && (
              <a
                href={`https://www.google.com/maps?q=${location.latitude},${location.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-block text-sm font-semibold text-cyan-400"
              >
                🗺️ معاينة في Google Maps
              </a>
            )}
          </div>
          <div className="md:col-span-2 flex justify-end">
            <button type="submit" disabled={saving} className="rounded-full bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60">
              {saving ? 'جارٍ الحفظ...' : 'حفظ الملف'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}