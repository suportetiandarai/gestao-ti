export type SheetSource = 'timed' | 'training' | 'ad';

export type NormalizedSheetRequest = {
  source: SheetSource;
  source_row: number;
  requested_at: string;
  requester_name: string;
  sector: string | null;
  job_title: string | null;
  training_topic: string | null;
  source_status: string | null;
  dashboard_status: 'completed' | 'pending' | 'not_completed' | 'scheduled' | 'not_scheduled';
  sort_priority: number;
  row_hash: string;
  sync_marker: string;
};

type Rgb = { red?: number; green?: number; blue?: number };

const encoder = new TextEncoder();

function base64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function parseSheetDate(value: unknown) {
  const text = String(value || '').trim();
  if (!text) return null;
  const brazilian = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (brazilian) {
    const [, day, month, year, hour = '0', minute = '0', second = '0'] = brazilian;
    const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute}:${second}-03:00`;
    const parsed = new Date(iso);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function classifyTrainingColor(color: Rgb | null | undefined) {
  const red = color?.red ?? 1;
  const green = color?.green ?? 1;
  const blue = color?.blue ?? 1;
  if (red > 0.75 && red - green > 0.15 && blue < 0.75) return 'ignore';
  if (green > 0.75 && green - red > 0.15 && blue < 0.55) return 'completed';
  if (red > 0.8 && green > 0.75 && blue < 0.55) return 'scheduled';
  return 'not_scheduled';
}

export function classifyTimedStatus(value: unknown) {
  const normalized = String(value || '').trim().toLocaleUpperCase('pt-BR');
  if (normalized === 'CADASTRADO' || normalized === 'REALIZADO') return 'completed';
  if (normalized === 'PENDENTE') return 'pending';
  return 'not_completed';
}

export async function sha256(value: unknown) {
  const stable = typeof value === 'string' ? value : JSON.stringify(value);
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(stable))))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function getGoogleAccessToken(serviceAccountBase64: string) {
  const credentials = JSON.parse(new TextDecoder().decode(decodeBase64(serviceAccountBase64)));
  if (credentials.type !== 'service_account' || !credentials.client_email || !credentials.private_key) {
    throw new Error('Credencial Google inválida.');
  }
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(encoder.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const payload = base64Url(encoder.encode(JSON.stringify({
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })));
  const pem = String(credentials.private_key)
    .replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
  const key = await crypto.subtle.importKey(
    'pkcs8',
    decodeBase64(pem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const unsigned = `${header}.${payload}`;
  const signature = new Uint8Array(await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    encoder.encode(unsigned),
  ));
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${base64Url(signature)}`,
    }),
  });
  if (!response.ok) throw new Error(`Google OAuth HTTP ${response.status}`);
  const result = await response.json();
  if (!result.access_token) throw new Error('Google OAuth não retornou token.');
  return String(result.access_token);
}

export function columnValues(valueRanges: Array<{ values?: unknown[][] }>, index: number) {
  return (valueRanges[index]?.values || []).map((row) => row?.[0] ?? '');
}

export function sanitizeText(value: unknown, maximum = 180) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maximum);
}
