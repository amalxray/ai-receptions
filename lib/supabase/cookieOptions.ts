import type { CookieOptions } from '@supabase/ssr';

const configuredDomain = process.env.NEXT_PUBLIC_COOKIE_DOMAIN?.trim();
const isProductionDentairecHost = process.env.VERCEL_ENV === 'production' || (
  typeof window !== 'undefined' &&
  (window.location.hostname === 'dentairec.com' ||
    window.location.hostname.endsWith('.dentairec.com'))
);
const sharedDomain = isProductionDentairecHost
  ? configuredDomain || '.dentairec.com'
  : undefined;

/** Shared auth-cookie policy for the platform and its tenant subdomains. */
export const supabaseCookieOptions: CookieOptions = {
  ...(sharedDomain ? { domain: sharedDomain } : {}),
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};
