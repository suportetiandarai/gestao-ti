import { createClient } from 'npm:@supabase/supabase-js@2';
import { getGoogleAccessToken, sanitizeText } from '../_shared/google-sheets.ts';

const MONITOR_NAME = 'TIMED';
const DEFAULT_URL = 'https://hmandarai.vitai.care/vitai/pages/painel.do';
const DEFAULT_SPREADSHEET_ID = '1IlfI3FfxAf93uQPX8Pd-DaB76D2acsLqFj3-1P93vjI';
const WRITE_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

function env(name: string) {
  return Deno.env.get(name)?.trim() || '';
}

function boundedNumber(name: string, fallback: number, minimum: number, maximum: number) {
  const value = Number(env(name) || fallback);
  return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, Math.round(value))) : fallback;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function authorized(request: Request) {
  const expected = env('TIMED_MONITOR_CRON_SECRET');
  const received = request.headers.get('Authorization') || '';
  return Boolean(expected && received === `Bearer ${expected}`);
}

function safeError(error: unknown) {
  if (error instanceof DOMException && error.name === 'AbortError') return 'Timeout ao acessar o TIMED.';
  if (error instanceof TypeError) return 'Falha de rede, DNS, SSL ou conexão recusada.';
  return sanitizeText(error instanceof Error ? error.message : error, 300) || 'Falha não identificada.';
}

function durationText(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remaining = safe % 60;
  return [hours, minutes, remaining].map((value) => String(value).padStart(2, '0')).join(':');
}

function saoPauloParts(value: string) {
  const parts: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value))) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }
  return {
    date: `${parts.day}/${parts.month}/${parts.year}`,
    time: `${parts.hour}:${parts.minute}:${parts.second}`,
  };
}

async function checkTimed() {
  const target = env('TIMED_MONITOR_URL') || DEFAULT_URL;
  const timeoutMs = boundedNumber('TIMED_MONITOR_TIMEOUT_MS', 15_000, 3_000, 30_000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  try {
    const response = await fetch(target, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'GestaoTI-TIMED-Monitor/1.0', Accept: 'text/html,*/*;q=0.8' },
    });
    const elapsedMs = Math.max(0, Math.round(performance.now() - started));
    const finalUrl = response.url || target;
    const healthy = (response.status >= 200 && response.status < 400) || [401, 403].includes(response.status);
    await response.body?.cancel().catch(() => undefined);
    return {
      healthy,
      httpStatus: response.status,
      elapsedMs,
      finalUrl,
      error: healthy ? null : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      healthy: false,
      httpStatus: null,
      elapsedMs: Math.max(0, Math.round(performance.now() - started)),
      finalUrl: target,
      error: safeError(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

type Downtime = {
  id: string;
  down_at: string;
  recovered_at: string;
  duration_seconds: number;
  sheet_sync_attempts: number;
};

async function googleSheetTitle(accessToken: string, spreadsheetId: string) {
  const configured = env('GOOGLE_TIMED_MONITOR_SHEET_NAME');
  if (configured) return configured;
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties(title,index)`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) throw new Error(`Google Sheets metadata HTTP ${response.status}`);
  const payload = await response.json();
  const sheets = Array.isArray(payload.sheets) ? payload.sheets : [];
  const first = sheets.sort((left: { properties?: { index?: number } }, right: { properties?: { index?: number } }) =>
    Number(left.properties?.index || 0) - Number(right.properties?.index || 0))[0];
  const title = String(first?.properties?.title || '').trim();
  if (!title) throw new Error('A planilha não possui uma aba disponível.');
  return title;
}

async function googleValues(
  accessToken: string,
  spreadsheetId: string,
  range: string,
) {
  const encoded = encodeURIComponent(range);
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encoded}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) throw new Error(`Google Sheets leitura HTTP ${response.status}`);
  return response.json();
}

async function updateGoogleValues(
  accessToken: string,
  spreadsheetId: string,
  range: string,
  values: unknown[][],
) {
  const encoded = encodeURIComponent(range);
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encoded}?valueInputOption=RAW`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ range, majorDimension: 'ROWS', values }),
    },
  );
  if (!response.ok) throw new Error(`Google Sheets atualização HTTP ${response.status}`);
  return response.json();
}

