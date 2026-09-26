/**
 * PWA — per-clinic install identity (dynamic web app manifest).
 *
 * WHAT WAS WRONG
 * `public/manifest.json` was ONE static file: every clinic that installed the app
 * on its own subdomain got the platform name ("AI-Receptions") and the platform
 * icons, so a patient's home screen never carried the clinic's identity.
 *
 * HOW IT WORKS NOW
 * `app/manifest.json/route.ts` answers per REQUEST HOST (host math owned by
 * `lib/vercel/domains`), so:
 *
 *   amal-x-ray-center.dentairec.com/manifest.json → "Amal X-Ray Center"
 *                                                   + its colors + its logo
 *   www.dentairec.com/manifest.json               → platform manifest (unchanged)
 *   www.dentairec.com/manifest.json?slug={slug}   → branded (legacy /c/{slug})
 *
 * The brand is read from the SAME row the public space renders
 * (`clinics.name` / `clinics.logo` / `settings.public_profile.theme`), so the
 * installed app can never disagree with the page it was installed from.
 *
 * IDENTITY SCOPE
 * Every tenant subdomain is its own ORIGIN, hence its own installable app; on a
 * tenant host `start_url`/`scope` stay `/` (the middleware rewrites the tenant
 * root to the tenant space) and `id` stays `/` so an app installed before this
 * change is UPDATED — never duplicated. The apex compatibility page cannot
 * install the tenant origin, so it brands with `?slug=` under its own id
 * (`/c/{slug}`).
 *
 * GRACEFUL DEGRADATION (hard requirement)
 * No logo / unreadable settings / unknown host / DB error must never ship a
 * broken manifest: the platform defaults are returned instead, and the platform
 * icons stay in the icon list so installability can never depend on an
 * owner-uploaded image.
 */
import type { Viewport } from 'next';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logEvent } from '@/lib/server/logging';
import {
  ACTIVITY_TYPE_LABELS_AR,
  normalizeActivityType,
  type ActivityType,
} from '@/lib/services/activityTypes';
import {
  DEFAULT_THEME,
  isHexColor,
  readTheme,
  type PublicThemeSettings,
} from '@/lib/services/clinicPublicConfig';
import {
  isReservedSubdomain,
  isValidTenantSlug,
  normalizeTenantSlug,
  tenantSlugFromHostname,
} from '@/lib/vercel/domains';

/** Platform app identity — apex, dashboard, `/ask` and every non-tenant host. */
export const PLATFORM_APP_NAME = 'AI-Receptions';
export const PLATFORM_APP_DESCRIPTION = 'ابحث عن أفضل طبيب أسنان قريب منك';
export const PLATFORM_ICON_192 = '/icons/icon-192.png';
export const PLATFORM_ICON_512 = '/icons/icon-512.png';
export const PLATFORM_APPLE_TOUCH_ICON = '/icons/apple-touch-icon.png';
/** Brand emerald — platform status bar / Android theme color. */
export const PLATFORM_THEME_COLOR = '#10B981';
/** Platform splash background (the pre-refactor manifest value). */
export const PLATFORM_BACKGROUND_COLOR = '#0F172A';

/**
 * Platform viewport. SINGLE SOURCE for `app/layout.tsx` AND the tenant page
 * (which only swaps `themeColor` for the clinic's primary color), so the #40
 * mobile contract — explicit device-width, pinch-zoom kept, safe-area aware for
 * notched phones — can never drift between the two.
 */
export const PLATFORM_VIEWPORT: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: PLATFORM_THEME_COLOR,
};

export type PwaManifestIcon = {
  src: string;
  /** `any` = the platform does not control the file's pixel size (owner logo). */
  sizes: string;
  type?: string;
  purpose?: string;
};

export type PwaManifestShortcut = {
  name: string;
  url: string;
  icons?: PwaManifestIcon[];
};

