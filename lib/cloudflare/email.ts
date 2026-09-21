/**
 * Cloudflare Email Routing — clinic mailbox provisioning.
 *
 * Creates `{local}@{TENANT_ROOT_DOMAIN}` forwarding rules toward a verified
 * destination address. Behaviors verified live against the Cloudflare API:
 *   - duplicate literal rule        → HTTP 409, errors[0].code = 2014
 *   - destination not yet verified  → HTTP 400, errors[0].code = 2054
 *   - the API does NOT validate the local-part format on our behalf
 *
 * Result is a single flat shape (optional fields) mirroring SubdomainResult —
 * callers treat provisioning as best-effort and only read what they need.
 */
import { TENANT_ROOT_DOMAIN } from '@/lib/vercel/domains';

export type ClinicEmailRuleResult = {
  success: boolean;
  /** The full mailbox, e.g. `hala@dentairec.com` (set even on some failures). */
  address?: string;
  ruleId?: string;
  /** Rule already existed — reported as success (desired end state holds). */
  alreadyExisted?: boolean;
  /** Destination address exists but is not verified yet (CF code 2054). */
  needsVerification?: boolean;
  error?: string;
  code?: string;
};

/** Platform-owned mailboxes a clinic may never claim (they forward to the owner). */
const PLATFORM_MAILBOX_LOCALS = new Set(['info', 'support', 'admin', 'noreply', 'billing']);

/** DNS-label-safe local part: 1-30 chars, letters/digits/hyphen, no edge hyphen. */
const LOCAL_PART_RE = /^[a-z0-9]([a-z0-9-]{0,28}[a-z0-9])?$/;

interface CfErrorBody {
  result?: { id?: string };
  errors?: Array<{ code?: number; message?: string }>;
}

interface CfRule {
  id?: string;
  matchers?: Array<{ type?: string; field?: string; value?: string }>;
}

function cfCredentials(): { token: string; zoneId: string } | null {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;
  if (!token || !zoneId) return null;
  return { token, zoneId };
}

/** Finds the existing rule id for an address (used to enrich the 409 path). */
async function findRuleIdByAddress(
  creds: { token: string; zoneId: string },
  address: string
): Promise<string | undefined> {
  try {
    const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${creds.zoneId}/email/routing/rules`, {
      headers: { Authorization: `Bearer ${creds.token}` },
    });
    if (!res.ok) return undefined;
    const body = (await res.json()) as CfErrorBody & { result?: CfRule[] };
    const match = body.result?.find((rule) =>
      rule.matchers?.some((m) => m.type === 'literal' && m.field === 'to' && m.value === address)
    );
    return match?.id;
  } catch {
    return undefined;
  }
}

/**
 * Creates a forwarding rule `{localPart}@{root} → destination`.
 * Idempotent: a duplicate rule (CF 2014) is reported as success with
 * `alreadyExisted: true`. An unverified destination (CF 2054) is reported as
 * `needsVerification` — the verification email is what Cloudflare sends, and
 * the caller should surface that to the user instead of treating it as an
 * infrastructure failure. Safe to re-run at any time.
 */
export async function createClinicEmailRule(
  localPart: string,
  destination?: string
): Promise<ClinicEmailRuleResult> {
  const local = localPart.trim().toLowerCase();
  const address = `${local}@${TENANT_ROOT_DOMAIN}`;

  if (!LOCAL_PART_RE.test(local)) {
    return { success: false, address, error: 'INVALID_LOCAL_PART', code: 'invalid_local' };
  }
  if (PLATFORM_MAILBOX_LOCALS.has(local)) {
    return { success: false, address, error: 'PLATFORM_MAILBOX_RESERVED', code: 'reserved' };
  }

  const creds = cfCredentials();
  if (!creds) return { success: false, address, error: 'CLOUDFLARE_CREDENTIALS_MISSING', code: 'config' };

  const to = (destination ?? process.env.CLINIC_MAIL_FORWARD_TO ?? '').trim();
  if (!to || !to.includes('@')) {
    return { success: false, address, error: 'DESTINATION_MISSING', code: 'config' };
  }

  try {
    const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${creds.zoneId}/email/routing/rules`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${creds.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `clinic-${local}`,
        enabled: true,
        matchers: [{ type: 'literal', field: 'to', value: address }],
        actions: [{ type: 'forward', value: [to] }],
      }),
    });
    const body = (await res.json().catch(() => ({}))) as CfErrorBody;

    if (res.ok) {
      return { success: true, address, ruleId: body.result?.id };
    }

    const cfCode = body.errors?.[0]?.code;
    if (res.status === 409 && cfCode === 2014) {
      const ruleId = await findRuleIdByAddress(creds, address);
      return { success: true, address, ruleId, alreadyExisted: true };
    }
    if (res.status === 400 && cfCode === 2054) {
      return {
        success: false,
        address,
        needsVerification: true,
        error: 'DESTINATION_NOT_VERIFIED',
        code: 'needs_verification',
      };
    }
    if (res.status === 401 || res.status === 403) {
      return { success: false, address, error: 'CLOUDFLARE_FORBIDDEN', code: 'forbidden' };
    }
    return {
      success: false,
      address,
      error: body.errors?.[0]?.message || `CLOUDFLARE_HTTP_${res.status}`,
      code: 'cloudflare',
    };
  } catch (err) {
    return {
      success: false,
      address,
      error: err instanceof Error ? err.message : String(err),
      code: 'network',
    };
  }
}
