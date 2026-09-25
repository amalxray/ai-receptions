import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/q/[publicId]/route';

// STEP 15D — /q/{publicId} redirect route (QR destination).
//
// The destination is READINESS-AWARE (P1): a printed QR code may only land on the
// tenant subdomain while that host is registered on the Vercel project; otherwise
// it must fall back to the reachable `/c/{slug}` compatibility page.
const mockState = vi.hoisted(() => ({
  clinic: null as { id: string; slug: string; name: string } | null,
  ready: true,
}));

vi.mock('@/lib/vercel/tenantLinks', () => ({
  resolveTenantPublicUrl: vi.fn(async (slug: string) =>
    mockState.ready ? `https://${slug}.dentairec.com` : `http://localhost:3000/c/${slug}`
  ),
}));

vi.mock('@/lib/services/clinics', () => ({
  resolvePublicClinic: vi.fn(async () => mockState.clinic),
}));

describe('15D — GET /q/[publicId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.ready = true;
    mockState.clinic = { id: '11111111-1111-1111-1111-111111111111', slug: 'demo-clinic', name: 'Demo' };
  });

  it('redirects (302) to the canonical activity space on the tenant subdomain (Phase E)', async () => {
    const res = await GET(new Request('https://www.dentairec.com/q/pub_xyz'), {
      params: { publicId: 'pub_xyz' },
    });
    expect(res.status).toBe(302);
    // `new URL()` normalizes the empty root path to `/` — the same URL.
    expect(res.headers.get('location')).toBe('https://demo-clinic.dentairec.com/');
  });

  it('falls back to /c/{slug} while the tenant host is not registered (P1)', async () => {
    mockState.ready = false;
    const res = await GET(new Request('https://www.dentairec.com/q/pub_xyz'), {
      params: { publicId: 'pub_xyz' },
    });
    // A printed code must never point at a host whose TLS handshake aborts.
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('http://localhost:3000/c/demo-clinic');
  });

  it('returns 404 for an unknown public id', async () => {
    mockState.clinic = null;
    const res = await GET(new Request('https://clinics.example.com/q/nope'), {
      params: { publicId: 'nope' },
    });
    expect(res.status).toBe(404);
  });

  it('returns 404 for empty / oversized public ids', async () => {
    const empty = await GET(new Request('https://clinics.example.com/q/'), { params: { publicId: '  ' } });
    expect(empty.status).toBe(404);
    const huge = await GET(new Request('https://clinics.example.com/q/x'), {
      params: { publicId: 'x'.repeat(200) },
    });
    expect(huge.status).toBe(404);
  });
});