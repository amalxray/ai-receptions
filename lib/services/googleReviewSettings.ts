import type { ActivityType } from '@/lib/services/activityTypes';

export const DEFAULT_GOOGLE_REVIEW_LABEL = 'قيّمنا على Google';

const INITIAL_IMAGING_CENTER_REVIEW_URLS: Record<string, string> = {
  'amal-x-ray-center': 'https://g.page/r/CXCE9MGSfk0qEAE/review',
};

export function supportsGoogleReviewSettings(activityType: unknown): activityType is 'clinic' | 'imaging_center' {
  return activityType === 'clinic' || activityType === 'imaging_center';
}

export function shouldShowGoogleReviewButton(
  activityType: unknown,
  enabled: boolean,
  url: string | null | undefined,
): boolean {
  return supportsGoogleReviewSettings(activityType) && enabled && Boolean(url);
}

export function resolveGoogleReviewSettings(
  settings: unknown,
  activityType: ActivityType,
  clinicSlug: string,
): { google_review_enabled: boolean; google_review_label: string; google_review_url?: string } {
  const root = settings && typeof settings === 'object' && !Array.isArray(settings)
    ? settings as Record<string, unknown>
    : {};
  const rawProfile = root.public_profile;
  const profile = rawProfile && typeof rawProfile === 'object' && !Array.isArray(rawProfile)
    ? rawProfile as Record<string, unknown>
    : {};
  const storedUrl = typeof profile.google_review_url === 'string' ? profile.google_review_url.trim() : '';
  let googleReviewUrl = isHttpsUrl(storedUrl) ? storedUrl : undefined;

  if (!storedUrl && typeof profile.google_review_enabled !== 'boolean' && activityType === 'imaging_center') {
    googleReviewUrl = INITIAL_IMAGING_CENTER_REVIEW_URLS[clinicSlug];
  }

  const googleReviewEnabled = typeof profile.google_review_enabled === 'boolean'
    ? profile.google_review_enabled
    : Boolean(googleReviewUrl);
  const storedLabel = typeof profile.google_review_label === 'string'
    ? profile.google_review_label.trim().slice(0, 80)
    : '';

  if (!supportsGoogleReviewSettings(activityType)) {
    return {
      google_review_enabled: false,
      google_review_label: storedLabel || DEFAULT_GOOGLE_REVIEW_LABEL,
      google_review_url: undefined,
    };
  }

  return {
    google_review_enabled: googleReviewEnabled,
    google_review_label: storedLabel || DEFAULT_GOOGLE_REVIEW_LABEL,
    google_review_url: googleReviewUrl,
  };
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}
