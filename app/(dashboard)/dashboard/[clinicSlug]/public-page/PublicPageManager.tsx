'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSupabaseConfig } from '@/lib/useSupabaseConfig';
import { useClinicContext } from '@/lib/useClinicContext';
import Skeleton from '@/components/ui/Skeleton';
import { toast } from '@/components/ui/Toast';
import { Tabs, type PublicPageTabKey } from '@/components/dashboard/public-page/shared/Tabs';
import ShareTab from '@/components/dashboard/public-page/ShareTab';
import IdentityTab from '@/components/dashboard/public-page/IdentityTab';
import AppearanceTab from '@/components/dashboard/public-page/AppearanceTab';
import ContentTab from '@/components/dashboard/public-page/ContentTab';
import { SOCIAL_FIELD_KEYS, validatePublicContactValue } from '@/components/dashboard/public-page/SocialContactForm';
import type { InfoFormState, PageConfig, PublicContactField, UpdatePatch } from '@/components/dashboard/public-page/shared/types';

const INFO_INIT: InfoFormState = {
  description: '', tagline: '', about: '', cover_url: '', logo: '',
  show_providers: true, discovery_enabled: false,
};
const CONTACT_INIT: Record<PublicContactField, string> = {
  whatsapp: '', facebook: '', instagram: '', website: '', email: '',
};

