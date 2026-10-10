import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { google } from 'googleapis';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logEvent } from '@/lib/server/logging';

const CALENDAR_OAUTH_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.events',
];
const OAUTH_STATE_TTL_SECONDS = 30 * 60;

type OAuthState = {
  clinic_id: string;
  user_id: string;
  iat: number;
  exp: number;
  nonce: string;
};

type EncryptedToken = {
  version: 1;
  iv: string;
  tag: string;
  ciphertext: string;
};

type ClinicCalendarSettings = {
  access_token?: string;
  refresh_token?: string;
  expiry_date?: number;
  token_type?: string;
  scope?: string;
  email?: string;
};

type GoogleOAuthTokens = {
  access_token?: string | null;
  refresh_token?: string | null;
  expiry_date?: number | null;
  token_type?: string | null;
  scope?: string | null;
};

function encryptionKey(): Buffer {
  const raw = process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY?.trim();
  if (!raw) throw new Error('Google Calendar token encryption is not configured.');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('Google Calendar token encryption key must be 32 bytes encoded as base64.');
  return key;
}

function oauthClient(redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI?.trim()): InstanceType<typeof google.auth.OAuth2> {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Google Calendar OAuth client settings are incomplete.');
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function sealToken(token: ClinicCalendarSettings): EncryptedToken {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(token), 'utf8'),
    cipher.final(),
  ]);
  return {
    version: 1,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

function openToken(value: unknown): ClinicCalendarSettings | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const encrypted = value as Partial<EncryptedToken>;
  if (
    encrypted.version !== 1 ||
    typeof encrypted.iv !== 'string' ||
    typeof encrypted.tag !== 'string' ||
    typeof encrypted.ciphertext !== 'string'
  ) return null;

  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    Buffer.from(encrypted.iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(encrypted.tag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
  const token = JSON.parse(plaintext) as ClinicCalendarSettings;
  return typeof token.refresh_token === 'string' && token.refresh_token
    ? token
    : null;
}

function signState(payload: OAuthState): string {
  const encodedHeader = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', encryptionKey())
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function verifyState(state: string): OAuthState | null {
  const [encodedHeader, encodedPayload, suppliedSignature, extra] = state.split('.');
  if (!encodedHeader || !encodedPayload || !suppliedSignature || extra) return null;
  const expectedSignature = createHmac('sha256', encryptionKey())
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();
  const actualSignature = Buffer.from(suppliedSignature, 'base64url');
  if (
    expectedSignature.length !== actualSignature.length ||
    !timingSafeEqual(expectedSignature, actualSignature)
  ) return null;

  try {
    const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8')) as { alg?: string; typ?: string };
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as OAuthState;
    if (
      header.alg !== 'HS256' ||
      header.typ !== 'JWT' ||
      typeof payload.clinic_id !== 'string' ||
      typeof payload.user_id !== 'string' ||
      typeof payload.iat !== 'number' ||
      typeof payload.exp !== 'number' ||
      payload.exp <= Math.floor(Date.now() / 1000) ||
      payload.iat > Math.floor(Date.now() / 1000) + 60 ||
      payload.exp - payload.iat > OAUTH_STATE_TTL_SECONDS ||
      typeof payload.nonce !== 'string'
    ) return null;
    return payload;
  } catch {
    return null;
  }
}

async function readClinicSettings(clinicId: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabaseAdmin
    .from('clinics')
    .select('settings')
    .eq('id', clinicId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Clinic not found.');
  return data.settings && typeof data.settings === 'object' && !Array.isArray(data.settings)
    ? data.settings as Record<string, unknown>
    : {};
}

async function persistRefreshedCredentials(
  clinicId: string,
  originalRefreshToken: string,
  refreshed: GoogleOAuthTokens,
): Promise<void> {
  if (!refreshed.access_token) return;
  const settings = await readClinicSettings(clinicId);
  const current = openToken(settings.google_calendar_oauth);
  if (!current || current.refresh_token !== originalRefreshToken) {
    throw new Error('Google Calendar connection changed while refreshing credentials.');
  }

  const envelope = settings.google_calendar_oauth as { connected_at?: unknown };
  settings.google_calendar_oauth = {
    ...sealToken({
      ...current,
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token ?? current.refresh_token,
      expiry_date: refreshed.expiry_date ?? current.expiry_date,
      token_type: refreshed.token_type ?? current.token_type,
      scope: refreshed.scope ?? current.scope,
    }),
    ...(typeof envelope.connected_at === 'string' ? { connected_at: envelope.connected_at } : {}),
  };
  const { error } = await supabaseAdmin
    .from('clinics')
    .update({ settings })
    .eq('id', clinicId)
    .is('deleted_at', null);
  if (error) throw error;
}

export function getMissingGoogleCalendarOAuthSettings(): string[] {
  const rawKey = process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY?.trim();
  const missing: string[] = [];
  if (!process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim()) missing.push('GOOGLE_CALENDAR_CLIENT_ID');
  if (!process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim()) missing.push('GOOGLE_CALENDAR_CLIENT_SECRET');
  if (!process.env.GOOGLE_CALENDAR_REDIRECT_URI?.trim()) missing.push('GOOGLE_CALENDAR_REDIRECT_URI');
  if (!rawKey || Buffer.from(rawKey, 'base64').length !== 32) {
    missing.push('GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY (32-byte Base64)');
  }
  return missing;
}

export function isGoogleCalendarOAuthConfigured(): boolean {
  return getMissingGoogleCalendarOAuthSettings().length === 0;
}

export function createGoogleCalendarAuthorizationUrl(clinicId: string, userId: string): string {
  const client = oauthClient();
  const now = Math.floor(Date.now() / 1000);
  const state = signState({
    clinic_id: clinicId,
    user_id: userId,
    iat: now,
    exp: now + OAUTH_STATE_TTL_SECONDS,
    nonce: randomBytes(24).toString('base64url'),
  });
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: true,
    scope: CALENDAR_OAUTH_SCOPES,
    state,
  });
}

export function verifyGoogleCalendarOAuthState(state: string): OAuthState | null {
  try {
    return verifyState(state);
  } catch {
    return null;
  }
}

export async function finishGoogleCalendarAuthorization(
  clinicId: string,
  code: string,
): Promise<void> {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error('Google did not return a refresh token. Revoke the app access and reconnect.');
  }
  if (!tokens.access_token) throw new Error('Google did not return an access token.');
  const profileResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!profileResponse.ok) throw new Error('Could not verify the Google account selected for this clinic.');
  const profile: unknown = await profileResponse.json();
  const email = profile && typeof profile === 'object' && 'email' in profile && typeof profile.email === 'string'
    ? profile.email
    : null;
  if (!email) throw new Error('Google did not return the selected account email.');
  const settings = await readClinicSettings(clinicId);
  const connectedAt = new Date().toISOString();
  settings.google_calendar_oauth = {
    ...sealToken({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date ?? undefined,
      token_type: tokens.token_type ?? undefined,
      scope: tokens.scope ?? undefined,
      email,
    }),
    connected_at: connectedAt,
  };
  const { error } = await supabaseAdmin
    .from('clinics')
    .update({ settings })
    .eq('id', clinicId)
    .is('deleted_at', null);
  if (error) throw error;
}

