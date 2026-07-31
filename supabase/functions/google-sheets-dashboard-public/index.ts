import { getCurrentShiftRange } from '../_shared/google-sheets.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'apikey, authorization, if-none-match',
  'Access-Control-Expose-Headers': 'ETag, X-Snapshot-Version, X-Total-Count',
  'Access-Control-Max-Age': '86400',
};

function env(name: string) {
  return Deno.env.get(name)?.trim() || '';
}

function json(body: unknown, status: number, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, ...headers, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function matchesEtag(candidate: string | null, etag: string) {
  return Boolean(candidate?.split(',').some((value) => value.trim().replace(/^W\//, '') === etag));
}

function synchronizationStatus(lastSuccessAt: string | null) {
  const lastSuccess = lastSuccessAt ? new Date(lastSuccessAt).getTime() : Number.NaN;
  if (!Number.isFinite(lastSuccess)) return 'offline';
  const age = Date.now() - lastSuccess;
  if (age <= 180_000) return 'online';
  return age <= 900_000 ? 'delayed' : 'offline';
}

async function database(path: string) {
  const url = env('SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Configuração interna incompleta.');
  return fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact' },
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (!['GET', 'HEAD'].includes(request.method)) return json({ error: 'Método não permitido.' }, 405);
  const url = new URL(request.url);
  const source = url.searchParams.get('dashboard');
  if (!['timed', 'training', 'ad'].includes(source || '')) return json({ error: 'Dashboard inválido.' }, 400);
  const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get('page_size') || '50', 10) || 50));
  const offset = (page - 1) * pageSize;

  try {
    const snapshotResponse = await database(
      `google_sheet_dashboard_snapshots?source=eq.${source}&select=source,total_count,completed_count,pending_count,not_started_count,snapshot_hash,snapshot_version,integration_status,cutoff_at,last_synced_at`,
    );
    if (!snapshotResponse.ok) throw new Error(`Snapshot HTTP ${snapshotResponse.status}`);
    const snapshot = (await snapshotResponse.json())?.[0];
    if (!snapshot) {
      return json({ ok: false, state: 'not_ready', message: 'Dados ainda não sincronizados.' }, 503, {
        'Cache-Control': 'public, max-age=5',
        'Retry-After': '30',
      });
    }
    const syncStateResponse = await database(
      `google_sheet_sync_state?source=eq.${source}&select=last_success_at`,
    );
    if (!syncStateResponse.ok) throw new Error(`Sincronização HTTP ${syncStateResponse.status}`);
    const syncState = (await syncStateResponse.json())?.[0];
    const status = synchronizationStatus(syncState?.last_success_at || snapshot.last_synced_at);
    const nowValue = new Date().toISOString();
    const summaryResponse = await database(
      `rpc/get_google_sheet_dashboard_summary?p_source=${source}&p_now=${encodeURIComponent(nowValue)}`,
    );
    if (!summaryResponse.ok) throw new Error(`Resumo operacional HTTP ${summaryResponse.status}`);
    const operationalSummary = (await summaryResponse.json())?.[0];
    if (!operationalSummary) throw new Error('Resumo operacional ausente.');
    const shift = getCurrentShiftRange(new Date());
    const shiftEnd = shift.end.toISOString();
    const summaryVersion = [
      operationalSummary.total_count,
      operationalSummary.completed_count,
      operationalSummary.pending_count,
      operationalSummary.not_started_count,
    ].join('-');
    const etag = `"v2-${snapshot.snapshot_hash}-${summaryVersion}-${status}-${shiftEnd}-${page}-${pageSize}"`;
    const responseHeaders: Record<string, string> = {
      'Cache-Control': 'public, max-age=15, stale-while-revalidate=45',
      ETag: etag,
      Vary: 'If-None-Match',
      'X-Snapshot-Version': String(snapshot.snapshot_version),
      'X-Total-Count': String(operationalSummary.total_count),
    };
    if (matchesEtag(request.headers.get('If-None-Match'), etag)) {
      return new Response(null, { status: 304, headers: { ...corsHeaders, ...responseHeaders } });
    }
    if (request.method === 'HEAD') {
      return new Response(null, { status: 200, headers: { ...corsHeaders, ...responseHeaders } });
    }

    const fields = source === 'training'
      ? 'source_row,requested_at,requester_name,sector,job_title,training_topic,scheduled_at,completed_at,dashboard_status'
      : source === 'timed'
        ? 'source_row,requested_at,requester_name,sector,job_title,completed_at,dashboard_status,pending_reason'
        : 'source_row,requested_at,requester_name,job_title,sector,completed_at,dashboard_status';
    const now = encodeURIComponent(nowValue);
    const rowsResponse = await database(
      `google_sheet_requests?source=eq.${source}&is_source_present=eq.true` +
      `&or=(hidden_after_shift.is.null,hidden_after_shift.gt.${now})` +
      `&select=${fields}&order=sort_priority.asc,sort_key.asc,source_row.asc&offset=${offset}&limit=${pageSize}`,
    );
    if (!rowsResponse.ok) throw new Error(`Listagem HTTP ${rowsResponse.status}`);
    const rows = await rowsResponse.json();
    const contentRange = rowsResponse.headers.get('Content-Range') || '';
    const visibleTotal = Number.parseInt(contentRange.split('/')[1] || '', 10);
    const total = Number.isFinite(visibleTotal) ? visibleTotal : rows.length;
    return json({
      ok: true,
      dashboard: source,
      summary: {
        total: Number(operationalSummary.total_count),
        completed: Number(operationalSummary.completed_count),
        pending: Number(operationalSummary.pending_count),
        notStarted: Number(operationalSummary.not_started_count),
      },
      shift: {
        start: shift.start.toISOString(),
        end: shift.end.toISOString(),
        label: shift.label,
      },
      rows,
      page: { current: page, pageSize, total },
      status,
      cutoffAt: snapshot.cutoff_at,
      lastSyncedAt: snapshot.last_synced_at,
    }, 200, responseHeaders);
  } catch (error) {
    console.error('Dashboard Google Sheets:', error instanceof Error ? error.message.slice(0, 300) : 'erro');
    return json({ error: 'Dados temporariamente indisponíveis.' }, 503, { 'Cache-Control': 'no-store' });
  }
});
