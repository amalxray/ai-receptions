import { describe, expect, it, vi } from 'vitest';
import {
  PLATFORM_APPLE_TOUCH_ICON,
  PLATFORM_ICON_192,
  PLATFORM_ICON_512,
  PLATFORM_VIEWPORT,
  brandMetadataIcons,
  buildPwaManifest,
  hostFromRequestHeaders,
  isPngIconUrl,
  isUsableBrandImage,
  manifestIcons,
  platformPwaManifest,
  readBrandDescription,
  resolvePwaBrand,
  shortNameFrom,
  type PwaBrandRow,
} from '@/lib/services/pwaManifest';
import { DEFAULT_THEME } from '@/lib/services/clinicPublicConfig';

/**
 * PWA per-clinic identity (dynamic manifest).
 *
 * The DB read is injected (`PwaBrandLookup`), so the whole host→brand→manifest
 * mapping is verified here: name/short_name derivation, icon safety, color
 * fallbacks, host-vs-`?slug=` precedence and every graceful-degradation path.
 */

const APEX = 'www.dentairec.com';
const TENANT = 'amal-x-ray-center.dentairec.com';

function brandRow(over: Partial<PwaBrandRow> = {}): PwaBrandRow {
  return {
    slug: 'amal-x-ray-center',
    name: 'Amal X-Ray Center',
    logo: null,
    settings: {},
    activity_type: 'imaging_center',
    ...over,
  };
}

describe('shortNameFrom', () => {
  it('keeps the first two words — the recognisable part of a clinic name', () => {
    expect(shortNameFrom('مركز أمل للتصوير')).toBe('مركز أمل');
    expect(shortNameFrom('Amal X-Ray Center')).toBe('Amal X-Ray');
    expect(shortNameFrom('عيادة')).toBe('عيادة');
  });

  it('collapses whitespace and ignores a trailing space', () => {
    expect(shortNameFrom('  المتميزون  ')).toBe('المتميزون');
    expect(shortNameFrom('hala   clinic\ncenter')).toBe('hala clinic');
  });

  it('hard-cuts a name that has no short form, never exceeding the budget', () => {
    const cut = shortNameFrom('a'.repeat(40));
    expect(cut.length).toBe(12);
    expect(cut.endsWith('…')).toBe(true);
    expect(shortNameFrom('x'.repeat(30), 5)).toBe('xxxx…');
  });

  it('falls back to the platform name for empty input', () => {
    expect(shortNameFrom('')).toBe('AI-Receptions');
    expect(shortNameFrom('   ')).toBe('AI-Receptions');
  });
});

describe('isUsableBrandImage', () => {
  it('accepts https URLs and same-origin paths', () => {
    expect(isUsableBrandImage('https://cdn.example.com/logo.png')).toBe(true);
    expect(isUsableBrandImage('/brand/logo.png')).toBe(true);
  });

  it('rejects anything that would be a dead or dangerous icon source', () => {
    // http:// is blocked as mixed content on our HTTPS pages.
    expect(isUsableBrandImage('http://cdn.example.com/logo.png')).toBe(false);
    expect(isUsableBrandImage('//cdn.example.com/logo.png')).toBe(false);
    expect(isUsableBrandImage('javascript:alert(1)')).toBe(false);
    expect(isUsableBrandImage('data:image/png;base64,AAAA')).toBe(false);
    expect(isUsableBrandImage('https://x.com/logo.png" onload="x')).toBe(false);
    expect(isUsableBrandImage(`https://x.com/${'a'.repeat(2048)}.png`)).toBe(false);
    expect(isUsableBrandImage(null)).toBe(false);
    expect(isUsableBrandImage(42)).toBe(false);
  });
});

describe('readBrandDescription', () => {
  it('reads the owner-managed public description', () => {
    expect(readBrandDescription({ public_profile: { description: '  تصوير رقمي  ' } })).toBe('تصوير رقمي');
  });

  it('returns null when absent and truncates a runaway description', () => {
    expect(readBrandDescription({})).toBeNull();
    expect(readBrandDescription(null)).toBeNull();
    const long = readBrandDescription({ public_profile: { description: 'ب'.repeat(500) } });
    expect(long?.length).toBe(200);
    expect(long?.endsWith('…')).toBe(true);
  });
});

describe('manifestIcons', () => {
  it('always declares the platform 192/512 pair so installability never depends on a logo', () => {
    const icons = manifestIcons(null);
    expect(icons.map((i) => i.src)).toEqual([PLATFORM_ICON_192, PLATFORM_ICON_512]);
    expect(icons.every((i) => i.purpose === 'any maskable')).toBe(true);
  });

  it('declares the clinic logo first, honestly sized, without cropping it', () => {
    const icons = manifestIcons('https://cdn.example.com/logo.png');
    expect(icons[0]).toEqual({ src: 'https://cdn.example.com/logo.png', sizes: 'any', purpose: 'any' });
    expect(icons).toHaveLength(3);
  });

  it('ignores an unusable logo instead of breaking the manifest', () => {
    expect(manifestIcons('http://cdn.example.com/logo.png')).toHaveLength(2);
  });
});

