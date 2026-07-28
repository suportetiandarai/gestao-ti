import {
  classifyAdStatus,
  classifyTimedStatus,
  classifyTrainingStatus,
  columnValues,
  getGoogleAccessToken,
  getShiftEnd,
  isTerminalStatus,
  normalizeStatus,
  parseSheetDate,
  sanitizeText,
  sha256,
  type NormalizedSheetRequest,
  type SheetSource,
} from '../_shared/google-sheets.ts';

const CONFIG = {
  timed: {
    spreadsheetId: Deno.env.get('GOOGLE_TIMED_SPREADSHEET_ID') || '1EVGXL_NUV_koXR1mH_X4z_YqVmsaLytCX84ONYTzD9I',
    sheetName: Deno.env.get('GOOGLE_TIMED_SHEET_NAME') || 'Respostas ao formulário 1',
    columns: ['A:A', 'D:D', 'J:J', 'N:N', 'Q:Q', 'T:T', 'U:U'],
  },
  training: {
    spreadsheetId: Deno.env.get('GOOGLE_TRAINING_SPREADSHEET_ID') || '1vcNxK3VQ4TwIxdHWWPCQcyYY6nS1MfRLFw9c8lxza_U',
    sheetName: Deno.env.get('GOOGLE_TRAINING_SHEET_NAME') || 'Respostas ao formulário 1',
    columns: ['A:A', 'C:C', 'D:D', 'E:E', 'I:I', 'K:K', 'O:O', 'P:P'],
  },
  ad: {
    spreadsheetId: Deno.env.get('GOOGLE_AD_SPREADSHEET_ID') || '1_j13tglIFAWDcvLx2dsMGLugThdrrzbjKHYNt9H5Qj4',
    sheetName: Deno.env.get('GOOGLE_AD_SHEET_NAME') || 'SOLICITACÕES AD',
    columns: ['A:A', 'B:B', 'F:F', 'H:H', 'I:I'],
  },
} as const;

const cutoff = Deno.env.get('GOOGLE_SHEETS_CUTOFF') || '2026-07-28T00:00:00-03:00';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, x-sync-key',
};

function env(name: string) {
  return Deno.env.get(name)?.trim() || '';
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

async function database(path: string, init: RequestInit = {}) {
  const url = env('SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Supabase interno não configurado.');
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!response.ok) {
    const message = (await response.text()).slice(0, 300);
    throw new Error(`Banco HTTP ${response.status}: ${message}`);
  }
  return response;
}

async function valuesFor(source: SheetSource, accessToken: string) {
  const config = CONFIG[source];
  const query = new URLSearchParams({ majorDimension: 'ROWS' });
  for (const column of config.columns) query.append('ranges', `'${config.sheetName}'!${column}`);
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}/values:batchGet?${query}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) throw new Error(`Google Sheets ${source} HTTP ${response.status}`);
  return (await response.json()).valueRanges || [];
}

type ExistingStatus = {
  source_row: number;
  normalized_status: string;
  status_updated_at: string | null;
  completed_at: string | null;
};

async function existingStatuses(source: SheetSource) {
  const response = await database(
    `google_sheet_requests?source=eq.${source}&select=source_row,normalized_status,status_updated_at,completed_at`,
  );
  const rows = await response.json() as ExistingStatus[];
  return new Map(rows.map((row) => [row.source_row, row]));
}

