import { beforeEach, describe, expect, test, vi } from 'vitest';
import { DELETE, POST } from '@/app/api/ai/knowledge/documents/[documentId]/route';

const originalEnv = process.env;
const mockPermission = vi.hoisted(() => ({ permissionDenied: vi.fn() }));

vi.mock('next/headers', () => ({
  cookies: () => ({
    get: () => undefined,
    set: () => {},
    remove: () => {},
  }),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(),
}));
vi.mock('@/lib/services/permissionGate', () => mockPermission);

import { createServerClient } from '@supabase/ssr';

describe('Knowledge document action API', () => {
  const mockSupabaseClient = {
    auth: {
      getSession: vi.fn(),
      getUser: vi.fn(),
    },
    from: vi.fn(),
  };

  beforeEach(() => {
    process.env = { ...originalEnv, NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service' };
    vi.clearAllMocks();
    (createServerClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockSupabaseClient);
    mockSupabaseClient.auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockPermission.permissionDenied.mockResolvedValue(null);
  });

  test('marks a document as deleted', async () => {
    const clinicUsersChain = {
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { role: 'owner' }, error: null }),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { clinic_id: 'clinic-1' }, error: null }),
    };
    const knowledgeChain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    };
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'clinic_users') return clinicUsersChain;
      return knowledgeChain;
    });

    const response = await DELETE(new Request('http://localhost/api/ai/knowledge/documents/doc-1?clinic_id=clinic-1'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(mockPermission.permissionDenied).toHaveBeenCalledWith(expect.any(Request), 'clinic-1', 'manage_knowledge');
  });

  test('requeues a document for processing', async () => {
    const clinicUsersChain = {
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { role: 'owner' }, error: null }),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { clinic_id: 'clinic-1' }, error: null }),
    };
    const knowledgeChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { clinic_id: 'clinic-1' }, error: null }),
      update: vi.fn().mockReturnThis(),
    };
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'clinic_users') return clinicUsersChain;
      return knowledgeChain;
    });

    const response = await POST(new Request('http://localhost/api/ai/knowledge/documents/doc-1?clinic_id=clinic-1'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.document).toEqual({ clinic_id: 'clinic-1' });
    expect(mockPermission.permissionDenied).toHaveBeenCalledWith(expect.any(Request), 'clinic-1', 'manage_knowledge');
  });
});
