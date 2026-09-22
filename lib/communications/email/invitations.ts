import { getAppBaseUrl } from '../links';
import { logEvent } from '@/lib/server/logging';
import { getEmailProvider, EmailProvider, EmailMessage } from './provider';

/**
 * TEAM INVITATION EMAIL (#38).
 *
 * Reuses the existing provider abstraction (`getEmailProvider()` → Resend in
 * production, console/noop otherwise) — no new SDK and no credential handling
 * here. The invitation TOKEN is embedded in the link because the link is the
 * invitee's credential; it must NEVER be logged (log only clinic + role).
 */

export interface InvitationEmailParams {
  /** Invitee mailbox (the invitation is bound to this address) */
  to: string;
  clinicName: string;
  /** Email of the admin who created the invitation (may be null) */
  invitedBy: string | null;
  role: string;
  token: string;
  /** Human label, e.g. '7 أيام' */
  expiresIn: string;
}

/** Arabic labels for the roles an invitation can carry. */
export const INVITATION_ROLE_AR: Record<string, string> = {
  owner: 'مالك',
  manager: 'مدير',
  doctor: 'طبيب',
  receptionist: 'استقبال',
  accountant: 'محاسب',
  staff: 'موظف',
  viewer: 'مشاهدة فقط',
  admin: 'مدير',
};

/** `/invite/{token}` — the one-click acceptance link. */
export function buildInvitationUrl(baseUrl: string, token: string): string {
  return new URL(`/invite/${encodeURIComponent(token)}`, baseUrl).toString();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Builds the invitation message. Pure apart from `baseUrl` (injectable so tests
 * never depend on the environment).
 */
export function renderInvitationEmail(
  params: InvitationEmailParams,
  baseUrl: string = getAppBaseUrl()
): EmailMessage {
  const { to, clinicName, invitedBy, role, token, expiresIn } = params;
  const link = buildInvitationUrl(baseUrl, token);
  const roleLabel = INVITATION_ROLE_AR[role] ?? role;

  const subject = `دعوة للانضمام إلى ${clinicName}`;

  const text = [
    `تمت دعوتك للانضمام إلى فريق «${clinicName}» بصلاحية: ${roleLabel}.`,
    invitedBy ? `الدعوة من: ${invitedBy}` : null,
    '',
    'للانضمام بضغطة واحدة افتح الرابط التالي:',
    link,
    '',
    `تنتهي صلاحية الدعوة خلال ${expiresIn}.`,
    'إذا لم تكن تتوقع هذه الدعوة، يمكنك تجاهل هذه الرسالة.',
  ]
    .filter(Boolean)
    .join('\n');

  const html = `<!doctype html>
<html dir="rtl" lang="ar">
  <body style="margin:0;padding:24px;background:#0f172a;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:#111c33;border:1px solid #1e293b;border-radius:16px;padding:28px;color:#e2e8f0;">
      <h1 style="margin:0 0 12px;font-size:20px;color:#ffffff;">دعوة للانضمام إلى ${escapeHtml(clinicName)}</h1>
      <p style="margin:0 0 8px;font-size:15px;line-height:1.7;">تمت دعوتك للانضمام إلى فريق العيادة بصلاحية: <strong>${escapeHtml(roleLabel)}</strong>.</p>
      ${invitedBy ? `<p style="margin:0 0 8px;font-size:13px;color:#94a3b8;">الدعوة من: ${escapeHtml(invitedBy)}</p>` : ''}
      <p style="margin:20px 0;">
        <a href="${link}" style="display:inline-block;background:#06b6d4;color:#052e3a;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:999px;">انضم الآن</a>
      </p>
      <p style="margin:0 0 8px;font-size:12px;color:#94a3b8;">أو انسخ الرابط التالي في المتصفح:</p>
      <p style="margin:0 0 16px;font-size:12px;color:#67e8f9;word-break:break-all;">${link}</p>
      <p style="margin:0;font-size:12px;color:#94a3b8;">تنتهي صلاحية الدعوة خلال ${escapeHtml(expiresIn)}. إذا لم تكن تتوقع هذه الدعوة، تجاهل هذه الرسالة.</p>
    </div>
  </body>
</html>`;

  return { to, subject, text, html };
}

/**
 * Sends the invitation email through the configured provider.
 * Throws when the provider fails so the caller can fall back to returning the
 * invitation link for manual sharing (never silently claim "sent").
 */
export async function sendInvitationEmail(
  params: InvitationEmailParams,
  provider?: EmailProvider
): Promise<void> {
  const emailProvider = provider ?? getEmailProvider();
  const message = renderInvitationEmail(params);

  // Safe metadata only — NEVER the token or the recipient address.
  logEvent('team_invitation_email_attempt', { clinic: params.clinicName, role: params.role });

  await emailProvider.send(message);
}