async function normalize(
  source: SheetSource,
  accessToken: string,
  marker: string,
  existing: Map<number, ExistingStatus>,
) {
  const ranges = await valuesFor(source, accessToken);
  const columns = ranges.map((_: unknown, index: number) => columnValues(ranges, index));
  const rowCount = Math.max(...columns.map((column: unknown[]) => column.length), 0);
  const records: NormalizedSheetRequest[] = [];

  for (let sourceRow = 2; sourceRow <= rowCount; sourceRow += 1) {
    const index = sourceRow - 1;
    const requestedAt = parseSheetDate(columns[0]?.[index]);
    if (!requestedAt || new Date(requestedAt) < new Date(cutoff)) continue;

    const name = sanitizeText(columns[1]?.[index], 160);
    if (!name) continue;
    let dashboardStatus: NormalizedSheetRequest['dashboard_status'];
    let sourceStatus: string;
    let sector: string;
    let jobTitle: string;
    let trainingTopic: string | null = null;

    if (source === 'timed') {
      jobTitle = sanitizeText(columns[2]?.[index], 120);
      sector = sanitizeText(columns[3]?.[index], 140);
      sourceStatus = sanitizeText(columns[4]?.[index], 80);
      dashboardStatus = classifyTimedStatus(sourceStatus);
    } else if (source === 'training') {
      sector = sanitizeText(columns[2]?.[index], 140);
      jobTitle = sanitizeText(columns[3]?.[index], 120);
      trainingTopic = sanitizeText(columns[4]?.[index], 180) || null;
      sourceStatus = sanitizeText(columns[5]?.[index], 80);
      dashboardStatus = classifyTrainingStatus(sourceStatus);
    } else {
      sector = '';
      jobTitle = '';
      sourceStatus = sanitizeText(columns[2]?.[index], 80);
      dashboardStatus = classifyAdStatus(sourceStatus);
    }

    const normalized = normalizeStatus(sourceStatus);
    const previous = existing.get(sourceRow);
    const sheetStatusUpdatedAt = parseSheetDate(columns[columns.length - 2]?.[index]);
    const sheetCompletedAt = parseSheetDate(columns[columns.length - 1]?.[index]);
    const statusChanged = !previous || previous.normalized_status !== normalized;
    const statusUpdatedAt = sheetStatusUpdatedAt ||
      (statusChanged ? new Date().toISOString() : previous?.status_updated_at || null);
    const terminal = isTerminalStatus(source, dashboardStatus);
    const completedAt = terminal
      ? sheetCompletedAt || (statusChanged ? statusUpdatedAt : previous?.completed_at) || null
      : null;
    const hiddenAfterShift = completedAt ? getShiftEnd(new Date(completedAt)).toISOString() : null;
    const record = {
      source,
      source_row: sourceRow,
      requested_at: requestedAt,
      requester_name: name,
      sector: sector || null,
      job_title: jobTitle || null,
      training_topic: trainingTopic,
      source_status: sourceStatus || null,
      normalized_status: normalized,
      dashboard_status: dashboardStatus,
      status_updated_at: statusUpdatedAt,
      completed_at: completedAt,
      hidden_after_shift: hiddenAfterShift,
      is_source_present: true,
      sort_priority: ['pending', 'no_contact', 'duplicate', 'other'].includes(dashboardStatus) ? 1 :
        dashboardStatus === 'scheduled' ? 2 :
        dashboardStatus === 'not_completed' || dashboardStatus === 'not_scheduled' ? 3 : 4,
      row_hash: '',
      sync_marker: marker,
    };
    record.row_hash = await sha256({ ...record, sync_marker: undefined });
    records.push(record);
  }
  return records;
}

