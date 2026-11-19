import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  defaultPublicPageSections,
  readPublicProfile,
  updatePublicPageConfig,
} from '@/lib/services/clinicPublicConfig';
import { revalidatePath } from 'next/cache';
import { resolveGoogleReviewSettings } from '@/lib/services/googleReviewSettings';

// CLINIC PUBLIC PAGE OWNER EXPERIENCE — service tests.
// Covers: activity-aware default templates, profile reading with defaults,
// and the tenant-scoped update (sections merge, empty-string deletes, and that
// hidden services/providers are purely presentation-level).

const CID = '22222222-2222-2222-2222-222222222222';

const mockState = vi.hoisted(() => ({
  row: null as any,
  error: null as any,
  updateCall: null as any,
  eqCalls: [] as string[],
}));

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      if (table === 'clinics') {
        const chain: any = {};
        chain.select = () => chain;
        chain.is = () => chain;
        chain.eq = (col: string, val: unknown) => {
          mockState.eqCalls.push(`${col}:${String(val)}`);
          return chain;
        };
        chain.maybeSingle = () => ({ data: mockState.row, error: mockState.error });
        chain.single = () => ({ data: mockState.row, error: mockState.error });
        chain.update = (patch: any) => {
          mockState.updateCall = patch;
          return chain;
        };
        chain.then = (res: (x: unknown) => void) => res({ data: mockState.row, error: mockState.error });
        return chain;
      }
      const chain: any = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.is = () => chain;
      chain.limit = () => chain;
      chain.order = () => chain;
      chain.maybeSingle = () => ({ data: null, error: mockState.error });
      return chain;
    }),
  },
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

describe('defaultPublicPageSections — activity-aware ready-made templates', () => {
  it('clinic gets the full set of sections', () => {
    const s = defaultPublicPageSections('clinic');
    expect(s.hero).toBe(true);
    expect(s.about).toBe(true);
    expect(s.services).toBe(true);
    expect(s.providers).toBe(true);
    expect(s.hours).toBe(true);
    expect(s.bookingCta).toBe(true);
    expect(s.aiCta).toBe(true);
    expect(s.qrShare).toBe(true);
  });

  it('imaging_center hides providers and offers', () => {
    const s = defaultPublicPageSections('imaging_center');
    expect(s.providers).toBe(false);
    expect(s.services).toBe(true);
    expect(s.hours).toBe(true);
    expect(s.contact).toBe(true);
    expect(s.hero).toBe(true);
  });

  it('dental_lab hides providers and shows services + hours', () => {
    const s = defaultPublicPageSections('dental_lab');
    expect(s.providers).toBe(false);
    expect(s.services).toBe(true);
    expect(s.about).toBe(true);
  });
});

describe('readPublicProfile — defaults + stored values', () => {
  it('returns defaults when settings are empty', () => {
    const p = readPublicProfile({}, 'clinic');
    expect(p.show_phone).toBe(false);
    expect(p.show_prices).toBe(false);
    expect(p.show_providers).toBe(true);
    expect(p.sections?.hero).toBe(true);
    expect(p.hidden_services).toEqual([]);
    expect(p.hidden_providers).toEqual([]);
  });

  it('preserves stored section overrides on top of defaults', () => {
    const p = readPublicProfile(
      { public_profile: { sections: { services: false } } },
      'clinic'
    );
    expect(p.sections?.services).toBe(false);
    expect(p.sections?.hero).toBe(true);
  });

  it('string values surfaced; non-strings ignored', () => {
    const p = readPublicProfile(
      { public_profile: { description: 'مركز طبي حديث', about: 123 } },
      'clinic'
    );
    expect(p.description).toBe('مركز طبي حديث');
    expect(p.about).toBeUndefined();
  });

  it('returns the persisted cover URL for the owner screen', () => {
    const p = readPublicProfile(
      { public_profile: { cover_url: 'https://storage.example/clinic/cover.webp' } },
      'imaging_center'
    );
    expect(p.cover_url).toBe('https://storage.example/clinic/cover.webp');
  });

  it('preconfigures Amal imaging center with its exact Google review link', () => {
    const config = resolveGoogleReviewSettings({}, 'imaging_center', 'amal-x-ray-center');
    expect(config).toEqual({
      google_review_enabled: true,
      google_review_label: 'قيّمنا على Google',
      google_review_url: 'https://g.page/r/CXCE9MGSfk0qEAE/review',
    });
  });

  it('uses each other imaging center’s saved link and explicit enabled state', () => {
    const config = resolveGoogleReviewSettings({
      public_profile: {
        google_review_url: 'https://g.page/r/other/review',
        google_review_enabled: false,
        google_review_label: 'رأيك يهمنا',
      },
    }, 'imaging_center', 'other-imaging-center');
    expect(config).toEqual({
      google_review_enabled: false,
      google_review_label: 'رأيك يهمنا',
      google_review_url: 'https://g.page/r/other/review',
    });
  });

  it('does not expose Google review settings for dental labs', () => {
    const config = resolveGoogleReviewSettings({
      public_profile: { google_review_url: 'https://g.page/r/lab/review', google_review_enabled: true },
    }, 'dental_lab', 'dental-lab');
    expect(config.google_review_enabled).toBe(false);
    expect(config.google_review_url).toBeUndefined();
  });
});

