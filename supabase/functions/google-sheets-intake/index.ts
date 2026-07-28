export {};

const ALLOWED_ORIGINS = new Set([
  'https://suportetiandarai.github.io',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
]);

function env(name: string) {
  return Deno.env.get(name)?.trim() || '';
}

function cors(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://suportetiandarai.github.io';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function text(value: unknown, maximum = 200) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maximum);
}

function digits(value: unknown, maximum = 15) {
  return String(value || '').replace(/\D/g, '').slice(0, maximum);
}

function email(value: unknown) {
  const normalized = text(value, 180).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : '';
}

type Upload = { name: string; type: string; base64: string };

function files(value: unknown): Upload[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 4).map((item) => ({
    name: text(item?.name, 120),
    type: text(item?.type, 80),
    base64: String(item?.base64 || ''),
  })).filter((item) =>
    item.name &&
    /^(image\/(?:jpeg|png|webp)|application\/pdf)$/.test(item.type) &&
    /^[A-Za-z0-9+/]+=*$/.test(item.base64) &&
    item.base64.length <= 500_000
  );
}

function normalize(raw: Record<string, unknown>) {
  const type = text(raw.type, 20).toLowerCase();
  const common = {
    type,
    name: text(raw.name, 160),
    email: email(raw.email),
    phone: digits(raw.phone, 11),
    honeypot: text(raw.website, 100),
  };
  if (!['timed', 'training', 'ad'].includes(type) || !common.name.includes(' ')) {
    throw new Error('INVALID_REQUEST');
  }
  if (common.honeypot) throw new Error('SPAM_DETECTED');

  if (type === 'ad') {
    const cpf = digits(raw.cpf, 11);
    if (cpf.length !== 11 || !common.email || common.phone.length < 10) throw new Error('INVALID_REQUEST');
    return { ...common, cpf };
  }
  if (type === 'training') {
    if (!common.email || common.phone.length < 10) throw new Error('INVALID_REQUEST');
    return {
      ...common,
      jobTitle: text(raw.jobTitle, 120),
      location: text(raw.location, 180),
      topic: text(raw.topic, 180),
      desiredAt: text(raw.desiredAt, 40),
    };
  }
  const cpf = digits(raw.cpf, 11);
  if (cpf.length !== 11 || !common.email || common.phone.length < 10) throw new Error('INVALID_REQUEST');
  return {
    ...common,
    cpf,
    sex: text(raw.sex, 30),
    birthDate: text(raw.birthDate, 20),
    cns: digits(raw.cns, 20),
    councilNumber: text(raw.councilNumber, 80) || 'ISENTO',
    jobTitle: text(raw.jobTitle, 140),
    specialty: text(raw.specialty, 120),
    employment: text(raw.employment, 80),
    registration: text(raw.registration, 60),
    location: text(raw.location, 180),
    councilFiles: files(raw.councilFiles),
    documentFiles: files(raw.documentFiles),
  };
}

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
  if (request.method !== 'POST') return json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405, origin);
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json({ ok: false, code: 'ORIGIN_NOT_ALLOWED' }, 403, origin);
  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (contentLength > 2_500_000) return json({ ok: false, code: 'PAYLOAD_TOO_LARGE' }, 413, origin);

  const scriptUrl = env('GOOGLE_APPS_SCRIPT_WEBAPP_URL');
  const sharedSecret = env('GOOGLE_APPS_SCRIPT_SHARED_SECRET');
  if (!scriptUrl || !sharedSecret) return json({ ok: false, code: 'SERVICE_NOT_CONFIGURED' }, 503, origin);

  try {
    const bodyText = await request.text();
    if (new TextEncoder().encode(bodyText).byteLength > 2_500_000) {
      return json({ ok: false, code: 'PAYLOAD_TOO_LARGE' }, 413, origin);
    }
    const raw = JSON.parse(bodyText);
    const payload = normalize(raw);
    const response = await fetch(scriptUrl, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ secret: sharedSecret, payload }),
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) throw new Error(`APPS_SCRIPT_HTTP_${response.status}`);
    const result = await response.json();
    if (!result.ok) {
      const code = text(result.code, 50) || 'SUBMISSION_REJECTED';
      const status = code.startsWith('DUPLICATE_') ? 409 : 400;
      return json({ ok: false, code }, status, origin);
    }
    return json({ ok: true, protocol: String(result.protocol || '') }, 201, origin);
  } catch (error) {
    const code = error instanceof Error && ['INVALID_REQUEST', 'SPAM_DETECTED'].includes(error.message)
      ? error.message
      : 'TEMPORARILY_UNAVAILABLE';
    console.error('Google Sheets intake:', code);
    return json({ ok: false, code }, code === 'INVALID_REQUEST' ? 400 : 503, origin);
  }
});