export async function disconnectGoogleCalendar(clinicId: string): Promise<void> {
  const settings = await readClinicSettings(clinicId);
  delete settings.google_calendar_oauth;
  const { error } = await supabaseAdmin
    .from('clinics')
    .update({ settings })
    .eq('id', clinicId)
    .is('deleted_at', null);
  if (error) throw error;
}

export async function getGoogleCalendarConnectionStatus(clinicId: string): Promise<{
  connected: boolean;
  connected_at: string | null;
  email: string | null;
}> {
  if (!isGoogleCalendarOAuthConfigured()) {
    return { connected: false, connected_at: null, email: null };
  }
  const settings = await readClinicSettings(clinicId);
  const token = openToken(settings.google_calendar_oauth);
  const encrypted = settings.google_calendar_oauth as { connected_at?: unknown } | undefined;
  return {
    connected: Boolean(token),
    connected_at: typeof encrypted?.connected_at === 'string' ? encrypted.connected_at : null,
    email: token?.email ?? null,
  };
}

export async function getClinicGoogleCalendarClient(clinicId: string) {
  if (!isGoogleCalendarOAuthConfigured()) return null;
  const settings = await readClinicSettings(clinicId);
  const token = openToken(settings.google_calendar_oauth);
  if (!token?.refresh_token) return null;
  const client = oauthClient();
  client.setCredentials({
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expiry_date: token.expiry_date,
    token_type: token.token_type,
    scope: token.scope,
  });
  let storedRefreshToken = token.refresh_token;
  let tokenPersistence: Promise<void> = Promise.resolve();
  let tokenPersistenceError: Error | null = null;
  client.on('tokens', (refreshed: GoogleOAuthTokens) => {
    tokenPersistence = tokenPersistence.then(async () => {
      await persistRefreshedCredentials(clinicId, storedRefreshToken, refreshed);
      storedRefreshToken = refreshed.refresh_token ?? storedRefreshToken;
      tokenPersistenceError = null;
    }).catch((error: unknown) => {
      tokenPersistenceError = error instanceof Error ? error : new Error(String(error));
      logEvent('clinic_google_calendar_token_refresh_persist_failed', {
        clinic_id: clinicId,
        error: 'Refreshed credentials could not be persisted.',
      }, 'error');
    });
  });
  const flushTokenPersistence = async () => {
    await tokenPersistence;
    if (tokenPersistenceError) throw tokenPersistenceError;
  };

  if (!token.access_token || !token.expiry_date || token.expiry_date <= Date.now() + 60_000) {
    await client.getAccessToken();
    await flushTokenPersistence();
  }

  return {
    calendar: google.calendar({ version: 'v3', auth: client }),
    calendarId: 'primary',
    flushTokenPersistence,
  };
}