async function synchronize(source: SheetSource, accessToken: string) {
  const startedAt = Date.now();
  const executionId = crypto.randomUUID();
  const marker = crypto.randomUUID();
  const lockResponse = await database('rpc/acquire_google_sheet_sync', {
    method: 'POST',
    body: JSON.stringify({ p_source: source, p_execution_id: executionId, p_lock_seconds: 110 }),
  });
  if (!(await lockResponse.json())) return { source, status: 'skipped', processed: 0 };

  await database('google_sheet_sync_logs', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ source, execution_id: executionId, status: 'running' }),
  });

  let processed = 0;
  try {
    const existing = await existingStatuses(source);
    const records = await normalize(source, accessToken, marker, existing);
    processed = records.length;
    if (records.length) {
      await database('google_sheet_requests?on_conflict=source,source_row', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(records),
      });
    }
    await database('rpc/mark_missing_google_sheet_requests', {
      method: 'POST',
      body: JSON.stringify({ p_source: source, p_sync_marker: marker, p_cutoff_at: cutoff }),
    });

    const counts = {
      completed: records.filter((row) => row.dashboard_status === 'completed').length,
      pending: records.filter((row) => ['pending', 'scheduled'].includes(row.dashboard_status)).length,
      notStarted: records.filter((row) =>
        ['not_completed', 'not_scheduled', 'no_contact', 'duplicate', 'other'].includes(row.dashboard_status)
      ).length,
    };
    const snapshotHash = await sha256(records.map((row) => ({
      source: row.source,
      source_row: row.source_row,
      requested_at: row.requested_at,
      requester_name: row.requester_name,
      sector: row.sector,
      job_title: row.job_title,
      training_topic: row.training_topic,
      source_status: row.source_status,
      dashboard_status: row.dashboard_status,
      status_updated_at: row.status_updated_at,
      completed_at: row.completed_at,
      sort_priority: row.sort_priority,
      row_hash: row.row_hash,
    })));
    const currentResponse = await database(
      `google_sheet_dashboard_snapshots?source=eq.${source}&select=snapshot_hash,snapshot_version`,
    );
    const current = (await currentResponse.json())?.[0];
    const version = current?.snapshot_hash === snapshotHash ? Number(current.snapshot_version || 1) :
      Number(current?.snapshot_version || 0) + 1;
    await database('google_sheet_dashboard_snapshots?on_conflict=source', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        source,
        total_count: records.length,
        completed_count: counts.completed,
        pending_count: counts.pending,
        not_started_count: counts.notStarted,
        snapshot_hash: snapshotHash,
        snapshot_version: version,
        integration_status: 'online',
        cutoff_at: cutoff,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    });
    const duration = Date.now() - startedAt;
    await database(`google_sheet_sync_logs?source=eq.${source}&execution_id=eq.${executionId}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        finished_at: new Date().toISOString(),
        status: 'success',
        records_processed: processed,
        duration_ms: duration,
      }),
    });
    await database('rpc/finish_google_sheet_sync', {
      method: 'POST',
      body: JSON.stringify({
        p_source: source,
        p_execution_id: executionId,
        p_success: true,
        p_records_processed: processed,
        p_duration_ms: duration,
      }),
    });
    return { source, status: 'success', processed };
  } catch (error) {
    const duration = Date.now() - startedAt;
    const message = error instanceof Error ? error.message.slice(0, 300) : 'Erro desconhecido';
    await database(`google_sheet_sync_logs?source=eq.${source}&execution_id=eq.${executionId}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        finished_at: new Date().toISOString(),
        status: 'error',
        records_processed: processed,
        error_message: message,
        duration_ms: duration,
      }),
    }).catch(() => undefined);
    await database('rpc/finish_google_sheet_sync', {
      method: 'POST',
      body: JSON.stringify({
        p_source: source,
        p_execution_id: executionId,
        p_success: false,
        p_records_processed: processed,
        p_duration_ms: duration,
        p_error_message: message,
      }),
    }).catch(() => undefined);
    return { source, status: 'error', processed, error: message };
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);
  const suppliedSyncKey = request.headers.get('X-Sync-Key') || '';
  const expectedSyncKey = env('GOOGLE_SHEETS_SYNC_KEY');
  if (!expectedSyncKey || suppliedSyncKey !== expectedSyncKey) {
    return json({ error: 'Não autorizado.' }, 401);
  }
  const credentials = env('GOOGLE_SERVICE_ACCOUNT_JSON_B64');
  if (!credentials) return json({ error: 'Credencial Google não configurada.' }, 503);
  try {
    const accessToken = await getGoogleAccessToken(credentials);
    const results = [];
    for (const source of ['timed', 'training', 'ad'] as const) {
      results.push(await synchronize(source, accessToken));
    }
    const ok = results.every((result) => result.status === 'success' || result.status === 'skipped');
    return json({ ok, results }, ok ? 200 : 502);
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : 'Falha na sincronização.';
    console.error('Google Sheets sync:', message);
    return json({ ok: false, error: message }, 502);
  }
});