describe('updatePublicPageConfig — tenant-scoped save', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.error = null;
    mockState.eqCalls = [];
    mockState.updateCall = null;
    mockState.row = null;
  });

  it('writes into clinics.settings.public_profile keyed by clinicId', async () => {
    mockState.row = { id: CID, activity_type: 'clinic', settings: {} };
    const res = await updatePublicPageConfig(CID, { description: 'مركز حديث', show_phone: true });
    expect(res.ok).toBe(true);
    expect(mockState.updateCall.settings.public_profile.description).toBe('مركز حديث');
    expect(mockState.updateCall.settings.public_profile.show_phone).toBe(true);
    expect(mockState.eqCalls).toContain(`id:${CID}`);
  });

  it('persists the uploaded cover URL into clinics.settings.public_profile', async () => {
    mockState.row = { id: CID, activity_type: 'imaging_center', settings: { public_profile: { tagline: 'المركز' } } };
    const coverUrl = 'https://storage.example/clinic/cover.webp';
    const res = await updatePublicPageConfig(CID, { cover_url: coverUrl });
    expect(res.ok).toBe(true);
    expect(mockState.updateCall.settings.public_profile.cover_url).toBe(coverUrl);
    expect(mockState.updateCall.settings.public_profile.tagline).toBe('المركز');
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('saves Google review settings for imaging centers in public_profile JSONB', async () => {
    mockState.row = { id: CID, slug: 'amal-x-ray-center', activity_type: 'imaging_center', settings: {} };
    const result = await updatePublicPageConfig(CID, {
      google_review_url: 'https://g.page/r/CXCE9MGSfk0qEAE/review',
      google_review_enabled: true,
      google_review_label: 'قيّمنا على Google',
    });
    expect(result.ok).toBe(true);
    expect(mockState.updateCall.settings.public_profile).toMatchObject({
      google_review_url: 'https://g.page/r/CXCE9MGSfk0qEAE/review',
      google_review_enabled: true,
      google_review_label: 'قيّمنا على Google',
    });
    expect(revalidatePath).toHaveBeenNthCalledWith(1, '/amal-x-ray-center');
    expect(revalidatePath).toHaveBeenNthCalledWith(2, '/amal-x-ray-center/reviews');
    expect(revalidatePath).toHaveBeenNthCalledWith(3, '/c/amal-x-ray-center');
  });

  it('rejects Google review settings for dental labs', async () => {
    mockState.row = { id: CID, activity_type: 'dental_lab', settings: {} };
    const result = await updatePublicPageConfig(CID, {
      google_review_url: 'https://g.page/r/lab/review',
      google_review_enabled: true,
    });
    expect(result.ok).toBe(false);
    expect(mockState.updateCall).toBeNull();
  });

  it('does not allow enabling the button without a valid Google review URL', async () => {
    mockState.row = { id: CID, activity_type: 'imaging_center', settings: {} };
    const result = await updatePublicPageConfig(CID, { google_review_enabled: true });
    expect(result.ok).toBe(false);
    expect(mockState.updateCall).toBeNull();
  });

  it('persists the uploaded logo URL and invalidates only that clinic public-page routes', async () => {
    mockState.row = {
      id: CID,
      slug: 'demo-clinic',
      activity_type: 'clinic',
      settings: { public_profile: {} },
    };
    const logoUrl = 'https://storage.example/clinic/demo/current-logo.png';

    const result = await updatePublicPageConfig(CID, { logo: logoUrl });

    expect(result.ok).toBe(true);
    expect(mockState.updateCall.settings.public_profile.logo).toBe(logoUrl);
    expect(revalidatePath).toHaveBeenNthCalledWith(1, '/demo-clinic');
    expect(revalidatePath).toHaveBeenNthCalledWith(2, '/demo-clinic/reviews');
    expect(revalidatePath).toHaveBeenNthCalledWith(3, '/c/demo-clinic');
  });

  it('empty string deletes a field instead of storing it', async () => {
    mockState.row = { id: CID, activity_type: 'clinic', settings: { public_profile: { description: 'old' } } };
    await updatePublicPageConfig(CID, { description: '' });
    expect(mockState.updateCall.settings.public_profile.description).toBeUndefined();
  });

  it('merges sections with activity-aware defaults, not dropping unset ones', async () => {
    mockState.row = { id: CID, activity_type: 'imaging_center', settings: { public_profile: { sections: { services: false } } } };
    await updatePublicPageConfig(CID, { sections: { about: false } });
    const sec = mockState.updateCall.settings.public_profile.sections;
    expect(sec.services).toBe(false);
    expect(sec.about).toBe(false);
    expect(sec.hero).toBe(true);
  });

  it('replaces hidden services/providers arrays wholesale', async () => {
    mockState.row = { id: CID, activity_type: 'clinic', settings: { public_profile: { hidden_services: ['a'] } } };
    await updatePublicPageConfig(CID, { hidden_services: ['svc-1', 'svc-2'] });
    expect(mockState.updateCall.settings.public_profile.hidden_services).toEqual(['svc-1', 'svc-2']);
  });

  it('returns failure for missing clinic (tenant guard)', async () => {
    mockState.row = null;
    const res = await updatePublicPageConfig(CID, { description: 'x' });
    expect(res.ok).toBe(false);
    expect(res.message).toBe('Clinic not found');
    expect(mockState.updateCall).toBeNull();
  });
});
