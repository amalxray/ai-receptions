import type { PublicThemeSettings } from '@/lib/services/clinicPublicConfig';

export type ThemePatch = Partial<PublicThemeSettings>;

export async function loadThemeConfig(clinicId: string, authHeaders: () => Promise<Record<string, string>>) {
  const headers = await authHeaders();
  const response = await fetch(`/api/clinic/public-page?clinic_id=${encodeURIComponent(clinicId)}`, { headers });
  if (!response.ok) {
    throw new Error('Unable to load public theme');
  }
  const payload = (await response.json()) as { data?: { theme?: ThemePatch } };
  return payload.data?.theme ?? {};
}

export async function saveThemeConfig(
  clinicId: string,
  theme: ThemePatch,
  authHeaders: () => Promise<Record<string, string>>
) {
  const headers = await authHeaders();
  const response = await fetch(`/api/clinic/public-page?clinic_id=${encodeURIComponent(clinicId)}`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ theme }),
  });

  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) {
    throw new Error(payload?.error ?? 'Unable to save public theme');
  }

  return payload ?? {};
}