export type PwaManifest = {
  id: string;
  name: string;
  short_name: string;
  description: string;
  start_url: string;
  scope: string;
  display: string;
  orientation: string;
  background_color: string;
  theme_color: string;
  lang: string;
  dir: string;
  icons: PwaManifestIcon[];
  shortcuts: PwaManifestShortcut[];
};

/** Collapse whitespace; empty/whitespace-only becomes null (never trust input). */
function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length > 0 ? clean : null;
}

/**
 * `short_name` — what fits under a home-screen icon (Apple truncates around 12
 * characters, Android shows the first word or two). The clinic's first TWO words
 * keep it recognisable: "مركز أمل للتصوير" → "مركز أمل".
 */
export function shortNameFrom(name: string, maxLength = 12): string {
  const clean = cleanText(name);
  if (!clean) return PLATFORM_APP_NAME;
  const twoWords = clean.split(' ').slice(0, 2).join(' ');
  if (twoWords.length <= maxLength) return twoWords;
  if (clean.length <= maxLength) return clean;
  // Long single word / long two words → hard cut with an ellipsis.
  const budget = Math.max(1, maxLength - 1);
  return `${clean.slice(0, budget).trimEnd()}…`;
}

/**
 * Owner-supplied image URLs are used VERBATIM as icon `src` (no proxying: the
 * platform must not fetch arbitrary tenant URLs — that would be an SSRF bridge
 * and a privacy leak to third-party hosts).
 *
 * Accepted: an absolute `https://` URL or a same-origin root-relative path.
 * Rejected: `http://` (mixed content on our HTTPS pages → a dead icon),
 * `data:`/`blob:` (manifest icon fetching ignores them) and anything with
 * whitespace/quotes (manifest JSON injection).
 */
