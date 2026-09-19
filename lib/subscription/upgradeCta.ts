/**
 * STEP 15G-B — Upgrade CTA helpers (universal: safe to import from client and server).
 *
 * Never imports runtime server modules (entitlements.ts/supabase) — only the
 * EntitlementResource type (type-only, erased at compile time). The approved
 * upgrade suggestions are static, auditable and NEVER propose an upgrade for
 * resources that are unlimited (null) everywhere.
 */
import type { EntitlementResource } from './entitlements';

/** All seven canonical resources with Arabic labels (single source for UI). */
export const RESOURCE_LABEL_AR: Record<EntitlementResource, string> = {
  ai_messages: 'رسائل الذكاء الاصطناعي',
  bookings: 'الحجوزات',
  patients: 'المرضى',
  providers: 'الأطباء',
  users: 'أعضاء الفريق',
  knowledge_docs: 'مستندات قاعدة المعرفة',
  conversations: 'المحادثات',
};

/**
 * Approved upgrade suggestion per resource (v2 4-tier matrix).
 *   * non-null  -> a SELLABLE plan that resolves the limit for that resource,
 *   * null      -> the resource is unlimited on every plan — never offer an upgrade.
 * Only sellable plan ids may appear here (basic / advanced / center and their
 * *_yearly variants) — never `limited`, which is the degraded fallback itself.
 */
export const UPGRADE_SUGGESTIONS: Record<EntitlementResource, string | null> = {
  ai_messages: 'advanced',    // limited 10 → advanced unlimited
  bookings: 'advanced',       // limited 50 → advanced unlimited
  patients: 'basic',          // limited 5  → basic 500 → advanced/center unlimited
  providers: 'advanced',      // limited 2  → advanced 4 → center 10
  users: 'center',            // limited 2  → basic 1 / advanced 4 / center 10
  knowledge_docs: 'advanced', // limited 3  → advanced unlimited
  conversations: null,        // unlimited on every plan — no upgrade
};

/** Human Arabic message for an entitlement block (admin-facing). */
export const ENTITLEMENT_BLOCK_MSG: Record<EntitlementResource, string> = {
  ai_messages: 'لقد وصلت إلى الحد الشهري لرسائل الذكاء الاصطناعي في هذه الخطة.',
  bookings: 'لقد وصلت إلى الحد الشهري للحجوزات في هذه الخطة.',
  patients: 'لقد وصلت إلى الحد الأقصى للمرضى في هذه الخطة.',
  providers: 'لقد وصلت إلى الحد الأقصى لعدد الأطباء في هذه الخطة.',
  users: 'لقد وصلت إلى الحد الأقصى لعدد أعضاء الفريق في هذه الخطة.',
  knowledge_docs: 'لقد وصلت إلى الحد الأقصى لعدد مستندات قاعدة المعرفة في هذه الخطة.',
  conversations: 'لقد وصلت إلى الحد الأقصى للمحادثات في هذه الخطة.',
};

/**
 * The canonical subscription URL used by every upgrade CTA:
 *   tenant-scoped (inside a tenant dashboard):
 *     /dashboard/{clinicSlug}/subscription?upgrade=1&resource=<resource>&plan=<plan>
 *   legacy flat fallback (only when no tenant context is available):
 *     /dashboard/subscription?upgrade=1&resource=<resource>&plan=<plan>
 * When plan is null the resource is unlimited → returns null (no CTA).
 */
export function buildUpgradeHref(
  resource: EntitlementResource,
  plan: string | null = null,
  clinicSlug?: string | null,
): string | null {
  const suggested = plan ?? UPGRADE_SUGGESTIONS[resource];
  if (!suggested) return null; // resource unlimited everywhere → no upgrade
  const params = new URLSearchParams({ upgrade: '1', resource, plan: suggested });
  const base = clinicSlug
    ? `/dashboard/${encodeURIComponent(clinicSlug)}/subscription`
    : '/dashboard/subscription';
  return `${base}?${params.toString()}`;
}

/** Returns the approved suggestion for a resource or null when it is unlimited. */
export function suggestedPlanFor(resource: EntitlementResource): string | null {
  return UPGRADE_SUGGESTIONS[resource];
}

/**
 * Parses a 402 ENTITLEMENT_LIMIT_REACHED response body (both shapes:
 * the admin unified shape and the public-patient-safe shape) into a
 * uniform { resource } descriptor, or null when the body is not an entitlement block.
 */
export function parseEntitlementError(body: unknown): { resource: EntitlementResource } | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  if (record.error !== 'ENTITLEMENT_LIMIT_REACHED') return null;
  const resource = record.resource;
  if (typeof resource === 'string' && resource in RESOURCE_LABEL_AR) {
    return { resource: resource as EntitlementResource };
  }
  return null;
}