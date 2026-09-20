/**
 * Builds a secure patient-facing URL for the booking confirmation/cancellation flow.
 *
 * Reuses the EXISTING booking token system — no new token is created.
 * The raw token is embedded in the URL because it is intended for the patient,
 * but it must NEVER be logged.
 */

export type BookingAction = 'confirm' | 'cancel';

export interface BookingLinkParams {
  /** Base URL of the application, e.g. https://app.example.com (no trailing slash) */
  baseUrl: string;
  clinicId: string;
  appointmentId: string;
  token: string;
  action: BookingAction;
}

/**
 * Builds a patient-facing URL that deep-links into the booking flow
 * with the secure token so the patient can confirm/cancel their own booking.
 */
export function buildBookingActionUrl(params: BookingLinkParams): string {
  const { baseUrl, clinicId, appointmentId, token, action } = params;
  const url = new URL('/book', baseUrl);
  url.searchParams.set('clinic_id', clinicId);
  url.searchParams.set('appointment_id', appointmentId);
  url.searchParams.set('token', token);
  url.searchParams.set('action', action);
  return url.toString();
}

/**
 * Canonical public origin of the platform in production.
 *
 * AEO/SEO single source of truth: canonical tags, sitemap.xml, robots.txt,
 * RSS and JSON-LD must all advertise the OFFICIAL public domain — never the
 * legacy `*.vercel.app` host (would split canonical signals) and never
 * `localhost` (would be indexed as the site's identity).
 */
export const PRODUCTION_BASE_URL = 'https://www.dentairec.com';

/**
 * Resolves the application base URL from the environment.
 *
 * Precedence:
 *   1. Vercel PRODUCTION deployment → PRODUCTION_BASE_URL (authoritative).
 *      Canonical identity must not be re-pointable by a leftover/preview env
 *      value: a stale NEXT_PUBLIC_APP_URL=*.vercel.app silently split
 *      canonical/OG/sitemap signals away from the official domain.
 *   2. NEXT_PUBLIC_APP_URL → APP_URL (local runs, staging, tests, previews).
 *   3. http://localhost:3000 (local development).
 */
export function getAppBaseUrl(env: Record<string, string | undefined> = process.env): string {
  if (env.VERCEL_ENV === 'production') return PRODUCTION_BASE_URL;
  const explicit = env.NEXT_PUBLIC_APP_URL || env.APP_URL;
  if (explicit) return explicit.replace(/\/+$/, '');
  return 'http://localhost:3000';
}