async function appendDowntime(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string,
  downtime: Downtime,
) {
  const escapedSheet = sheetName.replace(/'/g, "''");
  const headerRange = `'${escapedSheet}'!A1:E1`;
  const header = await googleValues(accessToken, spreadsheetId, headerRange);
  const currentHeader = Array.isArray(header.values?.[0]) ? header.values[0] : [];
  if (!currentHeader.slice(0, 4).some((value: unknown) => String(value || '').trim())) {
    await updateGoogleValues(accessToken, spreadsheetId, headerRange, [[
      'Data', 'Hora da Queda', 'Hora do Retorno', 'Tempo OFF', 'ID Evento',
    ]]);
  } else if (!String(currentHeader[4] || '').trim()) {
    await updateGoogleValues(accessToken, spreadsheetId, `'${escapedSheet}'!E1`, [['ID Evento']]);
  }

  const ids = await googleValues(accessToken, spreadsheetId, `'${escapedSheet}'!E2:E`);
  const existingIndex = (ids.values || []).findIndex((row: unknown[]) => String(row?.[0] || '') === downtime.id);
  if (existingIndex >= 0) return existingIndex + 2;

  const down = saoPauloParts(downtime.down_at);
  const recovered = saoPauloParts(downtime.recovered_at);
  const range = `'${escapedSheet}'!A:E`;
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append` +
      '?valueInputOption=RAW&insertDataOption=INSERT_ROWS',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        range,
        majorDimension: 'ROWS',
        values: [[down.date, down.time, recovered.time, durationText(downtime.duration_seconds), downtime.id]],
      }),
    },
  );
  if (!response.ok) throw new Error(`Google Sheets append HTTP ${response.status}`);
  const payload = await response.json();
  const updatedRange = String(payload.updates?.updatedRange || '');
  const row = Number(updatedRange.match(/!(?:[A-Z]+)(\d+):/)?.[1] || 0);
  return row || null;
}

async function syncClosedDowntimes(client: ReturnType<typeof createClient>) {
  const { data, error } = await client
    .from('system_downtimes')
    .select('id,down_at,recovered_at,duration_seconds,sheet_sync_attempts')
    .eq('status', 'closed')
    .eq('sheet_synced', false)
    .order('updated_at', { ascending: true })
    .limit(10);
  if (error) throw error;
  const downtimes = (data || []).filter((row: { recovered_at?: string; duration_seconds?: number | null }) =>
    row.recovered_at && row.duration_seconds !== null) as Downtime[];
  if (!downtimes.length) return { pending: 0, synced: 0 };

  const credentials = env('GOOGLE_SERVICE_ACCOUNT_JSON_B64');
  if (!credentials) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON_B64 não configurado.');
  const spreadsheetId = env('GOOGLE_TIMED_MONITOR_SPREADSHEET_ID') || DEFAULT_SPREADSHEET_ID;
  const accessToken = await getGoogleAccessToken(credentials, WRITE_SCOPE);
  const sheetName = await googleSheetTitle(accessToken, spreadsheetId);
  let synced = 0;

  for (const downtime of downtimes) {
    try {
      const sheetRow = await appendDowntime(accessToken, spreadsheetId, sheetName, downtime);
      const { error: updateError } = await client.from('system_downtimes').update({
        sheet_synced: true,
        sheet_row: sheetRow,
        sheet_synced_at: new Date().toISOString(),
        sheet_last_error: null,
      }).eq('id', downtime.id);
      if (updateError) throw updateError;
      synced += 1;
      console.info(`[TIMED MONITOR] Google Sheets synchronized: ${downtime.id}`);
    } catch (error) {
      const message = safeError(error);
      await client.from('system_downtimes').update({
        sheet_sync_attempts: Number(downtime.sheet_sync_attempts || 0) + 1,
        sheet_last_error: message,
      }).eq('id', downtime.id);
      console.error(`[TIMED MONITOR] Google Sheets pending: ${message}`);
    }
  }
  return { pending: downtimes.length - synced, synced };
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);
  if (!authorized(request)) return json({ error: 'Não autorizado.' }, 401);

  const url = env('SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return json({ error: 'Configuração interna incompleta.' }, 503);
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const executionId = crypto.randomUUID();
  let acquired = false;

  try {
    const { data: lock, error: lockError } = await client.rpc('acquire_system_monitor_lock', {
      p_monitor_name: MONITOR_NAME,
      p_execution_id: executionId,
      p_lock_seconds: 110,
    });
    if (lockError) throw lockError;
    acquired = lock === true;
    if (!acquired) {
      console.info('[TIMED MONITOR] SKIPPED - execução concorrente ativa');
      return json({ ok: true, skipped: true, reason: 'lock_active' }, 202);
    }

    const checkedAt = new Date().toISOString();
    const observation = await checkTimed();
    const { data: transition, error: transitionError } = await client.rpc('record_system_monitor_check', {
      p_monitor_name: MONITOR_NAME,
      p_execution_id: executionId,
      p_checked_at: checkedAt,
      p_is_success: observation.healthy,
      p_http_status: observation.httpStatus,
      p_response_time_ms: observation.elapsedMs,
      p_error: observation.error,
    });
    if (transitionError) throw transitionError;

    const action = String(transition?.action || 'none');
    if (observation.healthy) {
      console.info(`[TIMED MONITOR] ${action.toUpperCase()} - HTTP ${observation.httpStatus} - ${observation.elapsedMs}ms`);
    } else {
      console.warn(`[TIMED MONITOR] ${action.toUpperCase()} - ${observation.error}`);
    }

    let sheetSync = { pending: 0, synced: 0 };
    try {
      sheetSync = await syncClosedDowntimes(client);
    } catch (error) {
      console.error(`[TIMED MONITOR] Google Sheets retry failed: ${safeError(error)}`);
      sheetSync = { pending: -1, synced: 0 };
    }

    return json({
      ok: true,
      monitor: MONITOR_NAME,
      healthy: observation.healthy,
      httpStatus: observation.httpStatus,
      responseTimeMs: observation.elapsedMs,
      finalUrl: observation.finalUrl,
      action,
      sheetSync,
      checkedAt,
    });
  } catch (error) {
    console.error(`[TIMED MONITOR] Execution failed: ${safeError(error)}`);
    return json({ error: 'Monitoramento temporariamente indisponível.' }, 503);
  } finally {
    if (acquired) {
      await client.rpc('release_system_monitor_lock', {
        p_monitor_name: MONITOR_NAME,
        p_execution_id: executionId,
      });
    }
  }
});
