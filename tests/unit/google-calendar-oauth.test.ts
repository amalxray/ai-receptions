import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDecipheriv } from 'node:crypto';
import {
  createGoogleCalendarAuthorizationUrl,
  finishGoogleCalendarAuthorization,
  getClinicGoogleCalendarClient,
  getGoogleCalendarConnectionStatus,
  getMissingGoogleCalendarOAuthSettings,
  verifyGoogleCalendarOAuthState,
} from '@/lib/services/googleCalendarOAuth';

const persistence = vi.hoisted(() => {
  const state: { settings: Record<string, unknown>; query: Record<string, any> } = {
    settings: {},
    query: {},
  };
  const query = state.query;
  for (const method of ['from', 'select', 'eq', 'is']) {
    query[method] = vi.fn(() => query);
  }
  query.maybeSingle = vi.fn(async () => ({ data: { settings: state.settings }, error: null }));
  query.update = vi.fn((values: { settings: Record<string, unknown> }) => {
    state.settings = values.settings;
    return query;
  });
  query.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data: null, error: null }).then(resolve);
  return state;
});

const oauthClients = vi.hoisted(() => ({ instances: [] as Array<Record<string, any>> }));

vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: class MockOAuth2 {
        credentials: Record<string, unknown> = {};
        tokenListener?: (tokens: Record<string, unknown>) => void;

        constructor() {
          oauthClients.instances.push(this);
        }

        async getToken() {
          return {
            tokens: {
              access_token: 'access-token-secret',
              refresh_token: 'refresh-token-secret',
              expiry_date: 1_800_000_000_000,
              token_type: 'Bearer',
              scope: 'calendar.events',
            },
          };
        }

        generateAuthUrl(options: Record<string, unknown>) {
          const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
          for (const [key, value] of Object.entries(options)) {
            url.searchParams.set(key, Array.isArray(value) ? value.join(' ') : String(value));
          }
          return url.toString();
        }

        setCredentials(credentials: Record<string, unknown>) {
          this.credentials = credentials;
        }

        on(event: string, listener: (tokens: Record<string, unknown>) => void) {
          if (event === 'tokens') this.tokenListener = listener;
          return this;
        }

        async getAccessToken() {
          const tokens = {
            access_token: 'refreshed-access-token',
            expiry_date: 1_900_000_000_000,
            token_type: 'Bearer',
            scope: 'calendar.events',
          };
          this.tokenListener?.(tokens);
          return { token: tokens.access_token };
        }
      },
    },
    calendar: vi.fn(),
  },
}));

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => persistence.query.from(...args) },
}));

describe('per-clinic Google Calendar OAuth state', () => {
  beforeEach(() => {
    vi.stubEnv('GOOGLE_CALENDAR_CLIENT_ID', 'client-id');
    vi.stubEnv('GOOGLE_CALENDAR_CLIENT_SECRET', 'client-secret');
    vi.stubEnv('GOOGLE_CALENDAR_REDIRECT_URI', 'http://localhost:3000/api/clinic/google-calendar/callback');
    vi.stubEnv('GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY', Buffer.alloc(32, 7).toString('base64'));
    persistence.settings = {};
    oauthClients.instances = [];
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ email: 'clinic@example.test' }),
    })));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('binds OAuth state to the selected clinic and authenticated user', () => {
    const authorizationUrl = new URL(createGoogleCalendarAuthorizationUrl('clinic-id', 'user-id'));
    const state = authorizationUrl.searchParams.get('state');

    expect(authorizationUrl.searchParams.get('access_type')).toBe('offline');
    expect(authorizationUrl.searchParams.get('prompt')).toBe('consent');
    expect(state?.split('.')).toHaveLength(3);
    expect(state && verifyGoogleCalendarOAuthState(state)).toMatchObject({
      clinic_id: 'clinic-id',
      user_id: 'user-id',
    });
  });

  it('rejects tampered and malformed OAuth state', () => {
    const authorizationUrl = new URL(createGoogleCalendarAuthorizationUrl('clinic-id', 'user-id'));
    const state = authorizationUrl.searchParams.get('state')!;
    const [header, payload, signature] = state.split('.');

    expect(verifyGoogleCalendarOAuthState(`${header}.${payload}.${signature.slice(1)}`)).toBeNull();
    expect(verifyGoogleCalendarOAuthState('not-a-state')).toBeNull();
  });

  it('allows enough time to complete a slow Google sign-in', () => {
    const now = new Date('2026-10-10T20:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);
    try {
      const authorizationUrl = new URL(createGoogleCalendarAuthorizationUrl('clinic-id', 'user-id'));
      const state = authorizationUrl.searchParams.get('state');
      expect(state && verifyGoogleCalendarOAuthState(state)).not.toBeNull();

      vi.setSystemTime(new Date(now.getTime() + 11 * 60_000));
      expect(state && verifyGoogleCalendarOAuthState(state)).not.toBeNull();

      vi.setSystemTime(new Date(now.getTime() + 31 * 60_000));
      expect(state && verifyGoogleCalendarOAuthState(state)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports missing server settings by name without exposing their values', () => {
    vi.stubEnv('GOOGLE_CALENDAR_CLIENT_SECRET', '');
    vi.stubEnv('GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY', 'not-a-valid-key');

    expect(getMissingGoogleCalendarOAuthSettings()).toEqual([
      'GOOGLE_CALENDAR_CLIENT_SECRET',
      'GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY (32-byte Base64)',
    ]);
  });

  it('encrypts access and refresh tokens before saving them to the clinic row', async () => {
    await finishGoogleCalendarAuthorization('clinic-id', 'authorization-code');

    const savedRecord = persistence.settings.google_calendar_oauth as Record<string, unknown>;
    expect(JSON.stringify(savedRecord)).not.toContain('access-token-secret');
    expect(JSON.stringify(savedRecord)).not.toContain('refresh-token-secret');
    expect(savedRecord).toMatchObject({ version: 1, connected_at: expect.any(String) });
    expect(await getGoogleCalendarConnectionStatus('clinic-id')).toMatchObject({
      connected: true,
      email: 'clinic@example.test',
    });
    expect(persistence.query.eq).toHaveBeenCalledWith('id', 'clinic-id');
  });

  it('persists refreshed credentials encrypted for the same clinic', async () => {
    await finishGoogleCalendarAuthorization('clinic-id', 'authorization-code');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2028-01-01T00:00:00.000Z'));
    try {
      const client = await getClinicGoogleCalendarClient('clinic-id');
      expect(client).not.toBeNull();
      await client?.flushTokenPersistence();
    } finally {
      vi.useRealTimers();
    }

    const encryptedRecord = persistence.settings.google_calendar_oauth as {
      iv: string;
      tag: string;
      ciphertext: string;
      connected_at: string;
    };
    const decipher = createDecipheriv(
      'aes-256-gcm',
      Buffer.alloc(32, 7),
      Buffer.from(encryptedRecord.iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(encryptedRecord.tag, 'base64'));
    const savedTokens = JSON.parse(Buffer.concat([
      decipher.update(Buffer.from(encryptedRecord.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8')) as Record<string, unknown>;

    expect(savedTokens).toMatchObject({
      access_token: 'refreshed-access-token',
      refresh_token: 'refresh-token-secret',
      expiry_date: 1_900_000_000_000,
    });
    expect(encryptedRecord.connected_at).toEqual(expect.any(String));
    expect(JSON.stringify(encryptedRecord)).not.toContain('refreshed-access-token');
    expect(persistence.query.eq).toHaveBeenCalledWith('id', 'clinic-id');
  });
});
