import QRCode from 'qrcode';
import { getAppBaseUrl } from '@/lib/communications/links';

/**
 * STEP 15D — Server-side QR generation for the clinic public page.
 *
 * QR codes encode `/q/{public_id}` on the PLATFORM origin (opaque stable
 * identifier) so printed codes survive both a slug rename AND the canonical
 * migration to tenant subdomains: the destination embeds neither the slug nor
 * the tenant host, and `/q/{public_id}` 302-redirects to whatever canonical
 * space the tenant currently owns. Encoding the subdomain instead would kill
 * every printed code the day a tenant host is removed.
 *
 * Generated on-demand as SVG — nothing is stored.
 */
export async function clinicQrSvg(clinic: { publicId: string }): Promise<string> {
  return QRCode.toString(clinicQrDestination(clinic), {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 2,
  });
}

/** Returns the exact destination URL a QR code for this clinic encodes. */
export function clinicQrDestination(clinic: { publicId: string }): string {
  return `${getAppBaseUrl()}/q/${encodeURIComponent(clinic.publicId)}`;
}