describe('buildPwaManifest', () => {
  const input = {
    slug: 'amal-x-ray-center',
    name: 'مركز أمل للتصوير',
    logo: 'https://cdn.example.com/logo.png',
    theme: { ...DEFAULT_THEME, primary_color: '#9cafde', background_color: '#93ccd7' },
    activityType: 'imaging_center' as const,
    startUrl: '/',
  };

  it('carries the clinic identity, colors and icons', () => {
    const manifest = buildPwaManifest(input);
    expect(manifest.name).toBe('مركز أمل للتصوير');
    expect(manifest.short_name).toBe('مركز أمل');
    expect(manifest.theme_color).toBe('#9cafde');
    expect(manifest.background_color).toBe('#93ccd7');
    expect(manifest.icons[0].src).toBe('https://cdn.example.com/logo.png');
    expect(manifest.id).toBe('/');
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.lang).toBe('ar');
    expect(manifest.dir).toBe('rtl');
  });

  it('keeps a tap-to-book shortcut inside scope', () => {
    const manifest = buildPwaManifest(input);
    expect(manifest.shortcuts).toEqual([
      { name: 'احجز موعدًا', url: '/book?slug=amal-x-ray-center' },
    ]);
  });

  it('encodes the slug into the booking shortcut (no path/query injection)', () => {
    const manifest = buildPwaManifest({ ...input, slug: 'a b/c' });
    expect(manifest.shortcuts[0].url).toBe('/book?slug=a%20b%2Fc');
  });

  it('describes the clinic by activity when the owner wrote no description', () => {
    expect(buildPwaManifest(input).description).toContain('مركز أشعة');
    expect(buildPwaManifest({ ...input, description: 'وصف المالك' }).description).toBe('وصف المالك');
  });

  it('never advertises an off-origin id/start_url', () => {
    const manifest = buildPwaManifest({
      ...input,
      startUrl: 'https://evil.example.com',
      appId: 'https://evil.example.com',
    });
    expect(manifest.start_url).toBe('/');
    expect(manifest.id).toBe('/');
  });

  it('falls back to platform colors/name for garbage input', () => {
    const manifest = buildPwaManifest({
      ...input,
      name: '   ',
      theme: { ...DEFAULT_THEME, primary_color: 'red', background_color: '' },
    });
    expect(manifest.name).toBe('AI-Receptions');
    // Invalid hex is rejected, not passed through to theme_color.
    expect(manifest.theme_color).toBe('#10B981');
    expect(manifest.background_color).toBe('#0F172A');
  });

  it('is JSON-serializable (the route sends it as manifest+json)', () => {
    const json = JSON.parse(JSON.stringify(buildPwaManifest(input)));
    expect(json.name).toBe('مركز أمل للتصوير');
    expect(json.icons).toHaveLength(3);
  });
});

describe('platformPwaManifest', () => {
  it('keeps the exact platform identity the static file used to serve', () => {
    const manifest = platformPwaManifest();
    expect(manifest.name).toBe('AI-Receptions');
    expect(manifest.short_name).toBe('AI-Receptions');
    expect(manifest.theme_color).toBe('#10B981');
    expect(manifest.background_color).toBe('#0F172A');
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.icons.map((i) => i.src)).toEqual([PLATFORM_ICON_192, PLATFORM_ICON_512]);
    expect(manifest.shortcuts.map((s) => s.url)).toEqual(['/ask', '/ask/articles', '/ask/stories']);
  });

  it('shares the #40 mobile viewport with the root layout', () => {
    expect(PLATFORM_VIEWPORT).toEqual({
      width: 'device-width',
      initialScale: 1,
      maximumScale: 5,
      viewportFit: 'cover',
      themeColor: '#10B981',
    });
  });
});

describe('hostFromRequestHeaders', () => {
  it('prefers x-forwarded-host (the public host behind Vercel)', () => {
    expect(hostFromRequestHeaders(new Headers({ host: 'internal:3000', 'x-forwarded-host': TENANT }))).toBe(TENANT);
  });

  it('falls back to host and takes the first entry of a forwarded list', () => {
    expect(hostFromRequestHeaders(new Headers({ host: 'localhost:3000' }))).toBe('localhost:3000');
    expect(hostFromRequestHeaders(new Headers({ 'x-forwarded-host': `${TENANT}, proxy.internal` }))).toBe(TENANT);
    expect(hostFromRequestHeaders(new Headers({ 'x-forwarded-host': '   ' }))).toBe('');
  });
});

