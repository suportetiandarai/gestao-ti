export type SheetSource = 'timed' | 'training' | 'ad';

export type NormalizedSheetRequest = {
  source: SheetSource;
  source_row: number;
  requested_at: string;
  requester_name: string;
  sector: string | null;
  job_title: string | null;
  training_topic: string | null;
  scheduled_at: string | null;
  pending_reason: string | null;
  source_status: string | null;
  normalized_status: string;
  dashboard_status: DashboardSheetStatus;
  status_updated_at: string | null;
  completed_at: string | null;
  hidden_after_shift: string | null;
  is_source_present: boolean;
  sort_priority: number;
  sort_key: number;
  row_hash: string;
  sync_marker: string;
};

export type DashboardSheetStatus =
  'completed' | 'pending' | 'not_completed' | 'scheduled' | 'not_scheduled' |
  'already_exists' | 'no_contact' | 'duplicate' | 'other' | 'withdrawal';

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
    const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}` +
      `T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:${second.padStart(2, '0')}-03:00`;
    const parsed = new Date(iso);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function normalizeRequestStatus(value: unknown) {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const aliases: Record<string, string> = {
    realizados: 'realizado',
    realizada: 'realizado',
    realizadas: 'realizado',
    concluidos: 'concluido',
    concluidas: 'concluido',
    pendentes: 'pendente',
    nao_realizados: 'nao_realizado',
    nao_realizada: 'nao_realizado',
    nao_realizadas: 'nao_realizado',
    agendados: 'agendado',
    agendada: 'agendado',
    agendadas: 'agendado',
    nao_agendados: 'nao_agendado',
    nao_agendada: 'nao_agendado',
    nao_agendadas: 'nao_agendado',
    desistencias: 'desistencia',
  };
  return aliases[normalized] || normalized;
}

export const normalizeStatus = normalizeRequestStatus;

export function classifyTimedStatus(value: unknown) {
  const normalized = normalizeStatus(value);
  if (['cadastrado', 'realizado', 'concluido'].includes(normalized)) return 'completed';
  if (normalized === 'pendente') return 'pending';
  return 'not_completed';
}

export function classifyAdStatus(value: unknown): DashboardSheetStatus {
  const normalized = normalizeStatus(value);
  if (normalized === 'realizado') return 'completed';
  if (normalized === 'ja_existente') return 'already_exists';
  if (normalized === 'pendente') return 'pending';
  return 'not_completed';
}

export function classifyTrainingStatus(value: unknown): DashboardSheetStatus {
  const normalized = normalizeStatus(value);
  if (['realizado', 'concluido'].includes(normalized)) return 'completed';
  if (normalized === 'agendado') return 'scheduled';
  if (normalized === 'sem_contato') return 'no_contact';
  if (normalized === 'duplicado') return 'duplicate';
  if (['outro', 'outros'].includes(normalized)) return 'other';
  if (normalized === 'desistencia') return 'withdrawal';
  if (normalized === 'pendente') return 'pending';
  return 'not_scheduled';
}

export function requestSortPriority(source: SheetSource, status: DashboardSheetStatus) {
  if (source === 'training') {
    const priorities: Partial<Record<DashboardSheetStatus, number>> = {
      not_scheduled: 1,
      pending: 1,
      no_contact: 2,
      duplicate: 3,
      other: 4,
      withdrawal: 5,
      scheduled: 6,
      completed: 7,
    };
    return priorities[status] || 5;
  }
  if (status === 'not_completed') return 1;
  if (status === 'pending') return 2;
  return 3;
}

export function requestSortKey(
  status: DashboardSheetStatus,
  requestedAt: string,
  completedAt: string | null = null,
) {
  const timestamp = new Date(
    ['completed', 'already_exists'].includes(status) && completedAt
      ? completedAt
      : requestedAt,
  ).getTime();
  if (!Number.isFinite(timestamp)) return 0;
  return ['completed', 'already_exists'].includes(status) ? -timestamp : timestamp;
}

export function isTerminalStatus(source: SheetSource, status: DashboardSheetStatus) {
  return status === 'completed' || (source === 'ad' && status === 'already_exists');
}

function saoPauloParts(value: Date) {
  const values: Record<string, number> = {};
  for (const part of new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value)) {
    if (part.type !== 'literal') values[part.type] = Number(part.value);
  }
  return values;
}

function localDateTime(parts: Record<string, number>) {
  const target = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute || 0, parts.second || 0);
  let candidate = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = saoPauloParts(new Date(candidate));
    const represented = Date.UTC(
      current.year, current.month - 1, current.day, current.hour, current.minute, current.second,
    );
    candidate += target - represented;
  }
  return new Date(candidate);
}

export function getShiftEnd(value: Date) {
  const parts = saoPauloParts(value);
  const endHour = parts.hour >= 7 && parts.hour < 19 ? 19 : 7;
  const nextDay = parts.hour >= 19;
  const calendar = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + (nextDay ? 1 : 0)));
  return localDateTime({
    year: calendar.getUTCFullYear(),
    month: calendar.getUTCMonth() + 1,
    day: calendar.getUTCDate(),
    hour: endHour,
  });
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