export default function PublicPageManager() {
  const { isConfigured, checkFailed } = useSupabaseConfig();
  const { clinicId, authHeaders, loading: clinicLoading, error: clinicError } = useClinicContext();
  const [config, setConfig] = useState<PageConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [provisioning, setProvisioning] = useState(false);
  const [tab, setTab] = useState<PublicPageTabKey>('identity');
  const [infoForm, setInfoForm] = useState<InfoFormState>(INFO_INIT);
  const [contactForm, setContactForm] = useState(CONTACT_INIT);

  const load = useCallback(async () => {
    if (!clinicId) {
      setError('تعذّر تحميل بيانات الصفحة — تحقق من تسجيل الدخول/العضوية.');
      setLoading(false);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/clinic/public-page?clinic_id=${encodeURIComponent(clinicId)}`, { headers });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        if (res.status === 401) throw new Error('انتهت الجلسة — سجّل الدخول مجددًا.');
        if (res.status === 403) throw new Error('لا تملك عضوية في هذه العيادة.');
        if (res.status === 404) throw new Error('العيادة غير موجودة.');
        throw new Error(body?.error ?? `تعذّر التحميل (${res.status})`);
      }
      const { data } = (await res.json()) as { data: PageConfig };
      setConfig(data);
      setInfoForm({
        description: data.description ?? '', tagline: data.tagline ?? '', about: data.about ?? '',
        cover_url: data.cover_url ?? '', logo: data.logo ?? '',
        show_providers: data.show_providers, discovery_enabled: data.discovery_enabled,
      });
      setContactForm({
        whatsapp: data.social_links?.whatsapp ?? '', facebook: data.social_links?.facebook ?? '',
        instagram: data.social_links?.instagram ?? '', website: data.social_links?.website ?? '',
        email: data.email ?? data.social_links?.email ?? '',
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذّر الاتصال بالخادم — حاول مجددًا.');
      setLoading(false);
    } finally {
      setLoading(false);
    }
  }, [clinicId, authHeaders]);

  useEffect(() => { void load(); }, [load]);

  const update = useCallback(
    async (patch: UpdatePatch) => {
      if (!clinicId) return false;
      setSaving(true);
      setError(null);
      setSuccess(null);
      try {
        const headers = await authHeaders();
        const res = await fetch(`/api/clinic/public-page?clinic_id=${encodeURIComponent(clinicId)}`, {
          method: 'PATCH',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        const body = (await res.json().catch(() => null)) as { data?: PageConfig; error?: string } | null;
        if (!res.ok) throw new Error(body?.error ?? `فشل الحفظ (${res.status})`);
        if (body?.data) setConfig(body.data);
        toast.success('تم حفظ التغييرات بنجاح');
        return true;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'تعذر حفظ التغييرات');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [clinicId, authHeaders]
  );

  const saveInfo = () => {
    const invalidField = SOCIAL_FIELD_KEYS.find((key) => validatePublicContactValue(key, contactForm[key]) !== null);
    if (invalidField) {
      toast.error('يرجى تصحيح بيانات التواصل قبل الحفظ');
      return;
    }
    void update({
      description: infoForm.description.trim() || null,
      tagline: infoForm.tagline.trim() || null,
      about: infoForm.about.trim() || null,
      cover_url: infoForm.cover_url.trim() || null,
      logo: infoForm.logo.trim() || null,
      social_links: {
        whatsapp: contactForm.whatsapp.trim() || null,
        facebook: contactForm.facebook.trim() || null,
        instagram: contactForm.instagram.trim() || null,
        website: contactForm.website.trim() || null,
        email: contactForm.email.trim() || null,
      },
    }).then((saved) => {
      if (saved) void load();
    });
  };

  const toggleSection = (key: string, value: boolean) => {
    void update({ sections: { [key]: value } }).then(() => load());
  };

  const toggleService = (id: string) => {
    if (!config) return;
    const hidden = config.hidden_services.includes(id);
    const next = hidden ? config.hidden_services.filter((x) => x !== id) : [...config.hidden_services, id];
    void update({ hidden_services: next }).then(() => load());
  };

  const toggleProvider = (id: string) => {
    if (!config) return;
    const hidden = config.hidden_providers.includes(id);
    const next = hidden ? config.hidden_providers.filter((x) => x !== id) : [...config.hidden_providers, id];
    void update({ hidden_providers: next }).then(() => load());
  };
  const downloadQr = async () => {
    if (!config?.public_id) return;
    try {
      const res = await fetch(`/api/qr?public_id=${encodeURIComponent(config.public_id)}`);
      if (!res.ok) throw new Error('QR download failed');
      const svg = await res.text();
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `clinic-qr-${config.slug}.svg`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('تم تنزيل رمز QR');
    } catch {
      toast.error('تعذر تنزيل رمز QR');
    }
  };

  const copyLink = async () => {
    if (!config) return;
    try {
      await navigator.clipboard.writeText(config.canonicalUrl);
      toast.success('تم نسخ رابط الصفحة العامة');
    } catch {
      toast.error('تعذر نسخ الرابط');
    }
  };

  const provisionSubdomain = async () => {
    if (!config || !clinicId || provisioning) return;
    setProvisioning(true);
    setError(null);
    setSuccess(null);
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/clinic/add-subdomain', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinic_id: clinicId, slug: config.slug }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || body?.detail || `تعذر تجهيز النطاق (${res.status})`);
      toast.success(body?.alreadyExisted ? 'النطاق مسجّل ومجهّز بالفعل.' : 'تم تجهيز النطاق.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'تعذر تجهيز النطاق');
    } finally {
      await load();
      setProvisioning(false);
    }
  };
  if (loading || clinicLoading || !clinicId) return <Skeleton className="h-64 w-full" />;

  if (!isConfigured && !checkFailed) {
    return <p className="text-sm text-slate-500">تعذر التحقق من الإعدادات — حاول مرة أخرى لاحقًا.</p>;
  }

  if (!config) {
    if (error) {
      return (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6">
          <p className="text-sm text-red-700" role="alert">{error}</p>
          <button type="button" onClick={() => void load()} disabled={loading} aria-busy={loading}
            className="mt-3 rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">
            {loading ? 'جارٍ التحميل...' : 'إعادة التحميل'}
          </button>
        </div>
      );
    }
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <p className="text-sm text-slate-600">لا توجد بيانات للصفحة العامة.</p>
      </div>
    );
  }

  const contactError: string | null = null;

  return (
    <div className="space-y-5">
      {/* النتائج (حفظ/نسخ/تنزيل/نطاق) تُعرض عبر التنبيهات العالمية (components/ui/Toast) بدلاً من <p> مضمنة */}
      <Tabs active={tab} onChange={setTab} />
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'share' && (
          <ShareTab config={config} provisioning={provisioning}
            onEnsureSubdomain={() => void provisionSubdomain()}
            onCopyLink={() => void copyLink()} onDownloadQr={() => void downloadQr()} />
        )}
        {tab === 'identity' && (
          <IdentityTab config={config} form={infoForm} setForm={setInfoForm}
            contactError={contactError} saving={saving} onSaveInfo={saveInfo} update={update} load={load} />
        )}
        {tab === 'appearance' && <AppearanceTab config={config} update={update} load={load} />}
        {tab === 'content' && (
          <ContentTab config={config} form={contactForm} setForm={setContactForm} update={update}
            toggleSection={toggleSection} toggleService={toggleService} toggleProvider={toggleProvider} />
        )}
      </div>
    </div>
  );
}