export function isUsableBrandImage(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const url = value.trim();
  if (url.length === 0 || url.length > 2048) return false;
  if (/^\/(?!\/)/.test(url)) return true; // same-origin path, e.g. /brand/logo.png
  return /^https:\/\/[^\s"'<>\\]+$/i.test(url);
}

/** Owner-managed public description (public_profile.description), trimmed. */
export function readBrandDescription(settings: unknown): string | null {
  const profile = (settings as { public_profile?: { description?: unknown } } | null)
    ?.public_profile;
  const description = cleanText(profile?.description);
  if (!description) return null;
  return description.length > 200 ? `${description.slice(0, 199).trimEnd()}…` : description;
}

/**
 * Icon list. The clinic logo is declared FIRST so a branded install shows the
 * clinic, and the platform 192/512 pair is ALWAYS present: a logo that cannot be
 * fetched (dead host, `http://`, non-PNG on iOS) must never make the app
 * non-installable.
 *
 * The logo is `sizes: "any"` / `purpose: "any"` on purpose — the platform does
 * not control the file's pixel size, and claiming `maskable` would let Android
 * crop a non-square wordmark. The platform icons keep their historical
 * `any maskable` declaration, so platform install behavior is unchanged.
 */
export function manifestIcons(logo?: string | null): PwaManifestIcon[] {
  const icons: PwaManifestIcon[] = [];
  if (isUsableBrandImage(logo)) {
    icons.push({ src: String(logo).trim(), sizes: 'any', purpose: 'any' });
  }
  icons.push(
    { src: PLATFORM_ICON_192, sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
    { src: PLATFORM_ICON_512, sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
  );
  return icons;
}

/** Only a same-origin root-relative path may be advertised by the manifest. */
function sameOriginPath(value: unknown, fallback: string): string {
  const path = cleanText(value);
  return path && /^\/(?!\/)/.test(path) ? path : fallback;
}

export type ClinicManifestInput = {
  slug: string;
  name: string;
  logo?: string | null;
  description?: string | null;
  theme: PublicThemeSettings;
  activityType?: ActivityType;
  /**
   * Where "open the app" lands: `/` on a tenant host (the middleware rewrites the
   * tenant root to the tenant space), `/c/{slug}` on the apex compatibility page.
   */
  startUrl: string;
  /** App identity within the install origin. Defaults to `/`. */
  appId?: string;
};

/**
 * Clinic-owned manifest. Colors come from the SAME bounded theme the public page
 * renders (hex-validated on write, re-checked here — JSON is the only sink, never
 * raw CSS), so `theme_color` matches what the visitor just saw on the page.
 */
export function buildPwaManifest(input: ClinicManifestInput): PwaManifest {
  const name = cleanText(input.name) ?? PLATFORM_APP_NAME;
  const theme = input.theme ?? DEFAULT_THEME;
  const activityType = normalizeActivityType(input.activityType);
  return {
    id: sameOriginPath(input.appId, '/'),
    name,
    short_name: shortNameFrom(name),
    description:
      cleanText(input.description) ??
      `${name} — ${ACTIVITY_TYPE_LABELS_AR[activityType] ?? ACTIVITY_TYPE_LABELS_AR.clinic}`,
    start_url: sameOriginPath(input.startUrl, '/'),
    // The tenant root IS the app: the space, booking and chat all live under it.
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: isHexColor(theme.background_color)
      ? theme.background_color
      : PLATFORM_BACKGROUND_COLOR,
    theme_color: isHexColor(theme.primary_color) ? theme.primary_color : PLATFORM_THEME_COLOR,
    lang: 'ar',
    dir: 'rtl',
    icons: manifestIcons(input.logo),
    // One-tap booking — the same CTA target the public space renders
    // (`/book?slug=…`, inside `scope: "/"` so it opens in the installed window).
    shortcuts: [
      {
        name: 'احجز موعدًا',
        url: `/book?slug=${encodeURIComponent(cleanText(input.slug) ?? '')}`,
      },
    ],
  };
}

/** Platform manifest — the identity the deleted static file used to serve. */
export function platformPwaManifest(): PwaManifest {
  return {
    id: '/',
    name: PLATFORM_APP_NAME,
    short_name: PLATFORM_APP_NAME,
    description: PLATFORM_APP_DESCRIPTION,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: PLATFORM_BACKGROUND_COLOR,
    theme_color: PLATFORM_THEME_COLOR,
    lang: 'ar',
    dir: 'rtl',
    icons: manifestIcons(null),
    shortcuts: [
      {
        name: 'ابحث عن طبيب',
        url: '/ask',
        icons: [{ src: PLATFORM_ICON_192, sizes: '192x192', type: 'image/png' }],
      },
      { name: 'مقالات', url: '/ask/articles' },
      { name: 'قصص النجاح', url: '/ask/stories' },
    ],
  };
}

/**
 * Request host — `x-forwarded-host` first (behind Vercel), `host` as the
 * local/self-hosted fallback. Mirrors the middleware's rule (`middleware.ts`), and
 * takes the FIRST entry of a forwarded list (multi-proxy chains append): if the two
 * ever disagreed the manifest would simply fall back to the platform identity, so
 * this can only ever be less branded — never a security or routing divergence.
 */
export function hostFromRequestHeaders(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-host');
  const raw = forwarded && forwarded.trim() ? forwarded : headers.get('host') ?? '';
  return (raw.split(',')[0] ?? '').trim();
}

/** The only `clinics` columns the manifest layer reads. */
export type PwaBrandRow = {
  slug: string;
  name: string | null;
  logo: string | null;
  settings: unknown;
  activity_type: string | null;
};

/** Injected so the mapping below is testable without a database. */
export type PwaBrandLookup = (slug: string) => Promise<PwaBrandRow | null>;

export type PwaBrand = {
  slug: string;
  name: string;
  logo: string | null;
  description: string | null;
  theme: PublicThemeSettings;
  activityType: ActivityType;
};

/** Production lookup — soft-deleted tenants are not installable, exactly like /{slug}. */
async function lookupClinicBrand(slug: string): Promise<PwaBrandRow | null> {
  const { data, error } = await supabaseAdmin
    .from('clinics')
    .select('slug, name, logo, settings, activity_type')
    .eq('slug', slug)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    // A DB hiccup must degrade to the platform manifest, not to a 500 (the
    // browser treats a failed manifest as "not installable"). Logged so a real
    // outage stays visible.
    logEvent('pwa_manifest_lookup_error', { error: error.message }, 'error');
    return null;
  }
  return (data as PwaBrandRow | null) ?? null;
}

/**
 * Host (or `?slug=`) → the clinic's install identity, or null for the platform
 * default. The HOST always wins: it is the origin that would install the app, so
 * `hala-clinic.dentairec.com/manifest.json?slug=amal-x-ray-center` stays hala.
 * The query parameter exists only for the apex `/c/{slug}` compatibility page,
 * which renders a tenant on the platform origin.
 */
export async function resolvePwaBrand(
  params: { host: string; slug?: string | null },
  lookup: PwaBrandLookup = lookupClinicBrand
): Promise<PwaBrand | null> {
  const hostSlug = tenantSlugFromHostname(params.host ?? '');
  const querySlug = normalizeTenantSlug(params.slug ?? '');
  const slug =
    hostSlug ??
    (isValidTenantSlug(querySlug) && !isReservedSubdomain(querySlug) ? querySlug : null);
  if (!slug) return null;

  const row = await lookup(slug);
  if (!row || !row.slug) return null;

  return {
    slug: row.slug,
    name: cleanText(row.name) ?? PLATFORM_APP_NAME,
    logo: isUsableBrandImage(row.logo) ? row.logo.trim() : null,
    description: readBrandDescription(row.settings),
    theme: readTheme(row.settings),
    activityType: normalizeActivityType(row.activity_type),
  };
}

/** A PNG-looking URL (query-string/hash tolerant) — iOS REQUIRES PNG. */
export function isPngIconUrl(url: string): boolean {
  const path = url.split('?')[0].split('#')[0];
  return /\.png$/i.test(path);
}

/**
 * `Metadata.icons` shape for a tenant page. Declared structurally (instead of
 * `Metadata['icons']`) so callers get `icon`/`apple` without union narrowing — and
 * it stays assignable to Next's `Icons` type where the page uses it.
 */
export type BrandMetadataIcons = {
  icon: { url: string; sizes?: string; type?: string }[];
  apple: { url: string; sizes?: string; type?: string }[];
};

/**
 * `brandMetadataIcons` returns the tenant page's icon set.
 *
 * WHY THIS EXISTS: iOS Safari never reads a manifest's `icons`/`short_name` for
 * "Add to Home Screen" — it uses `apple-touch-icon` and `apple-mobile-web-app-title`.
 * Branding the manifest alone would therefore leave iPhone users with a generic
 * icon and the wrong label.
 *
 * Paths stay ROOT-RELATIVE on purpose: Next emits icon hrefs verbatim (no
 * `metadataBase` resolution), so on a tenant host they resolve against the tenant
 * origin, never the apex. An absolute owner logo stays absolute.
 *
 * A non-PNG logo keeps the platform Apple icon: Safari silently falls back to a
 * screenshot of the page when the apple-touch-icon is not a PNG, which would look
 * worse than our own icon.
 */
export function brandMetadataIcons(logo?: string | null): BrandMetadataIcons {
  const brand = isUsableBrandImage(logo) ? String(logo).trim() : null;
  const applePng = brand && isPngIconUrl(brand) ? brand : null;
  return {
    // Brand first: the browser then also uses it as the tab favicon.
    icon: [
      ...(brand ? [{ url: brand, sizes: 'any' }] : []),
      { url: PLATFORM_ICON_192, sizes: '192x192', type: 'image/png' },
      { url: PLATFORM_ICON_512, sizes: '512x512', type: 'image/png' },
    ],
    apple: applePng
      ? [{ url: applePng }]
      : [{ url: PLATFORM_APPLE_TOUCH_ICON, sizes: '180x180', type: 'image/png' }],
  };
}