describe('isPngIconUrl / brandMetadataIcons', () => {
  it('detects PNG with query strings (Supabase storage URLs)', () => {
    expect(isPngIconUrl('https://x.supabase.co/storage/v1/object/public/a/logo.png')).toBe(true);
    expect(isPngIconUrl('https://x/logo.png?width=180')).toBe(true);
    expect(isPngIconUrl('https://x/logo.jpg')).toBe(false);
    expect(isPngIconUrl('https://x/logo')).toBe(false);
  });

  it('uses the clinic logo for iOS only when it is a PNG', () => {
    const png = brandMetadataIcons('https://cdn.example.com/logo.png');
    expect(png.apple).toEqual([{ url: 'https://cdn.example.com/logo.png' }]);
    expect(png.icon[0]).toEqual({ url: 'https://cdn.example.com/logo.png', sizes: 'any' });

    // A JPEG would make Safari silently fall back to a page screenshot.
    const jpeg = brandMetadataIcons('https://cdn.example.com/logo.jpg');
    expect(jpeg.apple).toEqual([
      { url: PLATFORM_APPLE_TOUCH_ICON, sizes: '180x180', type: 'image/png' },
    ]);
    expect(jpeg.icon[0]).toEqual({ url: 'https://cdn.example.com/logo.jpg', sizes: 'any' });
  });

  it('keeps root-relative platform icons when the clinic has no logo', () => {
    const icons = brandMetadataIcons(null);
    expect(icons.icon.map((i) => i.url)).toEqual([PLATFORM_ICON_192, PLATFORM_ICON_512]);
    expect(icons.apple).toEqual([
      { url: PLATFORM_APPLE_TOUCH_ICON, sizes: '180x180', type: 'image/png' },
    ]);
  });
});

describe('resolvePwaBrand (host → clinic identity)', () => {
  it('resolves the clinic of a tenant host — the fix for the static manifest', async () => {
    const lookup = vi.fn(async () =>
      brandRow({
        logo: 'https://cdn.example.com/amal.png',
        settings: {
          public_profile: {
            description: 'تصوير رقمي متقدم',
            theme: { primary_color: '#9cafde', background_color: '#93ccd7' },
          },
        },
      })
    );

    const brand = await resolvePwaBrand({ host: TENANT }, lookup);
    expect(lookup).toHaveBeenCalledWith('amal-x-ray-center');
    expect(brand).toMatchObject({
      slug: 'amal-x-ray-center',
      name: 'Amal X-Ray Center',
      logo: 'https://cdn.example.com/amal.png',
      description: 'تصوير رقمي متقدم',
      activityType: 'imaging_center',
    });
    expect(brand?.theme.primary_color).toBe('#9cafde');
    expect(brand?.theme.background_color).toBe('#93ccd7');
  });

  it('brands the apex compatibility page from ?slug=', async () => {
    const lookup = vi.fn(async () => brandRow({ slug: 'hala-clinic', name: 'hala-clinic' }));
    const brand = await resolvePwaBrand({ host: APEX, slug: 'HALA-CLINIC' }, lookup);
    expect(lookup).toHaveBeenCalledWith('hala-clinic');
    expect(brand?.slug).toBe('hala-clinic');
  });

  it('lets the request host win over a mismatching ?slug= (identity is not spoofable)', async () => {
    const lookup = vi.fn(async () => brandRow());
    await resolvePwaBrand({ host: TENANT, slug: 'hala-clinic' }, lookup);
    expect(lookup).toHaveBeenCalledWith('amal-x-ray-center');
  });

  it('never looks a clinic up for the platform, a reserved slug or a bad slug', async () => {
    const lookup = vi.fn(async () => brandRow());
    // No tenant host and no slug → platform manifest.
    expect(await resolvePwaBrand({ host: APEX }, lookup)).toBeNull();
    // Reserved label → the platform namespace must not be brandable.
    expect(await resolvePwaBrand({ host: APEX, slug: 'dashboard' }, lookup)).toBeNull();
    // Not a DNS-safe label.
    expect(await resolvePwaBrand({ host: APEX, slug: 'a b/c' }, lookup)).toBeNull();
    expect(await resolvePwaBrand({ host: 'api.dentairec.com', slug: '' }, lookup)).toBeNull();
    expect(lookup).not.toHaveBeenCalled();
  });

  it('degrades safely: unknown clinic, DB miss and unusable values', async () => {
    expect(await resolvePwaBrand({ host: TENANT }, async () => null)).toBeNull();

    const brand = await resolvePwaBrand({ host: TENANT }, async () =>
      brandRow({ name: '   ', logo: 'http://insecure.example.com/logo.png', activity_type: 'weird' })
    );
    expect(brand?.name).toBe('AI-Receptions');
    expect(brand?.logo).toBeNull();
    expect(brand?.description).toBeNull();
    expect(brand?.activityType).toBe('clinic'); // normalizeActivityType fallback
    expect(brand?.theme).toEqual(DEFAULT_THEME); // no stored theme → page defaults
  });
});

